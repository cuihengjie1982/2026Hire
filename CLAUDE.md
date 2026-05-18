# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

EM-BOX recruitment management system (AI招聘管理系统). Full-stack React + Express + PostgreSQL app for candidate search, position configuration, resume scoring, interview management, and approval workflows. All UI is in Chinese.

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

### Backend (server/)
```bash
cd server
npm run dev          # tsx watch on port 4000
npx tsc --noEmit     # Backend TypeScript check
npm run migrate      # Run pending DB migrations (numbered SQL files)
npm run seed         # Seed test data
npm run migrate:seed # Migrate + seed in one step
```

Run a single frontend test: `npx vitest run path/to/test.test.ts`
Run a single server test: `cd server && npx vitest run src/__tests__/path/to/test.test.ts`

### Environment
Two `.env` files — one at root (frontend) and one in `server/` (backend).

**Root `.env`** (copy from `.env.example`):
- `VITE_USE_MOCK_API` — `"true"` (default) uses in-memory mock data, no backend needed; `"false"` hits real APIs (Vercel + Supabase production)
- `VITE_API_BASE_URL` — backend URL
  - Dev: `http://localhost:4000` (local Express)
  - Prod: `https://<project>.supabase.co` (PostgREST auto-generated API) or your Edge Function URL
- `VITE_GEMINI_API_KEY` — required for client-side Gemini AI features
- `VITE_MINERU_API_TOKEN` — JWT token for MinerU resume parsing API (used for direct browser-side MinerU API calls)

**Server `.env`** (copy from `server/.env.example`):
- `DATABASE_URL` — PostgreSQL connection string (Supabase cloud: add `?sslmode=require`)
- `JWT_SECRET` — must change in production
- `MINERU_API_TOKEN` — for MinerU resume parsing API

In dev mode, Vite proxies `/api` requests to the backend (configured in `vite.config.ts`), so the frontend can call `/api/...` directly without CORS issues.

## Deployment Architecture

### Production: Vercel + Supabase

```
Frontend (Vercel) ──> Supabase PostgREST (CRUD APIs)
                  ──> Supabase Edge Functions (Auth, AI, Interview Scoring)
                  ──> Supabase Managed Postgres
                  ──> External AI APIs (LLM, Whisper, MinerU)
```

**Frontend (Vercel):**
- SPA routing via `vercel.json` rewrites
- Environment variables set in Vercel Dashboard
- Direct-to-MinerU API call from browser (no backend proxy needed)

**Backend (Supabase):**
- **PostgREST**: Auto-generated CRUD REST API from Postgres schema (for standard entity CRUD)
- **Edge Functions**: Deno runtime for complex logic (Auth, AI LLM proxy, Interview scoring)
- Edge Functions are in `supabase/functions/` and deploy via `supabase functions deploy`

### Supabase Edge Functions
```bash
supabase functions deploy <name>   # 部署指定函数
supabase functions list             # 查看已部署函数
```

### Edge Functions 路由架构

存在两个路由入口：
- **embox-api** (verify_jwt=false) — 主路由，处理 settings/users、AI config、cross-table ops、agent-executor、mineru-proxy、notifications、sms-gateway、analytics
- **index** (verify_jwt=true) — 旧路由，处理 ai-proxy、interview-scoring、candidate-ops 等

前端调用方式：
- `supabase.functions.invoke('name', body)` → 路由到 `index`
- `fetch('/functions/v1/embox-api/<path>')` → 路由到 `embox-api`，需手动添加 Authorization header

推荐写法（参考 `src/modules/settings/api.ts` 的 `efetch` 函数）：
```typescript
const efetch = async <T>(path: string, method = 'GET', body?: Record<string, unknown>): Promise<T> => {
  const base = USE_MOCK_API ? '' : API_BASE_URL;
  const res = await fetch(`${base}/functions/v1/embox-api${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${getAuthToken() ?? ''}`,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || `API error ${res.status}`);
  return data as T;
};
```

### 两套后端系统

| 环境 | 技术栈 | 端口/地址 |
|------|--------|-----------|
| 本地开发 | Express (`server/`) | :4000 |
| 生产环境 | Supabase Edge Functions (`supabase/functions/`) | `https://<project>.supabase.co/functions/v1/` |

Vite 开发服务器代理 `/api` → Express :4000，但生产环境前端直接调用 Edge Functions（不经过 Express）。

### 前端 Supabase 客户端

`src/shared/lib/supabase.ts` 使用懒初始化：`createClient(SUPABASE_URL, SUPABASE_ANON_KEY)`。环境变量：`VITE_SUPABASE_URL` 和 `VITE_SUPABASE_ANON_KEY`。

**Local Development:**
- Frontend: `npm run dev` (Vite on :3000, proxies `/api` → Express :4000)
- Backend: `cd server && npm run dev` (Express on :4000, connects to local Postgres)
- Supabase local: `supabase start` (local Postgres + PostgREST on :54321)

## Architecture

### Frontend → Backend Flow

```
React Component → modules/*/api.ts (mapper functions) → shared/lib/apiClient.ts (fetchJson) → Vite proxy /api → Express routes → config/database.ts (pg Pool)
```

### Routing

Uses `react-router-dom` `BrowserRouter` (see `src/app/router/AppRouter.tsx`). Pages are lazy-loaded with `React.lazy()` + `Suspense`. The app wraps everything in a `DashboardLayout` with a `ProjectContext` provider. The `navigation.ts` file exports page IDs and route mappings used by the sidebar.

### Snake_case ↔ CamelCase Contract

The backend stores all column names in `snake_case` (PostgreSQL convention). The frontend uses `camelCase` throughout. **Every API module has mapper functions** that handle this conversion:

```typescript
// In modules/*/api.ts — always map both formats for resilience
const mapPositionSummary = (raw: Record<string, unknown>) => ({
  id: String(raw.id ?? ''),
  projectId: (raw.project_id ?? raw.projectId ?? '') as string,  // handle both
  requiredCount: (raw.required_count ?? raw.requiredCount ?? 0) as number,
});
```

**When writing new API functions:**
- Reading from API: map `snake_case` → `camelCase` in mapper functions
- Writing to API: convert `camelCase` → `snake_case` in request body `JSON.stringify()`
- JSONB columns (like `scoring_config`, `grade_rules`): pass as JS objects in the request body; the backend route must `JSON.stringify()` before inserting into PostgreSQL

### Mock vs Real API

`src/shared/lib/runtime.ts` exports `USE_MOCK_API`. Every API function has a mock path and a real path:

```typescript
export const listPositions = async () => {
  if (USE_MOCK_API) {
    await mockDelay();
    return mockData;
  }
  const raw = await fetchJson<Record<string, unknown>[]>('/api/positions');
  return raw.map(mapPositionSummary);
};
```

When `USE_MOCK_API` is true, no backend is needed. Mock data lives in in-memory arrays within the API files, initialized from `localStorage`.

### Project Context

`src/app/contexts/ProjectContext.tsx` provides a `useProject()` hook with `selectedProject`, `projects[]`, and `setSelectedProject()`. The selected project ID persists in `localStorage` under `em-box.selected-project-id`. Most modules are scoped to the selected project.

### Database Layer

`server/src/config/database.ts` exports four helpers:
- `query<T>(sql, params)` → returns `T[]`
- `queryOne<T>(sql, params)` → returns `T | null` (first row)
- `getClient()` → raw `pg.PoolClient` from the connection pool
- `transaction(fn)` → BEGIN/COMMIT/ROLLBACK wrapper, passes `PoolClient` to `fn`

Migrations are numbered SQL files in `server/src/db/migrations/`, tracked via `_migrations` table.

### Authentication & Authorization

JWT-based with 24h expiry. Token stored in `localStorage` under `em-box.auth-token`. `fetchJson` auto-attaches `Authorization: Bearer <token>`. Roles: `admin`, `recruiter`, `hiring_manager`, `viewer`.

Server middleware:
- `authMiddleware` (`server/src/middleware/auth.ts`) — verifies JWT, sets `req.user` with `{userId, email, role}`
- `requireRole(...roles)` (`server/src/middleware/requireRole.ts`) — role-based route guard
- `validate(rules)` (`server/src/middleware/validate.ts`) — declarative request body validation

### Error Handling (Backend)

Throw `AppError` subclasses from `server/src/shared/errors.ts`:
- `NotFoundError(resource, id?)` → 404
- `UnauthorizedError(msg?)` → 401
- `ForbiddenError(msg?)` → 403
- `ValidationError(msg)` → 400

The `errorHandler` middleware (`server/src/middleware/errorHandler.ts`) catches these and also maps PostgreSQL errors (23505 → 409 DUPLICATE, 23503 → 400 FK_VIOLATION). All API errors return: `{error: {code: 'ERROR_CODE', message: 'Description'}}`.

### AI/LLM Integration

`server/src/modules/ai/llmClient.ts` provides:

- `callLLM(config, systemPrompt, userMessage)` — text-only LLM calls. Works with multiple providers: OpenAI, Anthropic, Gemini, DeepSeek, Zhipu, MiniMax, Moonshot, Qwen.
- `callVisionLLM(config, systemPrompt, parts)` — multimodal (text + image) calls for vision-capable models. Takes `ContentPart[]` where each part is `{type: 'text', text}` or `{type: 'image', image: {media_type, data}}` (base64 without URI prefix). Provider-specific image formats handled internally (OpenAI `image_url`, Anthropic `source`, Gemini `inline_data`).

Provider configs are stored in the `ai_model_configs` DB table (resolved in order: specific ID → default active → most recent active).

Prompt builders live in `server/src/modules/ai/promptBuilder.ts` — functions for resume screening, candidate ranking, interview scoring, and resume vision extraction (`buildResumeVisionSystemPrompt`, `buildResumeVisionUserMessage`). All output structured JSON.

### PDF Resume Parsing Pipeline

**Development (local Express):**
`server/src/shared/pdfProxy.ts` handles `/api/mineru/file_parse` with a 4-tier fallback:
1. **pdftotext** — extracts text from text-based PDFs
2. **OCR** — `pdftoppm` + `tesseract -l chi_sim+eng` for scanned/image-based PDFs
3. **MinerU API** — remote API call (requires `MINERU_API_TOKEN` in server `.env`)
4. **LLM Vision** — converts PDF pages to PNG, sends to vision-capable LLM

**Production (Vercel + Supabase):**
The frontend calls MinerU API directly from the browser (`src/shared/lib/mineruClient.ts`), bypassing the backend proxy entirely. This avoids the `exec()` requirement that Supabase Edge Functions cannot support.

### AI Interview Scoring Pipeline

The video interview page (`src/AIVideoInterviewPage.tsx`) uses `MediaRecorder` to capture audio-only WebM/Opus per question. The full pipeline per question:

```
MediaRecorder (audio-only stream) → Blob → FormData POST → backend /api/interview-scoring/transcribe-and-score
  → OpenAI Whisper transcription (requires OpenAI provider in ai_model_configs)
  → LLM scoring with configured model (any provider)
  → store in interview_answer_scores table
```

When the interview completes, `POST /api/interview-scoring/aggregate/:sessionId` sums all per-question scores into `interview_results`, auto-creates an approval request.

Key tables: `interview_answer_scores` (per-question, has transcript/score/status) and `interview_results` (aggregated, has `question_answers` JSONB summary).

The flow works two ways:
- **From Interview Management**: session created with real sessionId → full pipeline (Whisper + LLM + aggregate)
- **From Config "Preview"**: no session → answers still scored by AI, result saved via `createInterviewResult` with locally-computed aggregate

Whisper specifically requires an OpenAI API key (resolved from `ai_model_configs` where `provider = 'openai'`). The LLM scoring works with any configured provider.

## Module Structure

Each domain module follows the same pattern:
```
src/modules/{domain}/
  types.ts       # TypeScript interfaces (camelCase)
  api.ts         # CRUD functions + snake_case↔camelCase mappers
  fixtures.ts    # Empty fixture objects for testing
  pages/         # Page components (embedded in tabs)
  hooks.ts       # (optional) module-specific React hooks
```

Backend mirrors this:
```
server/src/modules/{domain}/
  {domain}.routes.ts   # Express Router with SQL queries
```

### Frontend API 调用约定

生产环境调用 Edge Functions 时，API 函数应使用 `fetch` 直接请求 `/functions/v1/embox-api/<path>`，并携带 Authorization header。`invokeEdgeFunction('settings')` 会路由到 `index` 函数而非 `embox-api`，需要确认目标路由是否正确。

### Key Modules
- **positions/** — Job position CRUD with profile rules, scoring rules, grade rules, base score config
- **candidates/** — Candidate search with resume scoring, AI screening
- **interviews/** — Interview templates (questions, scoring config, grade rules), sessions, results, analytics
- **approvals/** — Approval workflow (auto-created from interview results)
- **agents/** — AI agent configurations
- **outreach/** — Outreach campaigns and templates
- **shortlist/** — Candidate shortlists
- **ai/** — LLM proxy and model config management

## Important Implementation Notes

### Position Configuration (PositionConfigPage.tsx)

The API returns position detail with `profile_rules` (new format) or legacy `profile` object with `{mustHave[], niceToHave[], bonus[]}`. When reading, check both formats. When saving, send both formats to ensure compatibility.

### Resume Scorer (resumeScorer.ts)

`ScoreResult` has `matchedKeywords: string[]` and `missingKeywords: string[]` — NOT `matchedMustHave`/`missingMustHave` etc.

### Interview Scoring System

Templates have `scoringConfig` (dimensions + base score + requirements) and `gradeRules` (score→grade mapping). Questions have `group`, `followUps`, `scoringGuide` (rubric table), and `linkedDimensions`. MD import parses structured interview assessment documents and auto-fills both questions and scoring config.

The AI scoring prompt builder (`buildInterviewScoringSystemPrompt` in `promptBuilder.ts`) takes the question's scoring guide and linked dimensions, instructs the LLM to output structured JSON with `{score, dimensionScores, strengths, weaknesses, overallAssessment}`.

### JSONB Fields Requiring stringify

In backend routes, these fields must be `JSON.stringify()`'d before SQL INSERT/UPDATE:
- `scoring_config`, `grade_rules` on interview_templates
- `follow_ups`, `scoring_guide`, `linked_dimensions` on interview_questions
- `profile`, `profile_rules`, `scoring_rules`, `grade_rules`, `base_score_config` on positions
- `dimension_scores`, `scoring_guide_used` on interview_answer_scores
- `question_answers` on interview_results

### Controlled Inputs

When rendering form inputs from API data that may have undefined fields (especially after importing), always use `value={field ?? ""}` to prevent React uncontrolled→controlled warnings.

## Tech Stack

- React 19 + TypeScript + Vite
- React Router DOM v7 (BrowserRouter + lazy loading)
- Tailwind CSS v4
- Motion (framer-motion) for animations
- Lucide React icons
- Recharts for charts
- Express 4 + PostgreSQL (pg)
- JWT authentication (jsonwebtoken + bcryptjs)
- Helmet + express-rate-limit for security
- No state management library (useState/useReducer + Context only)
