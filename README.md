# Splitwise Clone

A full-stack expense splitting app built in 2 days as an internship assignment.

## Live Demo

> Add your deployed URL here after deployment

## Demo Credentials

| Email | Password | Name |
|---|---|---|
| demo1@test.com | password123 | Priya |
| demo2@test.com | password123 | Rahul |
| demo3@test.com | password123 | Amit |

**Demo group:** "Goa Trip" — pre-loaded with 4 expenses across all split types, chat messages, and a partial settlement.

## Features

- **Auth** — Register / login with email + password. JWT in httpOnly cookie (7-day session).
- **Groups** — Create groups, invite members by email, manage membership.
- **Expense splitting** — 4 types: Equal, Unequal, Percentage, Shares. Each expense has a real-time chat thread.
- **Balances + Settlement** — Live pairwise balance calculation. Settle up with partial payment support.

## Tech Stack

| Layer | Tech |
|---|---|
| Frontend | React 18 + Vite + TailwindCSS + React Router v6 |
| HTTP | Axios (global 401 interceptor) |
| Real-time | Socket.io |
| Backend | Node.js + Express |
| ORM | Prisma 7 |
| Database | PostgreSQL |
| Deploy | Vercel (frontend) + Railway (backend + DB) |

## Run Locally

### Prerequisites
- Node.js 18+
- PostgreSQL database

### Setup

```bash
git clone https://github.com/your-username/splitwise-clone
cd splitwise-clone

# Backend
cd server
cp .env.example .env       # fill in DATABASE_URL and JWT_SECRET
npm install
npx prisma migrate dev
npm run seed               # loads demo data once
npm run dev                # runs on port 3001

# Frontend (new terminal)
cd client
cp .env.example .env       # VITE_API_URL=http://localhost:3001/api/v1
npm install
npm run dev                # runs on port 5173
```

## Design Decisions

See [AI_CONTEXT.md](./AI_CONTEXT.md) — full product and technical decisions documented through a structured interview process.

See [BUILD_PLAN.md](./BUILD_PLAN.md) — the 43-step build sequence with risk checkpoints.
