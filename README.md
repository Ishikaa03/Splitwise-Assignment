# Splitwise Clone

A full-stack expense splitting app built as an internship assignment. Reverse-engineered Splitwise, scoped to core features, and deployed end-to-end.

## Live Demo

**[https://splitwise-assignment.vercel.app](https://splitwise-assignment.vercel.app)**

## Demo Credentials

| Email | Password | Name | Role |
|---|---|---|---|
| demo1@test.com | password123 | Priya | Group admin |
| demo2@test.com | password123 | Rahul | Member |
| demo3@test.com | password123 | Amit | Member |

**Demo group:** "Goa Trip" — pre-loaded with 4 expenses (Equal, Unequal, Percentage, Shares), real-time chat messages, and a partial settlement. Log in with any demo account to explore.

## Features

- **Auth** — Register / login with email + password. JWT stored in httpOnly cookie (7-day session). Cross-tab logout via BroadcastChannel API.
- **Groups** — Create groups, invite members by email, remove members. Admin role with override permissions.
- **Expense splitting** — 4 split types: Equal, Unequal, Percentage, Shares. Live validation counters on forms.
- **Real-time chat** — Each expense has a dedicated Socket.io chat thread. Messages appear instantly across tabs.
- **Balances** — Live pairwise balance calculation (computed at query time, never stale). Individual summary across all groups.
- **Settle up** — Record full or partial payments. Balance updates immediately. Inline "Settle up" button on every balance row.

## Tech Stack

| Layer | Tech |
|---|---|
| Frontend | React 18 + Vite + TailwindCSS + React Router v6 |
| HTTP client | Axios with global 401 interceptor |
| Real-time | Socket.io (same process as Express) |
| Backend | Node.js + Express 5 |
| ORM | Prisma 7 with `@prisma/adapter-pg` |
| Database | PostgreSQL |
| Frontend deploy | Vercel |
| Backend + DB deploy | Railway |

## AI Tool Used

Built using **Claude (Anthropic)** via Claude Code as the primary development collaborator. The AI acted as a junior engineer — it was interviewed with detailed product, schema, UX, and deployment questions before writing any code. All decisions are documented in `AI_CONTEXT.md`.

## Run Locally

### Prerequisites
- Node.js 18+
- PostgreSQL database

### Setup

```bash
git clone https://github.com/Ishikaa03/Splitwise-Assignment
cd Splitwise-Assignment

# Backend
cd server
cp .env.example .env
# Edit .env: set DATABASE_URL and JWT_SECRET
npm install
npx prisma migrate dev
npm run seed        # loads demo data (runs once, idempotent)
npm run dev         # http://localhost:3001

# Frontend (new terminal)
cd client
cp .env.example .env
# Edit .env: set VITE_API_URL=http://localhost:3001/api/v1
npm install
npm run dev         # http://localhost:5173
```

### Environment Variables

**Backend (`server/.env`):**
```
DATABASE_URL=postgresql://...
JWT_SECRET=your-64-char-random-string
CLIENT_URL=http://localhost:5173
PORT=3001
NODE_ENV=development
```

**Frontend (`client/.env`):**
```
VITE_API_URL=http://localhost:3001/api/v1
VITE_SOCKET_URL=http://localhost:3001
```

## Project Documentation

| File | Purpose |
|---|---|
| [AI_CONTEXT.md](./AI_CONTEXT.md) | Complete source of truth — every product, schema, UX, and architecture decision made during the interview process |
| [BUILD_PLAN.md](./BUILD_PLAN.md) | 43-step build sequence with risk checkpoints and fallback strategies |

## Repository

**GitHub:** [https://github.com/Ishikaa03/Splitwise-Assignment](https://github.com/Ishikaa03/Splitwise-Assignment)
