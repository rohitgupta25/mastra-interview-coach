# Mastra Interview Coach

AI-powered interview preparation app for frontend roles. The project includes:

- a React + Vite frontend
- an Express + TypeScript backend
- OpenAI-powered dynamic question generation
- theory and coding evaluation flows
- optional Judge0 code execution
- reference sync and lightweight retrieval for question grounding

## Documentation

- Full technical guide: [docs/ai_interview_coach_technical_guide.md](./docs/ai_interview_coach_technical_guide.md)
- Detailed development and flow notes: [docs/mastra_interview_coach_development_and_flow.md](./docs/mastra_interview_coach_development_and_flow.md)

## Prerequisites

- Node 18+
- pnpm
- Google OAuth credentials for login-enabled local runs
- OpenAI API key for LLM-backed question generation

## Environment Setup

Recommended locations:

- backend env: `server/.env.local`
- frontend env: `web/.env`

Common backend variables:

- `OPENAI_API_KEY`
- `QUESTION_GEN_MODEL`
  Current server-side default: `gpt-4.1`
- `GOOGLE_OAUTH_CLIENT_ID`
- `AUTH_DISABLED=true`
  Optional for local development if you want to bypass auth
- `JUDGE0_BASE_URL`
- `JUDGE0_API_KEY`
- `JUDGE0_API_HOST`
- `JUDGE0_LOCAL_FALLBACK`

Frontend variables:

- `VITE_GOOGLE_CLIENT_ID`
- `VITE_API_BASE`
  Optional, defaults to `http://localhost:4000`

Reference sync variables:

- `INTERVIEW_RESOURCES_MD_PATH`
- `INTERVIEW_RESOURCES_MD_PATHS`
- `REFERENCE_SYNC_WEB_URLS`
- `REFERENCE_SYNC_INTERVAL_MIN`

Example backend env:

```env
OPENAI_API_KEY=your_key_here
QUESTION_GEN_MODEL=gpt-5-mini
GOOGLE_OAUTH_CLIENT_ID=your_google_client_id
AUTH_DISABLED=false
```

Example frontend env:

```env
VITE_GOOGLE_CLIENT_ID=your_google_client_id
VITE_API_BASE=http://localhost:4000
```

## Install

From the repo root:

```bash
pnpm install
```

## Run Locally

Start the backend:

```bash
cd server
pnpm dev
```

Start the frontend in a second terminal:

```bash
cd web
pnpm dev
```

Frontend default URL:

- `http://localhost:5173`

Backend default URL:

- `http://localhost:4000`

## Build

Backend:

```bash
cd server
pnpm build
```

Frontend:

```bash
cd web
pnpm build
```

## Reference Auto-Sync

The server auto-syncs reference material on startup and periodically.

Current active sync sources:

- markdown files from local disk
- web URLs from built-in/static references and `REFERENCE_SYNC_WEB_URLS`

Relevant variables:

- Markdown path: `INTERVIEW_RESOURCES_MD_PATH`
- Multiple markdown paths: `INTERVIEW_RESOURCES_MD_PATHS` (comma-separated)
- Web URLs: `REFERENCE_SYNC_WEB_URLS` (comma-separated, merged with built-in Adobe links)
- Interval minutes: `REFERENCE_SYNC_INTERVAL_MIN` (default: `180`)

Important note:

- The codebase contains PDF parsing helpers, but the current runtime sync flow is wired to markdown and web sources.

Manual sync/status APIs:

- `GET /api/references/status`
- `POST /api/references/sync`

## Main API Routes

- `GET /api/auth/me`
- `POST /api/session`
- `POST /api/question`
- `POST /api/answer`
- `POST /api/run`
- `GET /api/references/status`
- `POST /api/references/sync`
