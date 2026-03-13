# Mastra Interview Coach — Local demo

## Prerequisites

- Node 18+ and pnpm (or npm)
- OPENAI_API_KEY in `.env` (or adapt mastra config to your provider)
- (Optional) `QUESTION_GEN_MODEL` to control dynamic question-generation model (default: `gpt-4o-mini`)
- (Optional) JUDGE0_API_KEY and JUDGE0_BASE_URL to enable code-runner
- (Optional) `INTERVIEW_RESOURCES_PDF_PATH`, `INTERVIEW_RESOURCES_MD_PATH`, and `REFERENCE_SYNC_WEB_URLS` to auto-sync interview references

## Install

At repo root:

```bash
pnpm install
cd server && pnpm install
cd ../web && pnpm install
```

## Reference Auto-Sync

Server auto-syncs reference material on startup and periodically.

- PDF path: `INTERVIEW_RESOURCES_PDF_PATH` (default: `~/Downloads/frontend_interview_resources.pdf`)
- Markdown path: `INTERVIEW_RESOURCES_MD_PATH` (default: `~/Downloads/frontend_interview_questions_500_plus.md`)
- Multiple markdown paths: `INTERVIEW_RESOURCES_MD_PATHS` (comma-separated)
- Web URLs: `REFERENCE_SYNC_WEB_URLS` (comma-separated, merged with built-in Adobe links)
- Interval minutes: `REFERENCE_SYNC_INTERVAL_MIN` (default: `180`)

Manual sync/status APIs:

- `GET /api/references/status`
- `POST /api/references/sync`
