# BUILD_PLAN.md — Splitwise Clone

---

## 1. Product Research

### How I studied Splitwise
Used Splitwise personally. Analysed the core user journey end-to-end: create a group → add an expense → split it → see who owes what → settle up. Everything in the app exists to serve this one loop.

### What I learned
- Core value loop: **Create group → Add expense → Split → See balances → Settle up → Repeat**
- 4 split types: equal, unequal, percentage, shares (ratios)
- Balances are pairwise — who owes whom inside a group
- "Settle up" is a payment record that reduces a balance
- Each expense has a chat thread for discussion
- Many Splitwise features (multi-currency, recurring expenses, receipt scanning, activity feed, debt simplification) are not part of the core loop

### Workflows identified
1. Auth — register → JWT cookie → session persists 7 days
2. Group — create → invite members by email → manage membership
3. Expense — add expense → select payer → choose split type → input amounts → save
4. Balances — pairwise per group + overall summary on dashboard
5. Settlement — click "Settle up" → pre-filled modal → record partial or full payment

### Product assumptions made
- Single currency (INR) — no conversion logic
- Group creator = admin, no admin transfer
- Pairwise balances only, no debt simplification algorithm
- Users must register before being added to a group (no invite email)
- Balance computed live at query time — not stored as running totals
- Payer can be excluded from the split

---

## 2. Architecture

### Tech Stack
| Layer | Choice | Reason |
|---|---|---|
| Frontend | React 18 + Vite + TailwindCSS | Fast dev server, SPA (app is behind auth wall), familiar |
| Routing | React Router v6 | Client-side SPA routing |
| HTTP | Axios + 401 interceptor | `withCredentials: true` for cookies; auto-redirect on auth failure |
| Real-time | Socket.io-client | Per-expense chat rooms |
| Backend | Node.js + Express 5 | Same language front/back, minimal boilerplate |
| ORM | Prisma 7 + `@prisma/adapter-pg` | Type-safe queries; Prisma 7 requires adapter for new JS client engine |
| Database | PostgreSQL | Relational (required by assignment), DECIMAL for money |
| Frontend deploy | Vercel | SPA hosting, auto-deploy from GitHub |
| Backend + DB deploy | Railway | Persistent Node.js process needed for Socket.io |

### Database Schema (7 tables)
`User` → `GroupMember` → `Group` → `Expense` → `ExpenseSplit` → `Payment` → `Message`

Key decisions:
- `expenses.paid_by` ≠ `expenses.created_by` — payer and recorder are separate fields
- `expense_splits` — one row per member; hard-deleted and recreated on expense edit
- `payments` — completely separate table from expenses (settlements ≠ expenses)
- Soft delete on `Group` and `Expense`; hard delete on `Payment` (no child records)
- `group_members.left_at` — soft exit; re-adding sets `left_at = NULL` (history preserved)

### API Design
RESTful, base `/api/v1`, consistent envelope: `{ success, data, error, details }`
Routes: `/auth/*`, `/groups/*`, `/expenses/*`, `/payments/*`, `/messages/*`

### Frontend Structure
```
client/src/
  contexts/   AuthContext (JWT + BroadcastChannel logout), SocketContext
  pages/      Login, Register, Dashboard, GroupDetail, ExpenseDetail
  components/ Navbar, ProtectedRoute, modals/ (Create/AddExpense/SettleUp)
  lib/        axios.js (instance + 401 interceptor with path exclusion)
```

### Deployment Approach
- Vercel for frontend. `client/vercel.json` with SPA rewrite rule required for React Router
- Railway for backend (Node.js) + PostgreSQL (internal networking, same project)
- `postinstall` script runs `prisma generate` at build time (Prisma 7 cannot generate at runtime on Railway)
- Migrations run via `prisma migrate deploy` on every server start
- Seed runs once manually after first deploy

---

## 3. AI Collaboration Process

### How I instructed the AI
Pasted the exact required prompt from the assignment. Instructed Claude to act as a junior engineer — interview me before building, not assume requirements, update `AI_CONTEXT.md` after every answer.

### What questions the AI asked
4 rounds of structured interview:
- **Round 1**: Product goals, Splitwise research, core workflows, personas, MVP scope, out-of-scope features, UX pain points with Splitwise
- **Round 2**: Auth persistence, cross-tab logout, group membership rules (leave/remove/delete), expense fields, settlements (separate table decision), balance calculation method
- **Round 3**: Tech stack choices, all 5 screens + layouts, add expense modal form flow, Socket.io cross-origin cookie auth, what is/isn't real-time
- **Round 4**: Specific UI layouts, edge cases (concurrent edits, mid-form removal), top 3 build risks, least confident decision, bug handling in live demo

### How I answered
Each answer covered PM reasoning (why this decision serves the product) + dev reasoning (implementation implications). Example: balance calculation — chose "live at query time" because correctness > speed at MVP scale, eliminates stale-data bugs entirely.

### How the plan evolved
- Timeline: 3-day scoped → 2-day
- Monorepo decided over two separate repos (one GitHub link for submission)
- Day 1 hard constraint: live URL accepting login before any frontend work
- Discovered during build: Prisma 7 requires `@prisma/adapter-pg` (breaking change from v5/v6)
- Discovered: Vercel returns 404 on all React Router routes without `vercel.json`
- Discovered: Axios 401 interceptor must exclude `/login` and `/register` paths

### How AI_CONTEXT.md was maintained
Updated after every interview round. Every implementation issue discovered during build was immediately added (Prisma 7 adapter, vercel.json, interceptor path fix). Grew from initial scope document to 700+ line source of truth.

---

## 4. Tradeoffs

### What I simplified
- **Balance computation**: live query (always correct) vs stored totals (faster but can drift). Chose live for accuracy.
- **Pairwise balances only**: skipped debt simplification graph algorithm — too risky in 2 days
- **No invite email**: users must self-register — eliminated email service entirely

### What I hardcoded
- 7-day JWT expiry (no refresh tokens)
- Last 50 messages per expense chat thread
- Demo seed: 3 users, 1 "Goa Trip" group, 4 expenses (all split types), 3 chat messages, 1 partial settlement

### What I avoided
| Feature | Reason |
|---|---|
| Debt simplification | Graph min-cash-flow algorithm — bug risk too high |
| Email notifications | Async queue + email service = full sub-system |
| Receipt scanning | File storage + OCR = full sub-system |
| Activity feed | Events table + real-time feed overhead |
| Recurring expenses | Cron/scheduler needed |
| Social login (OAuth) | Setup overhead for zero demo value |
| Multiple currencies | Rate API + conversion logic |

### What I would improve with more time
1. Stored running balance totals with cache invalidation (performance at scale)
2. Real-time expense list + balance updates via Socket.io group rooms
3. Debt simplification using min-cash-flow algorithm
4. Email notifications when someone adds an expense
5. Admin transfer (group creator handoff)
6. Server-side session store (logout from all devices)
7. Automated test suite (unit + integration)

---

## 5. Key Prompts Used

### Initial prompt (from assignment)
```
You are a junior engineer helping me complete an internship assignment.

The assignment is to reverse engineer Splitwise, scope a realistic 3-day version,
and build a working deployed app.

Important instructions:
1. Do not assume product requirements.
2. Do not jump directly into implementation.
3. Ask me detailed questions about product scope, UX, workflows, edge cases, and
   engineering decisions.
4. Ask about every implementation detail needed to build the app.
5. After each answer I give, update a Markdown file called AI_CONTEXT.md.
6. AI_CONTEXT.md must become the source of truth for the entire project.
7. The final app must be buildable from AI_CONTEXT.md.
8. Another evaluator should be able to paste AI_CONTEXT.md into the same AI tool
   and recreate a similar app.
9. Before writing code, produce a build plan based only on the agreed context.
10. During implementation, keep updating AI_CONTEXT.md whenever requirements,
    architecture, schema, UI, or logic changes.
11. Do not recommend technical solutions. Your job is to let me think through the
    technical solution.

Start by interviewing me across: product goals, Splitwise research, core workflows,
user personas, MVP scope, out-of-scope features, data model, authentication, groups,
expenses, settlements, balance calculation, UI screens, routing, frontend architecture,
backend architecture, database choice, API design, deployment, testing, known risks,
tradeoffs.

Do not give me a final plan until you have asked enough questions.
```

### Key follow-up prompts during build
- "start building" — triggered implementation after interview + plan approval
- "Continue from where you left off" — resumed build after interruptions
- Deployment debugging prompts: pasting Railway crash logs for diagnosis each time

---

## 6. Technical Build Timeline

| Time | Focus | Hard checkpoint |
|---|---|---|
| Day 1 AM | Monorepo + skeleton deploy | Cross-origin cookie auth verified in production |
| Day 1 PM | Full backend — all routes, Prisma, migrations | All API endpoints return correct responses |
| Day 1 EVE | Frontend auth + dashboard | Login → dashboard works on live URL |
| Day 2 AM | Group detail, Add expense (all 4 split types), balances | Balance numbers verified by hand |
| Day 2 PM | Socket.io chat, Settle up, seed script | Real-time chat works cross-origin |
| Day 2 EVE | Polish, test, finalize docs | All flows work end-to-end |

### Critical fixes discovered during build
1. **Prisma 7 + `@prisma/adapter-pg`** — `new PrismaClient()` throws without adapter
2. **`client/vercel.json`** — React Router needs rewrite rule or Vercel returns 404
3. **Axios 401 interceptor** — must skip redirect on `/login`/`/register` or page loops
4. **`postinstall` script** — `prisma generate` must run at build time on Railway
5. **Cookie config** — `SameSite=None; Secure` required for cross-origin cookie transmission


| Day | Focus | Hard checkpoint |
|---|---|---|
| Day 1 AM | Repo + infra + skeleton deploy | Cross-origin cookie auth verified in production |
| Day 1 PM | Full backend (all routes + Prisma) | All API endpoints return correct responses |
| Day 1 EVE | Frontend: auth + dashboard | Register → login → dashboard works on live URL |
| Day 2 AM | Frontend: group detail + expense form | All 4 split types work, balances display correctly |
| Day 2 PM | Frontend: chat + settle up + seed | Real-time chat works, settlements update balances |
| Day 2 EVE | Polish + test + docs | Every flow works end-to-end; README + AI_CONTEXT.md final |

---

## Day 1 — Morning: Repo, Infra, Skeleton Deploy

### Step 1 — Initialize monorepo
```bash
mkdir splitwise-clone && cd splitwise-clone
git init
mkdir client server
```

### Step 2 — Initialize frontend (client/)
```bash
cd client
npm create vite@latest . -- --template react
npm install
npm install react-router-dom axios socket.io-client
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
```

Configure `tailwind.config.js`:
```js
content: ["./index.html", "./src/**/*.{js,jsx}"]
```

Add to `src/index.css`:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

Create `client/.env`:
```
VITE_API_URL=http://localhost:3001/api/v1
VITE_SOCKET_URL=http://localhost:3001
```

### Step 3 — Initialize backend (server/)
```bash
cd server
npm init -y
npm install express cors cookie-parser jsonwebtoken bcryptjs prisma @prisma/client socket.io
npm install -D nodemon
npx prisma init
```

Configure `package.json` scripts:
```json
"scripts": {
  "dev": "nodemon server.js",
  "start": "node server.js",
  "seed": "node prisma/seed.js"
}
```

Create `server/.env`:
```
DATABASE_URL=postgresql://...
JWT_SECRET=dev-secret-change-in-production
CLIENT_URL=http://localhost:5173
PORT=3001
NODE_ENV=development
```

### Step 4 — Write Prisma schema
Copy the full schema from `AI_CONTEXT.md` Section 5 into `server/prisma/schema.prisma`.

Run initial migration:
```bash
npx prisma migrate dev --name init
npx prisma generate
```

### Step 5 — Skeleton Express server
`server/server.js`:
```js
const http = require('http');
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const { Server } = require('socket.io');

const app = express();
app.use(cors({ origin: process.env.CLIENT_URL, credentials: true }));
app.use(express.json());
app.use(cookieParser());

app.get('/health', (req, res) => res.json({ ok: true }));

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: process.env.CLIENT_URL, credentials: true }
});

server.listen(process.env.PORT || 3001, () =>
  console.log(`Server running on port ${process.env.PORT || 3001}`)
);
```

### Step 6 — Deploy skeletons (CRITICAL — do this before any features)

**Deploy backend to Railway:**
1. Push repo to GitHub
2. New Railway project → Deploy from GitHub → select repo → set root to `/server`
3. Add PostgreSQL service to same project → Railway auto-sets `DATABASE_URL`
4. Set env vars: `JWT_SECRET`, `CLIENT_URL` (Vercel URL — get it after Vercel deploy), `NODE_ENV=production`
5. Run migrations: Railway terminal → `npx prisma migrate deploy`

**Deploy frontend to Vercel:**
1. New Vercel project → import GitHub repo → set root directory to `/client`
2. Set env vars: `VITE_API_URL`, `VITE_SOCKET_URL` (Railway backend URL)
3. Deploy

**Verify cross-origin cookie (CHECKPOINT — do not proceed until this works):**
1. Open deployed Vercel URL
2. Register a test account via the health endpoint / browser console:
   ```js
   fetch('https://<railway-url>/api/v1/auth/register', {
     method: 'POST',
     headers: { 'Content-Type': 'application/json' },
     credentials: 'include',
     body: JSON.stringify({ name: 'Test', email: 't@t.com', password: '123456' })
   }).then(r => r.json()).then(console.log)
   ```
3. Then call `/auth/me` — confirm cookie is sent and user is returned
4. If cookie is NOT sent: check `SameSite=None; Secure` on the Set-Cookie header, `credentials: true` in both CORS configs

**If cookie auth fails completely:** switch to `Authorization: Bearer <token>` header stored in `localStorage`. Update `authenticate.js` middleware and Axios config accordingly. This is the fallback; prefer the cookie approach.

---

## Day 1 — Afternoon: Full Backend

### Step 7 — Auth middleware
`server/middleware/authenticate.js`:
```js
const jwt = require('jsonwebtoken');

module.exports = (req, res, next) => {
  const token = req.cookies.token;
  if (!token) return res.status(401).json({ success: false, error: 'Not authenticated' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.userId;
    next();
  } catch {
    res.status(401).json({ success: false, error: 'Invalid token' });
  }
};
```

Helper to set cookie (used in register and login):
```js
function setAuthCookie(res, token) {
  res.cookie('token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'None' : 'Lax',
    maxAge: 7 * 24 * 60 * 60 * 1000
  });
}
```

### Step 8 — Auth routes
`POST /api/v1/auth/register` — hash password, create user, sign JWT, set cookie
`POST /api/v1/auth/login` — verify password, sign JWT, set cookie
`POST /api/v1/auth/logout` — clear cookie
`GET /api/v1/auth/me` — read cookie, return user

### Step 9 — Balance query utility
`server/lib/balanceQuery.js` — write and test this **before any other route**.

The query computes pairwise net balance between every pair of users in a group:
```js
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function getGroupBalances(groupId) {
  const results = await prisma.$queryRaw`
    SELECT
      es.user_id         AS debtor_id,
      e.paid_by_id       AS creditor_id,
      COALESCE(SUM(es.amount_owed), 0)
        - COALESCE((
            SELECT SUM(p.amount)
            FROM payments p
            WHERE p.group_id = ${groupId}
              AND p.payer_id = es.user_id
              AND p.receiver_id = e.paid_by_id
          ), 0) AS net_owed
    FROM expense_splits es
    JOIN expenses e ON es.expense_id = e.id
    WHERE e.group_id = ${groupId}
      AND e.deleted_at IS NULL
      AND es.user_id != e.paid_by_id
    GROUP BY es.user_id, e.paid_by_id
    HAVING
      COALESCE(SUM(es.amount_owed), 0)
        - COALESCE((
            SELECT SUM(p.amount)
            FROM payments p
            WHERE p.group_id = ${groupId}
              AND p.payer_id = es.user_id
              AND p.receiver_id = e.paid_by_id
          ), 0) > 0
  `;
  return results;
}
```

**Test manually with seed data before building anything else.** Verify numbers match expected values by hand.

### Step 10 — canExitGroup utility
`server/lib/canExitGroup.js` — checks if a user can leave or be removed from a group (balance must be 0 in both directions).

### Step 11 — Groups routes
```
GET  /api/v1/groups                    — list groups for current user
POST /api/v1/groups                    — create group (also add creator as member)
GET  /api/v1/groups/:id                — group + active members
DELETE /api/v1/groups/:id              — soft delete; all balances must be zero
POST /api/v1/groups/:id/members        — add member by email
DELETE /api/v1/groups/:id/members/:userId — remove member; balance must be zero
```

Membership check helper (used on every group route):
```js
async function requireActiveMember(userId, groupId) {
  const m = await prisma.groupMember.findFirst({
    where: { groupId, userId, leftAt: null }
  });
  if (!m) throw { status: 403, message: 'You are not an active member of this group' };
}
```

### Step 12 — Expenses routes
```
GET  /api/v1/groups/:id/expenses   — list expenses, sorted expense_date DESC
POST /api/v1/groups/:id/expenses   — create expense + splits (in a transaction)
GET  /api/v1/expenses/:id          — expense + splits + paidBy user
PUT  /api/v1/expenses/:id          — update; delete old splits + insert new; post system message
DELETE /api/v1/expenses/:id        — soft delete; warn if payments exist
```

**Create expense + splits in a single Prisma transaction:**
```js
await prisma.$transaction([
  prisma.expense.create({ data: { ...expenseData } }),
  prisma.expenseSplit.createMany({ data: splitsArray })
]);
```

**Split calculation logic** (server-side, not just client-side validation):
- `equal`: `amount / memberCount` per member (round to 2dp; distribute remainder to first member)
- `unequal`: use amounts as-is; validate `SUM = amount`
- `percentage`: `(pct / 100) * amount` per member; validate `SUM(pct) = 100`
- `share`: `(shares / totalShares) * amount` per member; validate at least one share > 0

### Step 13 — Payments routes
```
POST   /api/v1/payments       — create settlement
DELETE /api/v1/payments/:id   — hard delete; creator or admin only
```

Validate `amount <= outstanding balance` on the server (query current balance before inserting).

### Step 14 — Balances route
```
GET /api/v1/groups/:id/balances — call getGroupBalances(), join with user names
```

### Step 15 — Messages routes
```
GET  /api/v1/expenses/:id/messages  — last 50 messages, oldest first
POST /api/v1/expenses/:id/messages  — save message + emit via Socket.io
```

### Step 16 — Error handler middleware
`server/middleware/errorHandler.js` — catch-all handler, consistent `{success: false, error, details}` format.

Wire up to Express last: `app.use(errorHandler)`.

### Step 17 — Wire all routes into server.js
```js
app.use('/api/v1/auth', require('./routes/auth'));
app.use('/api/v1/groups', authenticate, require('./routes/groups'));
app.use('/api/v1/expenses', authenticate, require('./routes/expenses'));
app.use('/api/v1/payments', authenticate, require('./routes/payments'));
app.use('/api/v1', authenticate, require('./routes/messages'));
app.use(errorHandler);
```

### Step 18 — Socket.io setup
`server/socket.js`:
```js
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

module.exports = (io) => {
  // Auth middleware
  io.use((socket, next) => {
    const raw = socket.request.headers.cookie ?? '';
    const token = raw.split('; ').find(c => c.startsWith('token='))?.split('=')[1];
    if (!token) return next(new Error('Unauthorized'));
    try {
      socket.user = jwt.verify(token, process.env.JWT_SECRET);
      next();
    } catch { next(new Error('Unauthorized')); }
  });

  io.on('connection', (socket) => {
    socket.on('join_expense', ({ expenseId }) => {
      socket.join(`expense:${expenseId}`);
    });

    socket.on('leave_expense', ({ expenseId }) => {
      socket.leave(`expense:${expenseId}`);
    });

    socket.on('send_message', async ({ expenseId, content }) => {
      const message = await prisma.message.create({
        data: { expenseId, userId: socket.user.userId, content, type: 'user' },
        include: { user: { select: { id: true, name: true } } }
      });
      io.to(`expense:${expenseId}`).emit('new_message', {
        id: message.id,
        userId: message.userId,
        userName: message.user.name,
        content: message.content,
        type: message.type,
        createdAt: message.createdAt
      });
    });
  });
};
```

In `server.js`: `require('./socket')(io);`

### Step 19 — Deploy and smoke-test backend (CHECKPOINT)
Push to GitHub → Railway auto-deploys.

Test every endpoint with a REST client (Bruno/Postman/curl):
- [ ] `POST /auth/register` → 201, cookie set
- [ ] `GET /auth/me` → 200, user returned (cookie sent from client)
- [ ] `POST /groups` → 201
- [ ] `POST /groups/:id/expenses` (equal split) → 201, splits created
- [ ] `GET /groups/:id/balances` → correct numbers (verify by hand)
- [ ] `POST /payments` → 201, balance decreases
- [ ] `GET /expenses/:id/messages` → 200

Do not proceed to frontend until all backend endpoints return correct responses.

---

## Day 1 — Evening: Frontend Auth + Dashboard

### Step 20 — Axios instance
`client/src/lib/axios.js`:
```js
import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  withCredentials: true  // send cookie on every request
});

api.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401) {
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export default api;
```

### Step 21 — AuthContext
`client/src/contexts/AuthContext.jsx`:
- On mount: call `GET /auth/me`; store `{id, name, email}` in state
- `loading` state: show spinner until `/auth/me` resolves
- `login(user)`, `logout()` methods
- `BroadcastChannel` listener for cross-tab logout

### Step 22 — ProtectedRoute
```jsx
const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return <Spinner />;
  if (!user) return <Navigate to="/login" replace />;
  return children;
};
```

### Step 23 — React Router setup
`client/src/main.jsx`:
```jsx
<BrowserRouter>
  <AuthProvider>
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/groups/:groupId" element={<ProtectedRoute><GroupDetail /></ProtectedRoute>} />
      <Route path="/groups/:groupId/expenses/:expenseId"
             element={<ProtectedRoute><ExpenseDetail /></ProtectedRoute>} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  </AuthProvider>
</BrowserRouter>
```

### Step 24 — Login + Register pages
Both are simple centered forms. On success: redirect to `/dashboard`.

### Step 25 — Dashboard page (basic)
- `GET /api/v1/groups` on mount
- Three balance summary cards (You owe / You are owed / Net)
  - Compute from group balances or add a `/api/v1/users/me/balances` endpoint for the aggregate
- Group cards grid — each shows name, member count, your balance
- "Create group" button → `CreateGroupModal`
- Empty state if no groups

### Step 26 — CreateGroupModal
Two fields: name (required), description (optional). `POST /api/v1/groups` on submit. Refresh group list on success.

### Step 27 — Day 1 end checkpoint
Verify on the live Vercel URL:
- [ ] Register a new account
- [ ] Log in
- [ ] Dashboard loads with correct balance summary (₹0 for new user)
- [ ] Create a group
- [ ] Group appears in list
- [ ] Log out → redirected to login
- [ ] Open second tab → log out of first → second tab redirects too (BroadcastChannel)

If all pass: Day 1 is complete.

---

## Day 2 — Morning: Group Detail + Expense Form + Balances

### Step 28 — GroupContext
`client/src/contexts/GroupContext.jsx`:
- Stores: `group`, `members`, `expenses`, `balances`
- `refresh()` function: re-fetches all four on any mutation
- Set from `GroupDetail` page on mount

### Step 29 — GroupDetail page
Layout (single scroll, no tabs):
1. Group header (name, description, "Add expense" + "Settle up" buttons)
2. Group balances section (compact balance rows + inline "Settle up" button per row; "All balances cleared ✓" when zero)
3. Members section (horizontal avatar row; "Add member" button; admin badge on creator)
4. Expense list (sorted by `expense_date DESC`; each card clickable → expense detail)

Wire: `GET /api/v1/groups/:id`, `GET /api/v1/groups/:id/expenses`, `GET /api/v1/groups/:id/balances` on mount.

### Step 30 — Add member flow
"Add member" opens a small inline form or modal. Email input → `POST /api/v1/groups/:id/members`. Show "user not found" error on 404.

### Step 31 — AddExpenseModal (most complex component)
Form fields in order:
1. Description (text, required)
2. Amount (number, required, > 0)
3. Date (date input, `max={today}`, defaults today)
4. Paid by (dropdown of active members, defaults to self)
5. Split type (4 toggle buttons: Equal / Unequal / Percentage / Shares)
6. Dynamic split section (see below)
7. Notes (optional textarea)
8. Cancel / Save buttons

**Dynamic split sections:**

`Equal`:
```jsx
// Checkboxes for each member; all checked by default
// Live: "₹{amount / checkedCount} per person ({checkedCount} people)"
```

`Unequal`:
```jsx
// Number input per member
// Live counter: "Remaining: ₹{amount - sum} of ₹{amount}"
// Save disabled if remaining !== 0
```

`Percentage`:
```jsx
// Number input (% suffix) per member
// Live counter: "Remaining: {100 - sum}% of 100%"
// Save disabled if sum !== 100
```

`Shares`:
```jsx
// Number input per member (default 1)
// Live: show "X shares = ₹{(shares/totalShares)*amount}" beside each
// Save disabled if all shares = 0
```

**On submit:** build `splits[]` array from form state, `POST /api/v1/groups/:id/expenses`. Call `GroupContext.refresh()` on success.

### Step 32 — ExpenseDetail page
Layout:
1. Expense header (description, amount, date, "Paid by [Name]" badge, split type badge, Edit/Delete for creator or admin)
2. Split breakdown table (Member | Split detail | Amount owed) — middle column changes per split type; payer row shows "Paid" badge
3. Notes (if present)
4. Chat section (initial fetch of last 50 messages via REST; Socket.io handles new messages)

### Step 33 — Edit expense flow
"Edit" button opens `EditExpenseModal` (same component as `AddExpenseModal`, pre-filled). `PUT /api/v1/expenses/:id` on submit. System message appears in chat automatically.

### Step 34 — Balance display correctness check (CHECKPOINT)
Before moving on, manually verify:
1. Add "Dinner ₹2000, paid by demo1, equal split 4 ways" with all 3 demo users + self
2. `GET /api/v1/groups/:id/balances` → each person should owe demo1 ₹500
3. Record a ₹200 partial payment from demo2 to demo1
4. Balance for demo2 → demo1 should now show ₹300
5. If numbers are wrong: fix `balanceQuery.js` before proceeding

---

## Day 2 — Afternoon: Chat + Settle Up + Seed

### Step 35 — SocketContext
`client/src/contexts/SocketContext.jsx`:
```jsx
const SocketContext = createContext();

export const SocketProvider = ({ children }) => {
  const { user } = useAuth();
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    if (!user) return;
    const s = io(import.meta.env.VITE_SOCKET_URL, { withCredentials: true });
    setSocket(s);
    return () => s.disconnect();
  }, [user]);

  return <SocketContext.Provider value={socket}>{children}</SocketContext.Provider>;
};
```

Wrap `App` with `<SocketProvider>` after `<AuthProvider>`.

### Step 36 — Chat in ExpenseDetail
On mount:
1. `GET /api/v1/expenses/:id/messages` → set initial messages state
2. `socket.emit('join_expense', { expenseId })`
3. `socket.on('new_message', msg => setMessages(prev => [...prev, msg]))`

On unmount:
1. `socket.emit('leave_expense', { expenseId })`
2. `socket.off('new_message')`

On send:
1. `socket.emit('send_message', { expenseId, content })`
2. Message appears in chat when server broadcasts `new_message` back (no optimistic update)

Message rendering:
- `type === 'user'`: avatar + name + content + timestamp
- `type === 'system'`: grey, centered, italic, no avatar

### Step 37 — Test chat cross-origin (CHECKPOINT)
Open two browser tabs with different demo accounts. Send a message in one — it must appear instantly in the other. If Socket.io doesn't connect, check browser DevTools Network tab for WebSocket connection errors.

Common failure points:
- `withCredentials: true` missing on client
- `credentials: true` missing in Socket.io server CORS
- Cookie `SameSite=None; Secure` not set correctly

### Step 38 — SettleUpModal
Triggered from "Settle up" button on a balance row. Pre-filled with:
- Payer = logged-in user (or any user for admin)
- Receiver = the creditor from that balance row
- Amount = full outstanding balance

Live "Remaining after this: ₹X" counter as user types.
Validation: `0 < amount <= outstanding balance`.

`POST /api/v1/payments` on submit. Call `GroupContext.refresh()` to update balances.

### Step 39 — Payment history in GroupDetail
Below the balance cards: a collapsible "Payment history" section listing all payments with delete option (for creator or admin).

### Step 40 — Seed script
`server/prisma/seed.js`:
```js
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

async function main() {
  // Idempotent: check before creating
  const existingUser = await prisma.user.findUnique({ where: { email: 'demo1@test.com' } });
  if (existingUser) { console.log('Seed data exists'); return; }

  const hash = await bcrypt.hash('password123', 10);

  // Create 3 demo users
  const [u1, u2, u3] = await Promise.all([
    prisma.user.create({ data: { name: 'Priya', email: 'demo1@test.com', passwordHash: hash } }),
    prisma.user.create({ data: { name: 'Rahul', email: 'demo2@test.com', passwordHash: hash } }),
    prisma.user.create({ data: { name: 'Amit', email: 'demo3@test.com', passwordHash: hash } }),
  ]);

  // Create group
  const group = await prisma.group.create({
    data: {
      name: 'Goa Trip',
      description: 'June 2026 trip expenses',
      createdBy: u1.id,
      members: {
        create: [{ userId: u1.id }, { userId: u2.id }, { userId: u3.id }]
      }
    }
  });

  // Expense 1: Equal split — Rahul paid dinner ₹2400
  const e1 = await prisma.expense.create({
    data: {
      groupId: group.id, description: 'Dinner at Beach Shack',
      amount: 2400, paidById: u2.id, createdById: u2.id,
      splitType: 'equal', expenseDate: new Date('2026-06-15'),
      splits: {
        create: [
          { userId: u1.id, amountOwed: 800 },
          { userId: u3.id, amountOwed: 800 },
          // Rahul (payer) owes nothing — not included or included at 0
        ]
      }
    }
  });

  // Expense 2: Unequal — Priya paid hotel ₹6000
  const e2 = await prisma.expense.create({
    data: {
      groupId: group.id, description: 'Hotel (2 nights)',
      amount: 6000, paidById: u1.id, createdById: u1.id,
      splitType: 'unequal', expenseDate: new Date('2026-06-15'),
      splits: {
        create: [
          { userId: u2.id, amountOwed: 2500 },
          { userId: u3.id, amountOwed: 2000 },
        ]
      }
    }
  });

  // Expense 3: Percentage — Amit paid cabs ₹1500
  const e3 = await prisma.expense.create({
    data: {
      groupId: group.id, description: 'Airport cabs',
      amount: 1500, paidById: u3.id, createdById: u3.id,
      splitType: 'percentage', expenseDate: new Date('2026-06-16'),
      splits: {
        create: [
          { userId: u1.id, amountOwed: 600 }, // 40%
          { userId: u2.id, amountOwed: 450 }, // 30%
          // Amit (payer) owes 30% = ₹450 but that stays with himself
        ]
      }
    }
  });

  // Expense 4: Shares — Rahul paid groceries ₹900 (2:1:1)
  const e4 = await prisma.expense.create({
    data: {
      groupId: group.id, description: 'Groceries',
      amount: 900, paidById: u2.id, createdById: u2.id,
      splitType: 'share', expenseDate: new Date('2026-06-17'),
      splits: {
        create: [
          { userId: u1.id, amountOwed: 450 }, // 2 shares
          { userId: u3.id, amountOwed: 225 }, // 1 share
          // Rahul has 1 share but as payer doesn't appear in splits
        ]
      }
    }
  });

  // Chat messages on expense 1
  await prisma.message.createMany({
    data: [
      { expenseId: e1.id, userId: u1.id, content: 'Amazing dinner! Worth every rupee.' },
      { expenseId: e1.id, userId: u3.id, content: 'Totally agree. Will settle up next week.' },
    ]
  });

  // Partial settlement: Amit pays Priya ₹500 (partial toward hotel)
  await prisma.payment.create({
    data: { groupId: group.id, payerId: u3.id, receiverId: u1.id, amount: 500, note: 'Partial hotel payment' }
  });

  console.log('Seed complete');
}

main().catch(console.error).finally(() => prisma.$disconnect());
```

Add to `server/package.json`:
```json
"prisma": { "seed": "node prisma/seed.js" }
```

Run once after deployment: `npm run seed`

---

## Day 2 — Evening: Polish, Testing, Docs

### Step 41 — Full end-to-end manual test checklist

**Auth:**
- [ ] Register new account → redirected to dashboard
- [ ] Log out → redirected to login
- [ ] Log in with demo credentials → dashboard with seeded data
- [ ] Open two tabs, log out of one → both redirect instantly (BroadcastChannel)
- [ ] Try accessing `/dashboard` without being logged in → redirected to login

**Groups:**
- [ ] Create a group (name + description)
- [ ] Add a member by email (existing user)
- [ ] Try to add a non-existent email → "user not found"
- [ ] Navigate to group → see members, expenses, balances

**Expenses — all 4 split types:**
- [ ] Add equal split expense → balances update
- [ ] Add unequal split → live remaining counter → save disabled until sum matches
- [ ] Add percentage split → live remaining % → save disabled until 100%
- [ ] Add shares split → calculated amounts shown → saves correctly
- [ ] Edit an expense (change amount) → splits recalculated → system message in chat
- [ ] Delete an expense → balances update

**Balances:**
- [ ] Group balances show correct pairwise amounts
- [ ] Dashboard overall summary shows correct totals
- [ ] After settlement, balance decreases correctly
- [ ] After expense deletion, balance updates

**Settle up:**
- [ ] Settle full amount → balance goes to ₹0
- [ ] Settle partial amount → balance decreases by partial amount
- [ ] "Remaining after this" counter updates live in modal
- [ ] Cannot overpay (amount > outstanding blocked)
- [ ] Delete a payment → balance goes back up

**Chat:**
- [ ] Open expense → chat loads last 50 messages
- [ ] Send message → appears in chat
- [ ] Open same expense in second tab (different user) → message appears in real-time
- [ ] Edit expense → system message auto-appears in chat

**Error states:**
- [ ] Navigate to `/groups/nonexistent-id` → "Group not found" message with back button
- [ ] Expired/cleared cookie → 401 → redirected to login

### Step 42 — README.md
```markdown
# Splitwise Clone

A full-stack expense splitting app built in 2 days.

## Live Demo
[https://splitwise-clone.vercel.app](https://your-url.vercel.app)

## Demo Credentials
| Email | Password |
|---|---|
| demo1@test.com | password123 |
| demo2@test.com | password123 |
| demo3@test.com | password123 |

**Demo group:** "Goa Trip" — pre-loaded with expenses across all 4 split types, chat messages, and partial settlements.

## Features
- Auth: register/login with email + password (JWT in httpOnly cookie)
- Groups: create, invite members, manage
- Expense splitting: 4 types (equal, unequal, percentage, shares) + real-time chat per expense
- Balances: live pairwise balance calculation + settle up with partial payment support

## Tech Stack
- **Frontend:** React 18 + Vite + TailwindCSS + React Router v6
- **Backend:** Node.js + Express + Prisma
- **Database:** PostgreSQL (Railway)
- **Real-time:** Socket.io
- **Deploy:** Vercel (frontend) + Railway (backend + DB)

## Run Locally

### Prerequisites
- Node.js 18+
- PostgreSQL database

### Setup
\`\`\`bash
git clone https://github.com/your-username/splitwise-clone
cd splitwise-clone

# Backend
cd server
cp .env.example .env    # fill in DATABASE_URL and JWT_SECRET
npm install
npx prisma migrate dev
npm run seed             # loads demo data once
npm run dev              # runs on port 3001

# Frontend (new terminal)
cd client
cp .env.example .env    # set VITE_API_URL=http://localhost:3001/api/v1
npm install
npm run dev              # runs on port 5173
\`\`\`

## Design Decisions
See [AI_CONTEXT.md](./AI_CONTEXT.md) for full product and technical decisions.
See [BUILD_PLAN.md](./BUILD_PLAN.md) for the build sequence.
```

### Step 43 — Final AI_CONTEXT.md update
After every feature is built and tested, review `AI_CONTEXT.md`:
- Update any schema fields that changed during implementation
- Update any API route that changed
- Mark all "Open Questions" sections as resolved
- Add a "What was actually built" section confirming what shipped vs. what was planned

---

## Risk Checkpoints Summary

| When | What to verify | Fallback |
|---|---|---|
| Day 1 AM (after deploy) | Cross-origin cookie auth works end-to-end | Switch to Authorization header + localStorage |
| Day 1 PM (after backend) | Balance query returns correct numbers | Fix SQL before building any frontend |
| Day 2 AM (after expenses) | All 4 split types calculate correctly | Fix calculation logic before settle up |
| Day 2 PM (after chat) | Socket.io real-time works cross-origin | Fall back to 3-second polling |
| Day 2 EVE | All 41 checklist items pass | Prioritize core loop; cut polish |

---

*This plan is derived entirely from `AI_CONTEXT.md`. If you change a decision there, update this plan.*
