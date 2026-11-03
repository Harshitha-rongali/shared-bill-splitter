<<<<<<< HEAD
# Shared Bill Splitter

A full-stack web application for managing shared household expenses. Create homes, add members, split bills equally, record payments, and track outstanding balances.

## Features

- **Home Management:** Create and view multiple homes.
- **Member Management:** Add members to a home.
- **Bill Management:** Create bills and automatically split expenses equally among all members.
- **Remainder Handling:** Distribute leftover cents in member creation order.
- **Payment Tracking:** Mark individual member shares as paid.
- **Idempotent Payments:** Prevent duplicate payments using idempotency keys.
- **Outstanding Balances:** View the unpaid amount for each member.
- **Error Handling:** Handle invalid inputs, API failures, and slow requests.
- **Responsive UI States:** Loading, empty, success, and error states.

## Tech Stack

**Frontend**
- React
- TypeScript
- Vite
- TanStack Router
- CSS

**Backend**
- Hono
- Cloudflare Workers

**Database**
- Cloudflare D1
- SQLite
- SQL migrations

**Testing and Code Quality**
- Vitest
- Biome
- TypeScript

## Project Structure

```text
shared-bill-splitter/
├── api/
│   ├── migrations/
│   │   └── 0001_init.sql
│   └── src/
│       └── index.ts
├── web/
│   └── src/
│       ├── api.ts
│       ├── main.tsx
│       ├── routes/
│       │   └── index.tsx
│       └── styles.css
├── package.json
├── pnpm-lock.yaml
└── README.md
```

## Getting Started

### Prerequisites

- Node.js
- pnpm

### Installation

Clone the repository:

```bash
git clone https://github.com/Harshitha-rongali/shared-bill-splitter.git
```

Navigate into the project:

```bash
cd shared-bill-splitter
```

Install dependencies:

```bash
pnpm install
```

### Run the Application

```bash
pnpm dev
```

## Available Commands

| Command | Description |
|---|---|
| `pnpm install` | Install dependencies |
| `pnpm dev` | Start the development environment |
| `pnpm test` | Run tests |
| `pnpm check` | Run Biome checks |
| `pnpm typecheck` | Check TypeScript types |
| `pnpm build` | Build the application |

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/health` | Check API health |
| GET | `/api/homes` | Retrieve all homes |
| POST | `/api/homes` | Create a home |
| GET | `/api/homes/:homeId` | Retrieve home details |
| POST | `/api/homes/:homeId/members` | Add a member |
| GET | `/api/homes/:homeId/bills` | Retrieve home bills |
| POST | `/api/homes/:homeId/bills` | Create a bill |
| POST | `/api/bills/:billId/shares/:shareId/pay` | Record a payment |
| GET | `/api/homes/:homeId/balances` | Retrieve outstanding balances |

Payment requests require an `Idempotency-Key` header to prevent duplicate payment processing.

API errors use JSON responses in the following format:

```json
{
  "error": "Error message"
}
```

## Database Design

The application uses four main tables:

- **homes:** Stores home information.
- **members:** Stores home members and their creation order.
- **bills:** Stores bill details and total amounts in cents.
- **shares:** Stores each member's share, payment status, and idempotency key.

The database uses primary keys, foreign keys, unique constraints, and check constraints to maintain data integrity.

## Key Decisions

### 1. Store Money as Integer Cents

All bill amounts and member shares are stored as integer cents instead of floating-point values. This avoids floating-point precision issues when splitting money.

### 2. Distribute Remaining Cents in Member Creation Order

When a bill cannot be divided equally, the remaining cents are distributed one by one according to member creation order. This ensures that the total of all shares always equals the original bill amount.

### 3. Use Conditional Updates for Idempotent Payments

Payments use an `Idempotency-Key` and a conditional database update that only succeeds when the share is unpaid. This helps prevent duplicate payments, including when multiple requests attempt to pay the same share simultaneously.

## Testing and Validation

The implementation was checked using:

- Unit and API tests with Vitest.
- Biome code-quality checks.
- TypeScript type checking.
- Production build verification.

The local test run completed with **24 passing tests across 3 test files**.


## Author

**Harshitha Rongali**

GitHub: [Harshitha-rongali](https://github.com/Harshitha-rongali)

Project Repository: [Shared Bill Splitter](https://github.com/Harshitha-rongali/shared-bill-splitter)
=======
# shared-bill-splitter
>>>>>>> origin/main
