# AI_CONTEXT.md — Splitwise Clone (Internship Assignment)

> **This file is the single source of truth for the entire project.**
> Every product decision, architecture choice, schema definition, API contract, and UI behavior
> is documented here. Another engineer should be able to paste this file into an AI tool
> and recreate a functionally equivalent app.

---

## 0. Assignment Meta

| Field | Value |
|---|---|
| Assignment | Reverse-engineer Splitwise, scope a 2-day version, build and deploy it |
| Timeline | 2 days |
| Candidate role | Acting as both PM and full-stack developer |
| Primary deliverable | Live deployed public URL (non-negotiable) |
| Secondary deliverables | GitHub repo (public), AI_CONTEXT.md, BUILD_PLAN.md |
| Evaluation criteria | Live app works end-to-end, code review quiz, AI_CONTEXT.md reproducibility test |

### Reproducibility requirement
The evaluator will paste `AI_CONTEXT.md` into the same AI tool and attempt to rebuild the app.
The recreated app must match: submitted code + deployed app + this document.

---

## 1. Product Goals

### Core value loop
```
Create group → Add expense → Split it → See balances → Settle up → Repeat
```
All 4 features map directly to this loop. Nothing is built outside it.

### Scoping rule
> If removing a feature **breaks the loop** → **in scope**.
> If removing it just makes the experience **less polished** → **out of scope for 2 days**.

---

## 2. Features In Scope

### 2.1 Authentication
- Register with email + password (fields: name, email, password)
- Log in with email + password
- All app routes behind authentication; public routes: `/login`, `/register` only
- Persistence: JWT in httpOnly cookie, 7-day expiry, `SameSite=None; Secure=true` (required for cross-origin)
- Session check: `GET /api/v1/auth/me` on every app load → result stored in `AuthContext`
- Logout: `POST /api/v1/auth/logout` → server clears cookie → `BroadcastChannel('auth').postMessage('logout')` → all tabs redirect to `/login`
- 401 handling: global Axios interceptor catches any 401 → redirects to `/login` **only if current path is not `/login` or `/register`** (without this check, the `/auth/me` call on the login page returns 401 and causes an infinite redirect loop)
- No refresh token; no logout-from-all-devices (known limitation)

### 2.2 Group Management
- Create group: **name** (required, max 100 chars) + **description** (optional, max 255 chars)
- No category field
- Invite by email: search registered users only; "user not found" if email unregistered; no invite email sent
- One group creator = admin
- Admin can remove members (precondition: member balance = 0; modal shows exact blocking debts)
- Any member can leave voluntarily (precondition: own balance = 0)
- Group creator cannot leave — can only delete the group
- Group deletion: admin only, ALL member balances = 0, two-step UX (type exact group name to confirm), soft delete
- Soft exit: `left_at` timestamp on `group_members` row; re-adding restores history (`left_at = NULL`)
- Server-side membership check on every group action — being mid-form when removed results in 403 on submit

### 2.3 Expense Splitting (4 types) + Real-time Chat

**4 split types:**
1. **Equal** — checkboxes per member (all checked by default); auto-calculates "₹500 per person (4 people)"
2. **Unequal** — number input per member; live "Remaining: ₹X of ₹Y" counter; Save disabled until remaining = 0
3. **Percentage** — number input with % suffix per member; live "Remaining: X% of 100%"; Save disabled until = 100%
4. **Shares** — number input per member (default 1); shows "2 shares = ₹1000" beside each; save disabled if all shares = 0

**paid_by vs created_by:**
- `paid_by` = who paid (dropdown of active group members; defaults to logged-in user)
- `created_by` = who entered the record (always logged-in user; drives edit/delete permissions)
- Payer can be excluded from the split

**Expense fields:**

| Field | Type | Required | Notes |
|---|---|---|---|
| description | VARCHAR(255) | Yes | Placeholder: "What was this expense for?" |
| amount | DECIMAL(10,2) | Yes | > 0; placeholder: "₹0.00" |
| paid_by | UUID → users | Yes | Dropdown; defaults to self |
| split_type | ENUM | Yes | 4 toggle buttons; default: Equal |
| expense_date | DATE | Yes | Defaults today; backdate allowed; future blocked via HTML `max` attr |
| notes | TEXT | No | Optional one-liner; chat serves deeper discussion |
| group_id | UUID | Auto | From route context |
| created_by | UUID | Auto | Logged-in user |
| created_at | TIMESTAMP | Auto | Immutable |
| deleted_at | TIMESTAMP | Auto | Soft delete |

**Add Expense modal — field order:**
1. Description
2. Amount
3. Date (date picker, max=today)
4. Paid by (dropdown)
5. Split type (4 toggle buttons — Equal default)
6. Dynamic split section (changes based on toggle selection)
7. Notes (optional textarea, collapsible)
8. Cancel / Save expense buttons (Save disabled until validation passes)

All validation is client-side with instant feedback.

**Editing:** creator or group admin only; all fields editable except `group_id`, `created_by`, `created_at`; amount/split change → hard-delete old `expense_splits` + insert new; system message auto-posted in chat on edit.

**Deleting:** creator or group admin; soft delete; warning if related payments exist; balances auto-correct on next query.

**Real-time chat:**
- Socket.io, room = `expense:{expenseId}`
- REST: `GET /api/v1/expenses/:id/messages` loads last 50 messages on page open
- Socket.io handles only new messages after initial fetch
- Chat visible below split breakdown — no scrolling required to see it
- Message count badge on expense list items
- `type = 'system'` messages (edit notifications) rendered grey/centered, no avatar

### 2.4 Balance Summary + Settlement

**Balance calculation: computed live at query time (not stored)**

```sql
-- Net balance for user X towards user Y in group G
WITH owed AS (
  SELECT COALESCE(SUM(es.amount_owed), 0) AS total
  FROM expense_splits es
  JOIN expenses e ON es.expense_id = e.id
  WHERE e.group_id = :group_id
    AND e.deleted_at IS NULL
    AND es.user_id = :user_x
    AND e.paid_by = :user_y
),
paid AS (
  SELECT COALESCE(SUM(p.amount), 0) AS total
  FROM payments p
  WHERE p.group_id = :group_id
    AND p.payer_id = :user_x
    AND p.receiver_id = :user_y
)
SELECT owed.total - paid.total AS net_balance FROM owed, paid;
```

**Group balances view:** pairwise, no debt simplification; "Settle up" button inline on every balance row; "All balances cleared ✓" green message when all zero.

**Individual summary on Dashboard:**
- Three cards: "You owe" (red), "You are owed" (green), "Net balance" (red/green)
- Aggregated across all active (non-deleted) groups

**Payments table (separate from expenses):**

| Field | Type | Notes |
|---|---|---|
| id | UUID | PK |
| group_id | UUID → groups | |
| payer_id | UUID → users | |
| receiver_id | UUID → users | |
| amount | DECIMAL(10,2) | > 0 |
| note | VARCHAR(255) | Optional |
| created_at | TIMESTAMP | Auto |

- Partial settlements fully supported — balance math handles any amount ≤ outstanding
- Settle up modal: pre-filled full amount; user adjusts down; live "Remaining after this: ₹X"; cannot overpay or enter ≤ 0
- Admin can settle on behalf of others (any payer_id allowed for admins)
- Deletable (hard delete, no child records); not editable (delete + recreate)

---

## 3. Features Explicitly Out of Scope

| Feature | Reason |
|---|---|
| Multiple currencies | Adds conversion logic and rate API |
| Recurring expenses | Needs scheduler/cron |
| Receipt scanning / image upload | Full sub-system (file storage + OCR) |
| Activity feed | Events table + real-time feed overhead |
| Email notifications | Email service + async queue |
| Debt simplification algorithm | Graph optimization; bug risk in 2 days |
| Social login | Email+password sufficient |
| Friends list outside groups | All context scoped to groups |
| Group/expense categories | No loop impact; cosmetic |
| Archive/restore groups | Soft delete is the archive |

---

## 4. Users & Testing

### Demo credentials (in README)
```
demo1@test.com / password123
demo2@test.com / password123
demo3@test.com / password123
```

### Pre-seeded group: "Goa Trip"
- All 3 demo users as members
- 5-6 expenses covering all 4 split types
- Chat messages on at least one expense
- Mix of settled and pending balances

### Seed script
- `npm run seed` (runs `prisma/seed.js`)
- Run **once manually** after first deployment
- Idempotent: checks if demo users exist before inserting
- Never runs automatically on deploy or server restart

### Testing approach
- Evaluator: register fresh OR log in with demo credentials
- Developer: 2-3 browser tabs, different demo accounts, verifying real-time chat
- No automated test suite for MVP

---

## 5. Data Model (Prisma Schema)

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id           String   @id @default(uuid())
  name         String
  email        String   @unique
  passwordHash String
  createdAt    DateTime @default(now())

  groupsCreated  Group[]        @relation("GroupCreator")
  groupMembers   GroupMember[]
  expensesPaid   Expense[]      @relation("ExpensePaidBy")
  expensesLogged Expense[]      @relation("ExpenseCreatedBy")
  expenseSplits  ExpenseSplit[]
  paymentsSent   Payment[]      @relation("PaymentPayer")
  paymentsRecv   Payment[]      @relation("PaymentReceiver")
  messages       Message[]
}

model Group {
  id          String    @id @default(uuid())
  name        String
  description String?
  createdBy   String
  creator     User      @relation("GroupCreator", fields: [createdBy], references: [id])
  createdAt   DateTime  @default(now())
  deletedAt   DateTime?

  members  GroupMember[]
  expenses Expense[]
  payments Payment[]
}

model GroupMember {
  id       String    @id @default(uuid())
  groupId  String
  userId   String
  joinedAt DateTime  @default(now())
  leftAt   DateTime?

  group Group @relation(fields: [groupId], references: [id])
  user  User  @relation(fields: [userId], references: [id])

  @@unique([groupId, userId])
}

model Expense {
  id          String    @id @default(uuid())
  groupId     String
  description String
  amount      Decimal   @db.Decimal(10, 2)
  paidById    String
  createdById String
  splitType   String
  expenseDate DateTime  @db.Date
  notes       String?
  createdAt   DateTime  @default(now())
  deletedAt   DateTime?

  group     Group          @relation(fields: [groupId], references: [id])
  paidBy    User           @relation("ExpensePaidBy", fields: [paidById], references: [id])
  createdBy User           @relation("ExpenseCreatedBy", fields: [createdById], references: [id])
  splits    ExpenseSplit[]
  messages  Message[]
}

model ExpenseSplit {
  id         String  @id @default(uuid())
  expenseId  String
  userId     String
  amountOwed Decimal @db.Decimal(10, 2)

  expense Expense @relation(fields: [expenseId], references: [id])
  user    User    @relation(fields: [userId], references: [id])
}

model Payment {
  id         String   @id @default(uuid())
  groupId    String
  payerId    String
  receiverId String
  amount     Decimal  @db.Decimal(10, 2)
  note       String?
  createdAt  DateTime @default(now())

  group    Group @relation(fields: [groupId], references: [id])
  payer    User  @relation("PaymentPayer", fields: [payerId], references: [id])
  receiver User  @relation("PaymentReceiver", fields: [receiverId], references: [id])
}

model Message {
  id        String   @id @default(uuid())
  expenseId String
  userId    String?
  content   String
  type      String   @default("user")
  createdAt DateTime @default(now())

  expense Expense @relation(fields: [expenseId], references: [id])
  user    User?   @relation(fields: [userId], references: [id])
}
```

---

## 6. Permission Rules

| Action | Who | Precondition |
|---|---|---|
| Edit expense | Creator or admin | None |
| Delete expense | Creator or admin | Warning if payments exist |
| Delete payment | Payment creator or admin | None |
| Remove member | Admin | Member balance = 0 |
| Leave group | Any member | Own balance = 0 |
| Delete group | Creator/admin | ALL balances = 0 |
| Settle on behalf | Admin | None |

Shared utility: `canExitGroup(userId, groupId)` — used by both leave and remove endpoints.

---

## 7. Tech Stack

### Frontend
| Concern | Choice |
|---|---|
| Framework | React 18 + Vite |
| Styling | TailwindCSS |
| Routing | React Router v6 |
| HTTP | Axios (global 401 interceptor) |
| Real-time | Socket.io-client (`withCredentials: true`) |
| Global state | React Context: AuthContext, GroupContext, SocketContext |
| Local state | useState per component (forms, modals, loaders) |

### Backend
| Concern | Choice |
|---|---|
| Runtime | Node.js |
| Framework | Express 5 |
| ORM | Prisma 7 (`prisma-client-js` generator, `@prisma/adapter-pg` required) |
| DB Adapter | `@prisma/adapter-pg` + `pg` — **required by Prisma 7's new client engine** |
| Auth | bcrypt (hashing) + jsonwebtoken (JWT) |
| Cookie | cookie-parser |
| CORS | `cors` package, `credentials: true`, `origin: CLIENT_URL` (exact URL, not wildcard) |
| Real-time | Socket.io (same process and port as Express) |

**Critical Prisma 7 note:** Prisma 7 requires a database adapter — `new PrismaClient()` without one throws `PrismaClientInitializationError`. Always initialize as:
```js
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });
```

### Database
| Concern | Choice |
|---|---|
| Engine | PostgreSQL |
| Host | Railway (same project as backend — internal networking) |

---

## 8. Project Structure

```
/
├── client/
│   ├── src/
│   │   ├── contexts/
│   │   │   ├── AuthContext.jsx
│   │   │   ├── GroupContext.jsx
│   │   │   └── SocketContext.jsx
│   │   ├── pages/
│   │   │   ├── Login.jsx
│   │   │   ├── Register.jsx
│   │   │   ├── Dashboard.jsx
│   │   │   ├── GroupDetail.jsx
│   │   │   └── ExpenseDetail.jsx
│   │   ├── components/
│   │   │   ├── ProtectedRoute.jsx
│   │   │   └── modals/
│   │   │       ├── CreateGroupModal.jsx
│   │   │       ├── AddExpenseModal.jsx
│   │   │       ├── EditExpenseModal.jsx
│   │   │       └── SettleUpModal.jsx
│   │   ├── lib/
│   │   │   └── axios.js
│   │   └── main.jsx
│   └── .env
│
└── server/
    ├── routes/
    │   ├── auth.js
    │   ├── groups.js
    │   ├── expenses.js
    │   ├── payments.js
    │   └── messages.js
    ├── controllers/
    ├── middleware/
    │   ├── authenticate.js
    │   └── errorHandler.js
    ├── lib/
    │   ├── balanceQuery.js
    │   └── canExitGroup.js
    ├── prisma/
    │   ├── schema.prisma
    │   └── seed.js
    ├── socket.js
    └── server.js
```

---

## 9. Routes & Screens

### Frontend routes
| Route | Page | Auth |
|---|---|---|
| `/login` | Login.jsx | No |
| `/register` | Register.jsx | No |
| `/dashboard` | Dashboard.jsx | Yes |
| `/groups/:groupId` | GroupDetail.jsx | Yes |
| `/groups/:groupId/expenses/:expenseId` | ExpenseDetail.jsx | Yes |

`ProtectedRoute`: calls `GET /api/v1/auth/me` on load; no valid cookie → redirect `/login`.

**Critical: `client/vercel.json` required for SPA routing on Vercel:**
```json
{ "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }
```
Without this, any direct URL access (e.g. `/dashboard`) returns Vercel 404.

**Modals (no URL — overlays on parent page):**
- CreateGroupModal (Dashboard)
- AddExpenseModal / EditExpenseModal (GroupDetail)
- SettleUpModal (GroupDetail)

### Screen layouts

**Dashboard:**
- Fixed top nav: app name (left) + user name + logout (right)
- Section 1 — Balance summary: 3 cards in a row (`grid-cols-3`) — "You owe" (red), "You are owed" (green), "Net balance" (red/green)
- Section 2 — Group list: "Create group" button top-right; group cards (`grid-cols-1` stacked) — each shows name, member count, your balance in that group; clickable → `/groups/:id`
- Empty state: "No groups yet. Create one to start splitting expenses."

**Group Detail (single scrollable page, no tabs):**
1. Group header: name, description, member count; "Add expense" + "Settle up" buttons (right-aligned)
2. Group balances: pairwise rows — "Priya owes Rahul ₹500" + "Settle up" button; "All balances cleared ✓" when zero
3. Members list: horizontal row of avatar/initials + names; admin badge on creator; "Add member" button at end
4. Expense list: sorted `expense_date DESC`; each card shows description, amount, paid by, date, split type badge, message count badge; clickable → expense detail

**Expense Detail:**
- Expense header: description, total amount, date, "Paid by [Name]" badge, split type badge, Edit/Delete (creator or admin only)
- Split breakdown table:

| Member | Split detail | Amount owed |
|---|---|---|
| Priya | 40% | ₹800 |
| Amit | 35% | ₹700 |

  - Middle column: Equal → fraction (1/3); Unequal → hidden; Percentage → %; Shares → "2 shares"
  - Payer row: if in split, shows "Paid" badge instead of amount owed; if not in split, not shown in table
- Notes (if present): shown below table
- Chat thread: immediately below, no scroll required; system messages in grey/centered; send input at bottom

**404 / unknown routes:**
- API returns 404 or 403 → frontend shows: "This group doesn't exist or you don't have access." + "Back to dashboard" button
- 403 treated same as 404 to avoid revealing existence to non-members

---

## 10. API Endpoints

### Auth
| Method | Path | Body | Notes |
|---|---|---|---|
| POST | `/api/v1/auth/register` | `{name, email, password}` | Returns user; sets cookie |
| POST | `/api/v1/auth/login` | `{email, password}` | Returns user; sets cookie |
| POST | `/api/v1/auth/logout` | — | Clears cookie |
| GET | `/api/v1/auth/me` | — | Returns current user from cookie |

### Groups
| Method | Path | Body | Notes |
|---|---|---|---|
| GET | `/api/v1/groups` | — | All groups for current user |
| POST | `/api/v1/groups` | `{name, description?}` | Creates group; adds creator as member |
| GET | `/api/v1/groups/:id` | — | Group + active members |
| DELETE | `/api/v1/groups/:id` | — | Soft delete; precondition: all balances = 0 |
| POST | `/api/v1/groups/:id/members` | `{email}` | Add member by email |
| DELETE | `/api/v1/groups/:id/members/:userId` | — | Remove member; precondition: balance = 0 |

### Expenses
| Method | Path | Body | Notes |
|---|---|---|---|
| GET | `/api/v1/groups/:id/expenses` | — | Sorted `expense_date DESC` |
| POST | `/api/v1/groups/:id/expenses` | `{description, amount, paidById, splitType, splits[], expenseDate?, notes?}` | Creates expense + splits |
| GET | `/api/v1/expenses/:id` | — | Expense + splits + paidBy |
| PUT | `/api/v1/expenses/:id` | Same shape as POST | Recalculates splits; posts system message |
| DELETE | `/api/v1/expenses/:id` | — | Soft delete; 200 with warning if payments exist |

### Balances
| Method | Path | Notes |
|---|---|---|
| GET | `/api/v1/groups/:id/balances` | Pairwise array: `[{fromUser, toUser, amount}]` |

### Payments
| Method | Path | Body | Notes |
|---|---|---|---|
| POST | `/api/v1/payments` | `{groupId, payerId, receiverId, amount, note?}` | Creates settlement |
| DELETE | `/api/v1/payments/:id` | — | Hard delete; creator or admin only |

### Messages
| Method | Path | Body | Notes |
|---|---|---|---|
| GET | `/api/v1/expenses/:id/messages` | — | Last 50, oldest first |
| POST | `/api/v1/expenses/:id/messages` | `{content}` | Saves + emits `new_message` via Socket.io |

### Response envelope (all endpoints)
```json
{ "success": true, "data": { ... } }
{ "success": false, "error": "Human-readable", "details": { ... } }
```
HTTP codes: 200, 201, 204, 400, 401, 403, 404, 500.

---

## 11. Real-time (Socket.io)

### Server setup
```js
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: process.env.CLIENT_URL, credentials: true }
});
server.listen(process.env.PORT);
```

### Cross-origin cookie auth
```js
// Client
const socket = io(VITE_SOCKET_URL, { withCredentials: true });

// Server middleware — runs once per connection
io.use((socket, next) => {
  const raw = socket.request.headers.cookie ?? '';
  const token = raw.split('; ')
    .find(c => c.startsWith('token='))?.split('=')[1];
  if (!token) return next(new Error('Unauthorized'));
  try {
    socket.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    next(new Error('Unauthorized'));
  }
});
```
Cookie is sent on the initial HTTP polling handshake (same as any CORS request with `withCredentials: true`). `SameSite=None; Secure` required on the cookie.

### Room structure
One room per expense: `expense:{expenseId}`

### Events
| Direction | Event | Payload |
|---|---|---|
| Client → Server | `join_expense` | `{expenseId}` |
| Client → Server | `leave_expense` | `{expenseId}` |
| Client → Server | `send_message` | `{expenseId, content}` |
| Server → Room | `new_message` | `{id, userId, userName, content, type, createdAt}` |

Broadcast includes sender (no optimistic UI needed — message appears on server confirm).

### What is NOT real-time
- Expense list, balances, member list — all update on page load or after user mutation + refetch.

---

## 12. Deployment

```
Vercel (React SPA)  →  Railway (Express + Socket.io)  →  Railway (PostgreSQL, internal)
```

### Environment variables

**Railway (backend):**
```
DATABASE_URL     auto-generated by Railway Postgres
JWT_SECRET       64-char random string, never committed to git
CLIENT_URL       https://<app>.vercel.app  (exact URL, no trailing slash)
PORT             3000 (Railway may override dynamically)
NODE_ENV         production
```

**Vercel (frontend):**
```
VITE_API_URL     https://<backend>.railway.app/api/v1
VITE_SOCKET_URL  https://<backend>.railway.app
```

### CORS — critical config
```js
app.use(cors({
  origin: process.env.CLIENT_URL,
  credentials: true   // required for cross-origin cookie
}));
```
`credentials: true` + exact origin (not `*`) — mandatory for httpOnly cookie to be sent cross-origin.

### Cookie — critical config
```js
res.cookie('token', jwt, {
  httpOnly: true,
  secure: true,         // required in production (HTTPS)
  sameSite: 'None',     // required for cross-origin (Vercel → Railway)
  maxAge: 7 * 24 * 60 * 60 * 1000
});
```

---

## 13. Auth Flow (End to End)

```
Register:
  POST /auth/register → bcrypt hash → insert user → sign JWT →
  Set-Cookie (httpOnly, secure, SameSite=None, 7d)

Login:
  POST /auth/login → bcrypt compare → sign JWT → Set-Cookie

Every request:
  Browser sends cookie → cookie-parser reads → authenticate middleware →
  jwt.verify → attaches req.userId → route handler runs

App load:
  React → GET /auth/me → server validates → returns {id, name, email} → AuthContext

Logout:
  POST /auth/logout → server clears cookie →
  BroadcastChannel('auth').postMessage('logout') → all tabs → redirect /login

Tab logout sync:
  // On logout
  new BroadcastChannel('auth').postMessage('logout');
  // Every tab
  new BroadcastChannel('auth').onmessage = e => {
    if (e.data === 'logout') window.location.href = '/login';
  };

401 anywhere:
  Axios interceptor → redirect /login
```

---

## 14. Edge Cases Handled

| Scenario | Handling |
|---|---|
| Two users add expenses simultaneously | Last-write-wins; independent inserts, no conflict |
| Two users settle same debt simultaneously | Accept for MVP (warning in AI_CONTEXT); manual delete of duplicate payment |
| User removed mid-form, submits expense | Server checks `leftAt IS NULL`; returns 403 "You are no longer a member"; frontend redirects to dashboard |
| Navigate to `/groups/nonexistent-id` | API returns 404; frontend shows "This group doesn't exist or you don't have access" + back button |
| Navigate to group user isn't member of | API returns 403; frontend shows same message as 404 (don't reveal group existence) |
| Delete expense with existing payments | Soft delete proceeds; 200 response includes warning; balance may show overpayment |

---

## 15. Known Limitations (Accepted for 2-Day MVP)

| Limitation | Impact | Future fix |
|---|---|---|
| No logout-from-all-devices | JWT valid until expiry on other browsers/devices | Server-side session store + token blacklist |
| Deleting expense with payments can cause balance discrepancy | Warning shown; user confirms | Reverse settlement logic on expense delete |
| No debt simplification | Pairwise balances only | Graph min-cash-flow algorithm |
| No real-time expense list / balance updates | Other users see changes on next page load | Socket.io group room emitting `expense_updated` |
| No archive/restore UI | Data preserved at DB level | "Archived groups" section on dashboard |
| Balances recomputed on every load | Acceptable at MVP scale | Stored running totals for performance at scale |
| Concurrent settlement race condition | Duplicate payments possible | DB transaction with balance check before insert |

---

## 16. Risks & Mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| Cross-origin httpOnly cookie auth failing (most critical) | High | **Deploy skeleton apps on Day 1 morning.** Verify register → /auth/me loop works cross-origin before writing any feature. Fallback: JWT in Authorization header + localStorage if cookie approach fails completely. |
| Deployment config (env vars, CORS, Prisma migrations on Railway) eating hours | Medium | Deploy bare "hello world" to both Vercel and Railway on Day 1 before building. Fix infra before building features. |
| Balance calculation query returning wrong numbers | Medium | Write and test the balance query first with seed data. Verify math by hand before building anything on top of it. |

**Least confident decision:** Cross-origin httpOnly cookie auth between Vercel and Railway. Requires `SameSite=None`, `Secure`, `withCredentials: true` on Axios and Socket.io, exact CORS origin — all correct simultaneously. First thing to verify on Day 1.

**Bug handling in demo:**
- Small (UI/styling): fix live — shows codebase familiarity
- Medium (broken flow): explain root cause, walk through code, fix if ≤ 5 min
- Known limitation: reference AI_CONTEXT.md — shows it was deliberate, not a surprise
- Never explain away or blame the AI tool

---

## 17. Future Improvements (Documented, Not Built)

- Debt simplification (min-cash-flow graph algorithm)
- Real-time expense list + balance updates via Socket.io group rooms
- Archive/restore groups UI
- Admin transfer (group creator handoff)
- Email notifications on expense add / settle request
- Group categories + icons
- Activity feed
- Recurring expenses
- Receipt image upload
- Multi-currency support
- Logout from all devices

---

## 18. Repository & Timeline

**Monorepo:** single GitHub repo, `/client` (React + Vite) and `/server` (Express) folders.
One repo → one GitHub link, one README, one clone command for the evaluator.

**Day 1 hard constraint:** by end of Day 1, the live URL must accept registration and login, and all backend API routes must be functional.

| Time | Goal |
|---|---|
| Day 1 morning | Skeleton deploy to Vercel + Railway; verify cross-origin cookie auth end-to-end |
| Day 1 afternoon | Complete all API routes, Prisma schema, migrations, auth flow |
| Day 1 evening | Basic frontend: login/register working, dashboard showing groups |
| Day 2 morning | Group detail page, Add Expense modal (all 4 split types), balance display |
| Day 2 afternoon | Socket.io chat, Settle Up flow, seed script |
| Day 2 evening | Polish, end-to-end manual testing, README, AI_CONTEXT.md final update |

*Last updated: Round 4 complete + timeline confirmed. BUILD_PLAN.md generated.*
