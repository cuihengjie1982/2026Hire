# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

EM-BOX recruitment management system (AI招聘管理系统). Full-stack React + Express + PostgreSQL app for candidate search, position configuration, resume scoring, interview management, approval workflows, training academy, and employee profiles. All UI is in Chinese.

## Commands

### Frontend (root)
```bash
npm run dev          # Vite dev server on port 3000 (proxies /api → localhost:4000)
npm run build        # Production build
npm run lint         # TypeScript check (tsc --noEmit)
npm run test         # Vitest unit tests (jsdom environment)
npm run test:watch   # Vitest in watch mode
npm run test:e2e     # Playwright E2E tests (starts dev server automatically)
npm run test:e2e:ui  # Playwright E2E with interactive UI
```

Run a single frontend test: `npx vitest run path/to/test.test.ts`

### Backend (server/)
```bash
cd server
npm run dev          # tsx watch on port 4000
npx tsc --noEmit     # Backend TypeScript check
npm run migrate      # Run pending DB migrations (numbered SQL files)
npm run seed         # Seed test data
npm run migrate:seed # Migrate + seed in one step
```

Run a single server test: `cd server && npx vitest run src/__tests__/path/to/test.test.ts`

### Supabase Edge Functions
```bash
supabase functions deploy embox-api   # Deploy ALL modules (single bundled function)
supabase functions list               # List deployed functions
supabase start                        # Local Supabase stack (Postgres + PostgREST on :54321)
```

### Environment

Two `.env` files — one at root (frontend) and one in `server/` (backend).

**Root `.env`** (copy from `.env.example`):
- `VITE_USE_MOCK_API` — `"true"` (default) uses in-memory mock data, no backend needed; `"false"` hits real APIs
- `VITE_API_BASE_URL` — defaults to `VITE_SUPABASE_URL` when `USE_MOCK_API` is false
- `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` — Supabase project credentials
- `VITE_GEMINI_API_KEY` — client-side Gemini AI features
- `VITE_MINERU_API_TOKEN` — JWT token for MinerU resume parsing API

**Server `.env`** (copy from `server/.env.example`):
- `DATABASE_URL` — PostgreSQL connection string (Supabase cloud: add `?sslmode=require`)
- `JWT_SECRET` — must change in production
- `MINERU_API_TOKEN` — for MinerU resume parsing API

## Architecture

### Frontend → Backend Flow (Dual Backend)

```
                 Dev (Vite proxy)              Production
                 ────────────────              ──────────
React → api.ts  →  /api/*  → Express :4000    →  /functions/v1/embox-api/api/* → Edge Function
                ↘  /functions/v1/embox-api/*   →  Edge Function (always)
```

`src/shared/lib/apiClient.ts` — `buildApiUrl()` automatically routes `/api/*` paths through the Edge Function in production (when `USE_MOCK_API=false` and `API_BASE_URL` is not localhost). In dev, Vite proxies `/api` to Express.

This means **most modules can use `fetchJson('/api/...')`** and it works in both dev and production without changes. Modules that call Edge Function paths directly (`/functions/v1/embox-api/...`) bypass `buildApiUrl`.

### Two Backend Systems

| Environment | Tech | Address |
|-------------|------|---------|
| Local dev | Express (`server/`) | `:4000` |
| Production | Supabase Edge Functions (`supabase/functions/embox-api/`) | `https://<project>.supabase.co/functions/v1/embox-api` |

The **Express server is dev-only**. In production, all logic runs in Edge Functions. Edge Functions use the Supabase service role client (`createSupabaseAdmin(req)`) for all DB operations, bypassing RLS.

### Edge Function Architecture

All routes are bundled in a single Edge Function (`embox-api`) deployed via `supabase functions deploy embox-api`. The main entry point (`index.ts`) dynamically imports handler modules and matches requests by path pattern + HTTP method:

```
supabase/functions/embox-api/
  index.ts                  # Route table + Deno.serve entry point
  _shared/                  # Shared utilities (auth, cors, supabase client, LLM client, etc.)
  ai-proxy/index.ts         # AI LLM proxy
  ai-config/index.ts        # AI model config CRUD (admin)
  analytics/index.ts        # Dashboard analytics + interview analytics
  agent-executor/index.ts   # AI agent execution
  candidate-ops/index.ts    # Candidate import/export/stats/tags
  cross-table-ops/index.ts  # Cross-table operations (approve, hire, shortlist)
  employees/index.ts        # Employee profiles, performance, competency models
  interview-scoring/index.ts # Whisper transcription + LLM scoring
  mineru-proxy/index.ts     # MinerU API proxy
  notifications/index.ts    # User notifications
  settings/index.ts         # Users, permissions, invites, notification settings
  shortlist/index.ts        # Shortlist/pipeline CRUD
  sms-gateway/index.ts      # SMS sending
  stats/index.ts            # Sidebar counts + dashboard stats + search
  training/index.ts         # Training academy (courses, enrollments, analytics, portal)
```

Auth levels: `none` | `any` | `recruiter+` | `hiring_manager+` | `admin`

### Module Structure

Frontend follows a consistent pattern per domain:
```
src/modules/{domain}/
  types.ts       # TypeScript interfaces (camelCase)
  api.ts         # CRUD functions + snake_case↔camelCase mappers + mock data paths
  fixtures.ts    # Fixture data for mock mode and tests
  pages/         # Page components
  hooks.ts       # (optional) React hooks
```

Express backend mirrors:
```
server/src/modules/{domain}/
  {domain}.routes.ts   # Express Router with SQL queries
```

### Navigation (8-Module Sidebar)

The sidebar was restructured from 16→8 modules. Defined in `src/navigation.ts` + `src/app/navigation.tsx`:

| ID | Title | Path | Legacy modules merged in |
|----|-------|------|--------------------------|
| dashboard | 工作台 | / | insights, talent stats |
| projects | 项目管理 | /projects | positions, position-config |
| candidates | 候选人中心 | /candidates | search, talent, contacts |
| pipeline | 招聘推进 | /pipeline | shortlist, outreach |
| interviews | AI 面试中心 | /interviews | ai-interview, templates, results, analytics |
| approvals | 审批中心 | /approvals | — |
| training | 培训学堂 | /training | — |
| admin | 系统管理 | /admin | agents, settings, integrations |

Legacy page IDs are mapped in `navigateToPage()` via `LEGACY_MAP` in `src/navigation.ts`. Use `getPageFromPathname()` to determine the current page from the URL.

### Snake_case ↔ CamelCase Contract

Backend stores `snake_case`, frontend uses `camelCase`. Every API module has mapper functions that handle both:

```typescript
const mapItem = (raw: Record<string, unknown>) => ({
  id: String(raw.id ?? ''),
  projectId: (raw.project_id ?? raw.projectId ?? '') as string,
  requiredCount: (raw.required_count ?? raw.requiredCount ?? 0) as number,
});
```

- Reading: map `snake_case` → `camelCase` (fall back to camelCase for resilience)
- Writing: convert `camelCase` → `snake_case` in request body
- JSONB columns: pass as JS objects; backend routes or Edge Functions `JSON.stringify()` before insert

### Mock vs Real API

`src/shared/lib/runtime.ts` exports `USE_MOCK_API` (defaults to `true`). Every API function has two paths:

```typescript
export const listItems = async () => {
  if (USE_MOCK_API) {
    await mockDelay();
    return mockData;
  }
  const payload = await fetchJson<Record<string, unknown>>('/api/items');
  return getItemsFromPayload(payload).map(mapItem);
};
```

Mock data is stored in `localStorage`-backed arrays, initialized from fixtures. When `USE_MOCK_API=true`, no backend or database is needed.

### Database Layer (Express)

`server/src/config/database.ts`:
- `query<T>(sql, params)` → `T[]`
- `queryOne<T>(sql, params)` → `T | null`
- `getClient()` → raw `pg.PoolClient`
- `transaction(fn)` → BEGIN/COMMIT/ROLLBACK

Migrations: numbered SQL files in `server/src/db/migrations/`, tracked via `_migrations` table.

### Authentication & Authorization

JWT-based, 24h expiry. Token in `localStorage` under `em-box.auth-token`. `fetchJson` auto-attaches `Authorization: Bearer <token>`. Roles: `admin`, `recruiter`, `hiring_manager`, `viewer`.

Server middleware (Express):
- `authMiddleware` — verifies JWT, sets `req.user`
- `requireRole(...roles)` — role guard
- `validate(rules)` — request body validation

Edge Function auth: `_shared/auth.ts` exports `requireAuth`, `requireAdmin`, `requireRecruiterOrAbove`, `requireHiringManagerOrAbove`.

### Error Handling

Backend error classes from `server/src/shared/errors.ts`:
- `NotFoundError(resource, id?)` → 404
- `UnauthorizedError(msg?)` → 401
- `ForbiddenError(msg?)` → 403
- `ValidationError(msg)` → 400

PostgreSQL errors mapped: 23505 → 409 DUPLICATE, 23503 → 400 FK_VIOLATION. All API errors return: `{error: {code: 'ERROR_CODE', message: 'Description'}}`.

### AI/LLM Integration

`server/src/modules/ai/llmClient.ts`:
- `callLLM(config, systemPrompt, userMessage)` — text-only, multi-provider (OpenAI, Anthropic, Gemini, DeepSeek, Zhipu, MiniMax, Moonshot, Qwen)
- `callVisionLLM(config, systemPrompt, parts)` — multimodal. `ContentPart[]` with `{type: 'text'|'image', ...}`. Base64 images without URI prefix; provider-specific formatting handled internally.

Provider configs resolved from `ai_model_configs` table (specific ID → default active → most recent active). Prompt builders in `server/src/modules/ai/promptBuilder.ts`.

### PDF Resume Parsing

**Dev (Express):** `server/src/shared/pdfProxy.ts` — 4-tier fallback: pdftotext → OCR (tesseract) → MinerU API → LLM Vision.
**Production:** Browser calls MinerU API directly via `src/shared/lib/mineruClient.ts` (Edge Functions lack `exec()` for pdftotext/tesseract).

### AI Interview Scoring Pipeline

```
MediaRecorder (audio-only WebM/Opus per question) → Blob → FormData POST
  → /api/interview-scoring/transcribe-and-score
  → OpenAI Whisper transcription → LLM scoring → interview_answer_scores table
  → POST /api/interview-scoring/aggregate/:sessionId → interview_results → auto-create approval request
```

Whisper requires an OpenAI API key. LLM scoring works with any configured provider.

## Important Implementation Notes

### JSONB Fields Requiring stringify

Before SQL INSERT/UPDATE, these fields must be `JSON.stringify()`'d:
- `scoring_config`, `grade_rules` (interview_templates)
- `follow_ups`, `scoring_guide`, `linked_dimensions` (interview_questions)
- `profile`, `profile_rules`, `scoring_rules`, `grade_rules`, `base_score_config` (positions)
- `dimension_scores`, `scoring_guide_used` (interview_answer_scores)
- `question_answers` (interview_results)
- `status_log` (shortlist_entries)
- `certifications`, `skills`, `personality`, `interview_weaknesses` (employee_profiles)

### Edge Function Route Matching

Routes match via `path === pattern || path.startsWith(pattern + '/')`. Order matters — first match wins. Internal sub-path routing (e.g., `/api/employees/:id/performance`) is handled by the handler function, not the route table.

### Controlled Inputs

When rendering form inputs from API data that may have undefined fields, use `value={field ?? ""}` to prevent React uncontrolled→controlled warnings.

### Position Config

API returns `profile_rules` (new) or legacy `profile` with `{mustHave[], niceToHave[], bonus[]}`. Read both formats; send both when saving.

## Tech Stack

- React 19 + TypeScript + Vite
- React Router DOM v7 (BrowserRouter + lazy loading)
- Tailwind CSS v4
- Motion (framer-motion)
- Lucide React icons + Recharts
- Express 4 + PostgreSQL (pg)
- Supabase Edge Functions (Deno runtime)
- JWT authentication (jsonwebtoken + bcryptjs)
- Helmet + express-rate-limit
- No state management library (Context + useState/useReducer only)
