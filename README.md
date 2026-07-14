# RelayPay — Real-Time Payment Failover System

**A fault-tolerant, UPI-style payment backend that automatically reroutes failed transactions to a pre-approved backup contact — recovering the majority of simulated failed payments without manual retry.**

> **Status:** Backend core complete and tested. Frontend is not yet built — this README documents the backend architecture, API, and how to run/verify it standalone via API calls.

---

## Table of Contents
- [Overview](#overview)
- [Why This Exists](#why-this-exists)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [The Failover State Machine](#the-failover-state-machine)
- [Data Model](#data-model)
- [Security & Privacy](#security--privacy)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [API Reference](#api-reference)
- [Testing](#testing)
- [Design Decisions & Tradeoffs](#design-decisions--tradeoffs)
- [Known Limitations & Future Work](#known-limitations--future-work)


---

## Overview

RelayPay simulates a real problem in UPI-style payment systems: a payment fails (insufficient balance, network timeout, bank server error) and today the user just sees an error and has to manually ask someone for help or retry later. RelayPay automates that fallback — if a payment fails, the system automatically requests approval from a pre-authorized backup contact (a "family circle" member) to cover the payment in real time, with the whole flow completing in seconds via WebSocket push, not polling.

This repository is the **backend**: a Node.js/Express/MongoDB service implementing the failover logic, an atomic double-entry ledger, JWT authentication with refresh token rotation, and a real-time notification layer via Socket.io.

## Why This Exists

Existing wallet apps (Paytm, PhonePe, GPay) show a failed transaction and stop there — resolution is manual, slow, and outside the app. RelayPay's contribution is the **reactive failover decision layer**: automatically detecting a failure and routing it to a human-approved backup source of funds, in real time, with a full auditable trail. It does not replace a bank or wallet provider — it sits on top of one.

## Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Runtime | Node.js + Express | Fast to build, wide ecosystem, matches MERN scope |
| Database | MongoDB (Atlas) + Mongoose | Native multi-document transactions (needed for atomic ledger writes), flexible schema for evolving FSM states |
| Real-time | Socket.io | Room-per-user push notifications, replaces polling for failover events |
| Auth | JWT (access + refresh) | Stateless access tokens, rotating refresh tokens with reuse detection |
| Testing | Jest + mongodb-memory-server | In-memory replica-set Mongo, no external DB dependency for CI |
| Logging | Pino | Structured JSON logs, field redaction for sensitive data |

## Architecture

```
Client (not yet built)
        │
        ▼
   Express API  ──────────────►  MongoDB Atlas
        │                              ▲
        │                              │
        ▼                              │
  failoverEngine (FSM) ──► ledgerService (atomic double-entry)
        │
        ├──► MockBankAdapter (simulated bank/PSP rail)
        ├──► relayService (finds eligible backup contact)
        └──► notificationService ──► Socket.io ──► Client
                                            ▲
                              relayTimeoutWorker (polls for
                              expired relay requests)
```

**Core design principle:** business logic (`services/`) has zero knowledge of Express or Socket.io. `failoverEngine.js` and `ledgerService.js` are pure, independently testable modules — routes and sockets are thin layers on top.

## The Failover State Machine

Every transaction moves through a strictly enforced set of states. Illegal transitions (e.g. jumping straight from `INITIATED` to `SETTLED`) are rejected at the code level, not just assumed correct.

```
INITIATED
   │
   ▼
PRIMARY_ATTEMPTED
   │
   ├─── success ──────────────────────────► SETTLED
   │
   └─── failure (relay-ineligible) ───────► REVERSED
   │
   └─── failure (relay-eligible)
           │
           ▼
     PRIMARY_FAILED
           │
           ▼
   ┌── no backup contact available ──────► REVERSED
   │
   ▼
RELAY_REQUESTED
   │
   ├─── approved ──► RELAY_APPROVED ──────► SETTLED
   ├─── declined ──► RELAY_DECLINED ──────► REVERSED
   └─── timeout  ──► RELAY_TIMEOUT ────────► REVERSED
```

Every single transition is written to an **append-only `AuditLog`** collection with `fromStatus`/`toStatus`, giving a fully reconstructable history per transaction — nothing is ever overwritten or deleted.

**Relay eligibility matters:** not every bank failure should trigger a relay request. A frozen/closed wallet (`WalletFrozenError`) is not something a backup contact's payment can fix, so it goes straight to `REVERSED`. Insufficient balance, network timeouts, and server errors are relay-eligible — a backup contact covering the payment genuinely resolves those.

## Data Model

| Collection | Purpose |
|---|---|
| `User` | Identity, credentials (hashed), refresh token state, transaction PIN (for step-up approval) |
| `Wallet` | Cached balance, daily limits, wallet status — **not the source of truth for balance** |
| `LedgerEntry` | Append-only double-entry record (DEBIT/CREDIT pairs). **This is the actual source of truth** — `Wallet.balance` is a fast-read cache reconciled against it |
| `Transaction` | The FSM instance — status, relay sub-object, timestamps for metrics |
| `FamilyCircle` | A user's backup contacts, with explicit consent status, per-member limits, and priority order |
| `AuditLog` | Immutable event log of every state transition and security-relevant event |

**Why a separate ledger from the wallet balance:** this is standard double-entry bookkeeping. If `Wallet.balance` and the sum of `LedgerEntry` rows ever disagree, the ledger wins — `reconcileWalletBalance()` rebuilds the correct balance from ledger history. This makes the system self-auditing rather than trusting a single mutable number.

## Security & Privacy

- **Passwords**: bcrypt, 12 salt rounds. `passwordHash` and `transactionPin` are `select: false` in the schema — never returned by default queries.
- **Auth tokens**: short-lived (15 min) JWT access tokens; refresh tokens in httpOnly, secure, `sameSite: strict` cookies, scoped to `/api/v1/auth` only.
- **Refresh token rotation with reuse detection**: every refresh issues a new token and invalidates the old one. If an old (already-rotated) token is ever presented again, it's treated as theft — the entire session family is killed server-side, forcing re-login, and the event is logged (`REFRESH_TOKEN_REUSE_DETECTED`).
- **Brute-force protection**: 5 failed login attempts triggers a 15-minute account lockout.
- **Rate limiting**: tiered — strict on auth endpoints, moderate on relay approval actions, relaxed default elsewhere.
- **Authorization checks server-side, always**: a transaction can only be viewed by its sender, receiver, or relay backup contact. A relay request can only be approved/declined by the specifically invited contact — verified against the authenticated `req.user.id`, never trusted from the request body.
- **Explicit consent model**: nobody becomes a backup contact automatically. Every `FamilyCircle` member starts `PENDING` and must actively `ACCEPT` before they can ever be relayed to.
- **No real financial data**: this system never touches a real bank. See [Design Decisions](#design-decisions--tradeoffs) below.
- **Structured logging with redaction**: passwords, PINs, and tokens are redacted at the logger level (`utils/logger.js`), so they can never leak into log output even by accident.

## Project Structure

```
relaypay-backend/src/
├── config/              # DB connection, Socket.io setup, env validation
├── controllers/         # HTTP request handlers — thin, delegate to services
├── middleware/          # auth, rate limiting, error handling, request logging
├── models/              # Mongoose schemas
├── routes/v1/           # Route definitions
├── services/            # Core business logic — framework-agnostic
│   └── bankAdapter/     # MockBankAdapter + swappable interface
├── workers/             # Background jobs (relay timeout poller)
├── utils/               # Errors, logger, JWT helpers
├── app.js               # Express app assembly (no .listen())
server.js                # Entry point — boots DB, HTTP server, sockets, worker
```

## Getting Started

### Prerequisites
- Node.js 18+
- A MongoDB Atlas cluster (free tier is sufficient — must be a replica set, which Atlas is by default)

### Installation

```bash
git clone <your-repo-url>
cd relaypay-backend
npm install
```

### Environment Setup

Copy `.env.example` to `.env` and fill in the values (see [Environment Variables](#environment-variables) below).

### Seed Demo Data

```bash
node scripts/seed.js
```

### Run

```bash
npm run dev      # with nodemon
npm start        # production mode
```

Server starts on `http://localhost:5000` (or your configured `PORT`). Health check: `GET /health`.

### Run Tests

```bash
npm test
```

## Environment Variables

| Variable | Description |
|---|---|
| `PORT` | Port the server listens on |
| `MONGODB_URI` | MongoDB Atlas connection string |
| `JWT_ACCESS_SECRET` | Secret for signing access tokens (generate with `crypto.randomBytes(64).toString('hex')`) |
| `JWT_REFRESH_SECRET` | Separate secret for refresh tokens |
| `CLIENT_ORIGIN` | Frontend origin, for CORS (e.g. `http://localhost:5173`) |
| `NODE_ENV` | `development` \| `production` \| `test` |
| `LOG_LEVEL` | `debug` \| `info` \| `warn` \| `error` |

## API Reference

All endpoints are prefixed `/api/v1`. Protected routes require `Authorization: Bearer <accessToken>`.

### Auth
| Method | Endpoint | Description |
|---|---|---|
| POST | `/auth/register` | Create account + wallet (seeded demo balance) |
| POST | `/auth/login` | Returns access token, sets refresh cookie |
| POST | `/auth/refresh` | Rotates refresh token, returns new access token |
| POST | `/auth/logout` | Invalidates the current refresh token family |

### Wallet
| Method | Endpoint | Description |
|---|---|---|
| GET | `/wallet` | Current user's wallet |
| GET | `/wallet/ledger` | Current user's ledger entry history |

### Transactions
| Method | Endpoint | Description |
|---|---|---|
| POST | `/transactions` | Initiate a payment (triggers failover automatically on failure) |
| GET | `/transactions` | List current user's transactions |
| GET | `/transactions/:id` | Get a single transaction (sender/receiver/relay contact only) |

### Family Circle
| Method | Endpoint | Description |
|---|---|---|
| GET | `/family-circle` | Current user's backup contacts |
| POST | `/family-circle/invite` | Invite a user as a backup contact |
| POST | `/family-circle/:ownerId/respond` | Accept/decline an invitation |
| DELETE | `/family-circle/:memberUserId` | Remove a backup contact |

### Relay
| Method | Endpoint | Description |
|---|---|---|
| GET | `/relay/pending` | Relay requests awaiting the current user's response |
| POST | `/relay/:transactionId/respond` | Approve or decline a relay request |

### Socket.io Events (client-side)

Connect with `{ auth: { token: accessToken } }`. Server joins the socket to a private `user:{userId}` room automatically.

| Event | Direction | Payload |
|---|---|---|
| `relay:requested` | server → backup contact | `{ transactionId, amount, senderName, expiresAt }` |
| `relay:resolved` | server → sender | `{ transactionId, status, amount }` |
| `transaction:settled` | server → user | `{ transactionId, amount, newBalance }` |
| `transaction:failed` | server → user | `{ transactionId, reason }` |

## Testing

- **`tests/unit/ledgerService.test.js`** — verifies the atomic double-entry ledger: single transfers, debits==credits invariant, **10 concurrent transfers with zero balance inconsistency**, idempotency, and rejected-on-insufficient-balance with zero partial state.
- Run with `npm test`. Uses `mongodb-memory-server` in single-node replica-set mode, so Mongo transactions work without any external database dependency — safe to run in CI.

## Design Decisions & Tradeoffs

**No real bank integration, by design.** Real UPI/bank rail access requires an NPCI-authorized PSP license — not something available or appropriate at a portfolio-project stage. Instead, `MockBankAdapter` simulates the bank layer behind a `BankAdapter` interface. State-based failures (insufficient balance, daily limit, frozen wallet) are checked against real wallet data; infrastructure failures (network timeout, server error) are weighted-random, mimicking real-world UPI failure distribution. In production, this adapter is swapped for a real integration via a licensed PSP (e.g. Razorpay, Cashfree) implementing the same interface — no other code changes.

**Wallet balance is a cache, LedgerEntry is truth.** Standard double-entry bookkeeping. Enables self-auditing and reconciliation rather than trusting a single mutable number.

**Optimistic locking over pessimistic locking.** Wallets carry a `version` field checked on every write; concurrent writes that lose the race are retried rather than blocking. Chosen for throughput under the demo's concurrency test rather than serializing all writes to a wallet.

**Polling-based timeout worker, not a job queue.** `relayTimeoutWorker.js` polls every 10 seconds for expired relay requests, rather than using BullMQ + Redis. This is a deliberate simplification for project scope — a real high-volume system would use per-transaction scheduled jobs to avoid poll lag and repeated collection scans. Documented here rather than hidden.

**Single-hop relay only.** If the first-priority backup contact declines or times out, the transaction is reversed rather than falling through to a second contact. `FamilyCircle` already supports priority ordering for future multi-hop fallback.

## Known Limitations & Future Work

- Multi-hop relay fallback (try priority #2 if #1 declines/times out)
- Circular relay detection (A backs up B, B backs up A)
- Step-up PIN verification on relay approval (schema field exists, not yet enforced in the approval flow)
- Field-level encryption for PII at rest
- Replace polling timeout worker with BullMQ + Redis
- Frontend (React) — not yet built; this backend is fully testable via REST client (Postman/Insomnia) or the test suite in the meantime

