# Mastra Interview Coach

## Complete Development and Flow Document

Document version: 1.0  
Generated on: 2026-03-13  
Project root: `mastra-interview-coach`

---

## 1. Purpose and Scope

This document captures the complete technical implementation and end-to-end flow for the Mastra Interview Coach application.

It covers:

- Monorepo structure
- Frontend and backend architecture
- Authentication flow (Google OAuth 2.0)
- Interview flow (profile -> question -> evaluation -> next question)
- Dynamic question generation strategy
- Coding execution and evaluation pipeline (Judge0 + local fallback)
- Reference synchronization system
- Environment variables and setup
- API contract details
- Troubleshooting and validation checklist

---

## 2. High-Level System Overview

The application is a monorepo with two runtime applications:

1. `web` (React + Vite)

- Handles login, profile setup, interview UI, answer submission, and feedback rendering.

2. `server` (Express + TypeScript)

- Handles authenticated APIs, session creation, dynamic question generation, answer evaluation, code execution, and reference sync.

Core runtime flow:

1. User logs in with Google.
2. Frontend stores Google access token and calls backend `/api/auth/me`.
3. User configures profile (role, years, skill, level).
4. Frontend creates session (`/api/session`).
5. Frontend requests question (`/api/question`).
6. User answers (theory text or coding solution).
7. Frontend submits answer (`/api/answer`).
8. Backend evaluates and returns score, feedback, improved answer, and coding test checks.
9. Frontend can fetch/advance to next question (`/api/question`) without page refresh.

---

## 3. Monorepo and Key Files

Root:

- `package.json` (workspace scripts)
- `pnpm-workspace.yaml`
- `.env` (legacy/shared; app now also uses app-level env files)

Backend (`server`):

- `src/index.ts` - Express server, auth middleware, API routes
- `src/mastra.ts` - server bootstrap and agent registry
- `src/agents/interviewAgent.ts` - question generation and evaluation logic
- `src/tools/judgeRunner.ts` - Judge0/local code execution
- `src/tools/ragRetriever.ts` - reference retrieval utility
- `src/resources/interviewReferences.ts` - static seed references
- `src/resources/referenceSync.ts` - auto-sync from web/markdown

Frontend (`web`):

- `src/App.tsx` - app-level flow orchestration (login/profile/interview)
- `src/components/LoginPage.tsx` - Google OAuth token flow UI
- `src/components/ProfileSetupPage.tsx` - role/years/skill/difficulty setup
- `src/components/InterviewUI.tsx` - question panel, answer panel, code runner, feedback panel
- `src/components/VoiceControls.tsx` - speech-to-text helper
- `src/services/api.ts` - API client with bearer token handling
- `src/types/interview.ts` - role/skill/type definitions
- `src/styles.css` - modern UI styling, spacing, responsive behavior
- `public/favicon.svg` - application favicon

---

## 4. Runtime and Dependencies

### 4.1 Runtime

- Node.js: `v22.14.0`
- pnpm: `10.32.1`

### 4.2 Backend dependencies

- `express`, `cors`, `body-parser`
- `axios`
- `dotenv`
- `@mastra/core`
- `zod`
- `node-fetch`

### 4.3 Frontend dependencies

- `react`, `react-dom`
- `axios`
- `vite`
- TypeScript + React types

---

## 5. Authentication Architecture

## 5.1 Login strategy

- Frontend uses Google OAuth token client (`accounts.google.com/gsi/client`).
- Frontend obtains access token and user profile (`/oauth2/v3/userinfo`).
- Access token is sent to backend as `Authorization: Bearer <token>`.

## 5.2 Backend validation

In `server/src/index.ts`:

- `requireAuth` middleware validates every protected route.
- Backend verifies token with Google tokeninfo endpoint:
  - `https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=...`
- If `GOOGLE_OAUTH_CLIENT_ID` is set, `aud` must match.
- Token cache is used to reduce repeated tokeninfo calls.

## 5.3 Auth-protected routes

- `GET /api/auth/me`
- `POST /api/session`
- `POST /api/question`
- `POST /api/answer`
- `POST /api/run`
- `GET /api/references/status`
- `POST /api/references/sync`

Note:

- `AUTH_DISABLED=true` can bypass auth for local testing.

---

## 6. Frontend Application Flow

## 6.1 App stage model (`web/src/App.tsx`)

The app has three stages:

1. Login stage (`LoginPage`)
2. Profile stage (`ProfileSetupPage`)
3. Interview stage (`InterviewUI`)

Auth state is persisted in localStorage key:

- `interview_coach_auth`

On app boot:

1. Restore saved auth token.
2. Set API bearer token.
3. Call `/api/auth/me` to verify validity.
4. If valid, continue to profile setup.

## 6.2 Profile setup behavior (`ProfileSetupPage`)

User must explicitly choose:

- Target role
- Years of experience
- Active skill chip
- Difficulty level

No default role, no default skill, no default difficulty are auto-selected.

Role options:

- Associate Consultant (1-3)
- Technical Consultant (3-7)
- Senior Technical Consultant (7-12)
- Technical Architect (13+)

Skill options:

- JavaScript
- React
- Preact
- System Design
- Adobe Commerce EDS
- Adobe Commerce Drop-ins

The payload sent to interview stage:

- `roleKey`
- `role`
- `yearsExperience` (clamped to role band)
- `skills` (all options list for compatibility)
- `activeSkill` (single selected focus)
- `level` (easy|medium|hard)

## 6.3 Interview stage behavior (`InterviewUI`)

- Creates backend session on mount/profile change.
- Fetches first question automatically.
- Uses selected level and active skill for every question request.
- Supports:
  - Theory answer textarea (`answer-input`)
  - Coding answer textarea (`code-area`)
- For coding questions:
  - Run code via `/api/run`
  - Evaluate code via `/api/answer`
- For theory questions:
  - Evaluate answer via `/api/answer`
- Prefetches next question after evaluation for smoother next transition.
- `Show Answer` button is always available in question panel.
- When answer is shown, `Next Question` appears next to it.

---

## 7. Backend API Contract

## 7.1 `GET /api/auth/me`

Response:

- `{ ok: true, user: { sub, email, name, picture } }`

## 7.2 `POST /api/session`

Request body:

- `{ profile: {...} }`

Response:

- `{ ok: true, sessionId, profile }`

## 7.3 `POST /api/question`

Request body:

- `{ sessionId, level, profile }`

Response:

- `{ ok: true, question: {...} }`

Question shape:

- `questionId`
- `title`
- `questionText`
- `type` (`theory` or `coding`)
- `hints`
- `canonicalAnswer`
- `referenceSolution` (for coding)

## 7.4 `POST /api/answer`

Request body:

- `{ sessionId, questionId, answerText }`

Response:

- `{ ok: true, result }`

`result` includes:

- `score`
- `feedback`
- `correction` (improved/expected answer)
- `nextSteps[]`
- `tests[]` (for coding)

## 7.5 `POST /api/run`

Request body:

- `{ language, source, stdin }`

Response:

- `{ ok: true, result }`

`result` may come from:

- Judge0 (`engine: "judge0"`)
- Local fallback (`engine: "local-node-vm"`)

## 7.6 Reference endpoints

- `GET /api/references/status`
- `POST /api/references/sync`

---

## 8. Dynamic Question Generation Design

Implemented in `server/src/agents/interviewAgent.ts`.

## 8.1 Inputs used

- Difficulty: easy/medium/hard
- Role context: role band + years of experience
- Focus skill (`activeSkill`)
- Session-level anti-repeat memory
- Retrieved reference snippets (web/md only)

## 8.2 Skill routing

Skill track detector maps selected skill into one of:

- javascript
- react
- preact
- system_design
- adobe_eds
- adobe_dropins
- general

## 8.3 Anti-repetition

Per session and per track key, agent stores:

- recent question signatures
- recent topic signatures

Similarity checks:

- Exact signature check
- Jaccard similarity threshold check
- Topic repetition suppression

## 8.4 LLM generation pass

`generateQuestionWithLLM(...)` calls OpenAI Chat Completions with strict instructions:

- Output JSON only
- No role names in question text
- No skill-stack parentheses
- No reference noise in question/hints
- Respect requested difficulty
- Generate new (non-repeated) questions
- For JS/React: prioritize core fundamentals

## 8.5 Sanitization

`stripReferenceNoise(...)` removes unwanted text patterns such as:

- "Use this context when relevant..."
- "Core focus..."
- "Calibrate depth..."
- "Context: ..."
- auto-sync/reference/pdfs mentions

## 8.6 Fallback generation

If LLM fails or generates repeated content, emergency dynamic fallback is used.
Fallback includes robust coding tasks with function specs and deterministic tests.

---

## 9. Coding Evaluation Pipeline

## 9.1 Coding harness

For coding questions, backend wraps submitted code with an auto-generated harness:

- Resolves target function by name
- Runs test cases with JSON-serializable args
- Compares actual vs expected via JSON stringify equality
- Prints marker payload `__RESULT__:[...]`

## 9.2 Execution engines

In `judgeRunner.ts`:

1. Try Judge0 if configured (`JUDGE0_BASE_URL`)
2. If unavailable/unauthorized (401/403) and language is JS, fallback to local VM

## 9.3 Local fallback details

- Runs JavaScript using Node `vm`
- Supports sync and async return values
- Async run is awaited with timeout protection
- Returns status `Accepted (local fallback)` when successful

## 9.4 Scoring

If harness tests available:

- score = percentage of passed comparable tests
- runtime error (`stderr`) caps score

If no harness tests:

- fallback scoring based on execution status/output

Feedback includes:

- execution quality summary
- correction/reference solution
- test-by-test results (`passed`, `note`, expected input/output)

---

## 10. Theory Evaluation Pipeline

For theory questions:

- Compares answer keyword coverage against canonical answer
- Adds length bonus
- Produces score, feedback band, correction, and next steps

Feedback bands:

- > =85 strong
- > =65 good baseline
- > =40 partial
- <40 shallow/incomplete

---

## 11. Reference Sync and Retrieval

## 11.1 Source types

- Static references from `interviewReferences.ts`
- Auto-synced markdown files (`INTERVIEW_RESOURCES_MD_PATH` / `..._PATHS`)
- Auto-synced web URLs (`REFERENCE_SYNC_WEB_URLS` + built-ins)

## 11.2 PDF handling

- PDF ingestion parser exists in sync module.
- Active retriever excludes PDF docs at retrieval/merge level to avoid noisy prompts.

## 11.3 Auto-sync lifecycle

In `startReferenceAutoSync()`:

- Run once on startup
- Re-run on interval (`REFERENCE_SYNC_INTERVAL_MIN`, default 180)

## 11.4 Manual sync

- `POST /api/references/sync`

## 11.5 Status

- `GET /api/references/status`
- Returns last sync time, counts, and errors.

---

## 12. Environment Variables

Use app-level env files.

## 12.1 `web/.env`

Required:

- `VITE_GOOGLE_CLIENT_ID`

Optional:

- `VITE_API_BASE` (defaults to `http://localhost:4000`)

## 12.2 `server/.env`

Required:

- `OPENAI_API_KEY`
- `GOOGLE_OAUTH_CLIENT_ID`

Optional auth/dev:

- `AUTH_DISABLED` (`true` to bypass auth locally)
- `PORT` (default 4000)

Optional question generation:

- `QUESTION_GEN_MODEL` (default `gpt-4o-mini`)

Optional Judge0:

- `JUDGE0_BASE_URL`
- `JUDGE0_API_KEY`
- `JUDGE0_API_HOST` (default `judge0-ce.p.rapidapi.com`)
- `JUDGE0_LOCAL_FALLBACK` (default enabled)

Optional references:

- `INTERVIEW_RESOURCES_MD_PATH`
- `INTERVIEW_RESOURCES_MD_PATHS`
- `INTERVIEW_RESOURCES_PDF_PATH`
- `REFERENCE_SYNC_WEB_URLS`
- `REFERENCE_SYNC_INTERVAL_MIN`

Note:

- Keep secrets out of source control.

---

## 13. Local Development Setup

From project root:

1. Install dependencies

- `pnpm install`

2. Create/verify env files

- `web/.env`
- `server/.env`

3. Start apps

- Backend: `pnpm --filter server dev`
- Frontend: `pnpm --filter web dev`

Or run both:

- `pnpm dev`

4. Build checks

- Frontend build: `pnpm -C web build`
- Backend build: `pnpm -C server build`

---

## 14. UI/UX Implementation Notes

Current style system (`web/src/styles.css`) includes:

- Modern gradient hero
- Chip-based skill and state selection
- Pill tags for session/question type/score
- Responsive layout for mobile (`@media max-width:760px`)
- Spacing improvements:
  - gap between sign-in panel and hero card
  - spacing between header and following sections
  - spacing in action rows (Show Answer / Next Question)

Favicon:

- `web/public/favicon.svg`
- wired in `web/index.html`

---

## 15. Security and Operational Notes

- All core APIs are bearer-token protected by default.
- Google token verification is done server-side.
- Access token is stored in browser localStorage for session restore.
- If strict security is needed, move token handling to secure HTTP-only cookies with backend session exchange.

Operational:

- If Judge0 returns 403 (not subscribed), code execution falls back to local JS VM.
- Local fallback only supports JavaScript execution.

---

## 16. Troubleshooting Guide

## 16.1 Google sign-in not working

Check:

- `web/.env` has `VITE_GOOGLE_CLIENT_ID`
- `server/.env` has matching `GOOGLE_OAUTH_CLIENT_ID`
- OAuth client is configured in Google Cloud with proper origin
- Restart both frontend and backend after env updates

## 16.2 401 Unauthorized API errors

Check:

- Frontend has valid bearer token set via `setAuthToken`
- Token has not expired/revoked
- `GOOGLE_OAUTH_CLIENT_ID` matches token audience

## 16.3 Code runner returns Judge0 403

Expected behavior:

- Backend should return local fallback execution for JavaScript.

Check:

- `JUDGE0_LOCAL_FALLBACK` not set to `false`
- Submitted language is JavaScript

## 16.4 Question not changing

Check:

- Profile has selected `activeSkill` and level
- Session is active
- Backend `/api/question` call succeeds
- Anti-repeat memory may reject repeats and trigger fallback generation

## 16.5 Repeated noisy text in questions

Current mitigations:

- strict LLM prompt instructions
- response sanitizer (`stripReferenceNoise`)
- hint filtering

If noise appears again, tighten regex filters in `stripReferenceNoise`.

---

## 17. End-to-End Flow Summary

Primary business flow:

1. User opens app.
2. User signs in with Google.
3. User selects target role, years, skill, and complexity.
4. System creates session.
5. System generates focused question for selected skill and level.
6. User answers (theory text or coding function).
7. System evaluates and returns score + actionable feedback.
8. User can view answer key.
9. User moves to next question; system generates fresh prompt with anti-repeat checks.
10. Loop continues for interview practice.

---

## 18. Suggested Next Enhancements

1. Persist interview history by authenticated user (DB-backed).
2. Add attempt analytics dashboard by skill/level.
3. Add model-provider abstraction for question generation and evaluation.
4. Add robust unit tests for:

- anti-repeat logic
- sanitizer
- coding harness/result parser

5. Add E2E tests for login -> profile -> interview journey.

---

## 19. Validation Snapshot (Current)

Known implemented capabilities:

- Google OAuth gated access
- Profile-first flow
- Dynamic question generation with fallback
- Skill-specific targeting via active skill chip
- Difficulty-aware question requests
- No mandatory page refresh between questions
- Show Answer action in question panel
- Next Question action after reveal/evaluation
- Judge0 + local JS fallback
- Modernized frontend UI and responsive styling
