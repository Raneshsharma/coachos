# CoachOS 🏋️

> **AI-Powered SaaS Platform for Solo Online Fitness Coaches (UK)**
>
> Replace WhatsApp, PDFs, and spreadsheets with one structured, automated system — powered by DeepSeek-V3.1.

[![Tests](https://img.shields.io/badge/tests-17%20passing-brightgreen)](#running-tests)
[![API](https://img.shields.io/badge/api-Node.js%20%2F%20TypeScript-blue)](#tech-stack)
[![AI](https://img.shields.io/badge/AI-DeepSeek--V3.1%20via%20Bytez-green)](#ai-integration)

---

## Features

| Feature | Status |
|---|---|
| **Morning Dashboard** — at-risk flags, MRR, check-in summary | ✅ Live |
| **AI Plan Generation** — DeepSeek-V3.1 via Bytez SDK | ✅ Live |
| **Client CRM** — search, filter, adherence tracking | ✅ Live |
| **Client Portal** — tabbed plan / messages / proof card / edit | ✅ Live |
| **In-App Messaging** — full WhatsApp replacement | ✅ Live |
| **Billing & MRR** — subscription tracking, dunning controls | ✅ Live |
| **Migration Assistant** — CSV import, JSON export, rollback | ✅ Live |
| **Analytics** — event feed, runtime adapters, top events | ✅ Live |
| **Proof Engine** — shareable transformation cards (v1) | ✅ Live |

---

## Tech Stack

- **Frontend:** React 18, TypeScript, Vite
- **Backend:** Node.js, TypeScript, Express
- **AI:** DeepSeek-V3.1 via [Bytez](https://bytez.com) SDK
- **Billing:** Simulated Stripe (GBP)
- **Storage:** JSON file (dev) / PostgreSQL (prod-ready)
- **Monorepo:** npm workspaces

---

## Quick Start

### Prerequisites
- Node.js 20+
- npm 10+

### 1. Clone & Install
```bash
git clone https://github.com/<your-username>/codex.git
cd codex
npm install
```

### 2. Configure Environment
```bash
cp apps/api/.env.example apps/api/.env
```

Edit `apps/api/.env` and set at minimum:
```env
COACHOS_AI_PROVIDER=deepseek
BYTEZ_API_KEY=your_bytez_api_key_here
```

> Get a Bytez API key at [bytez.com](https://bytez.com). Without it, set `COACHOS_AI_PROVIDER=mock` to run without AI.

### 3. Start Dev Servers

In two separate terminals:

```bash
# Terminal 1 — API (port 4000)
npm run dev:api

# Terminal 2 — Web (port 5173)
npm run dev:web
```

Open **http://localhost:5173**

---

## Running Tests

```bash
npm run test
# → 17 tests passing across domain + api packages
```

---

## Environment Variables

See [`apps/api/.env.example`](apps/api/.env.example) for the full reference.

| Variable | Default | Description |
|---|---|---|
| `COACHOS_AI_PROVIDER` | `mock` | `mock` \| `simulated-openai` \| `deepseek` |
| `BYTEZ_API_KEY` | — | Required when AI provider is `deepseek` |
| `COACHOS_STORAGE_MODE` | `json` | `json` \| `postgres_relational` |
| `COACHOS_BILLING_PROVIDER` | `mock` | `mock` \| `simulated-stripe` |
| `PORT` | `4000` | API server port |

---

## Project Structure

```
codex/
├── apps/
│   ├── api/          # Express API server (TypeScript)
│   │   ├── src/
│   │   │   ├── app.ts       # Routes
│   │   │   ├── store.ts     # State + business logic
│   │   │   ├── services.ts  # AI / Billing / Proof providers
│   │   │   └── config.ts    # Env-driven configuration
│   │   └── .env.example     # Template — copy to .env
│   └── web/          # React frontend (Vite)
│       └── src/
│           ├── main.tsx     # App + all view components
│           └── styles.css   # Kinetic Sanctuary design system
└── packages/
    ├── domain/       # Shared types, schemas, domain logic
    └── ui/           # Shared UI primitives
```

---

## AI Integration

CoachOS uses **DeepSeek-V3.1** via the [Bytez](https://bytez.com) JavaScript SDK to generate personalised fitness and nutrition plans. The integration is in `apps/api/src/services.ts` (`DeepSeekPlanGenerationProvider`).

To switch between AI providers, set `COACHOS_AI_PROVIDER` in your `.env`:
- **`mock`** — Fast, no API call, uses local seed data
- **`simulated-openai`** — Simulated, returns mock with model name
- **`deepseek`** — Live DeepSeek-V3.1 via Bytez (requires `BYTEZ_API_KEY`)

---

## License

MIT
