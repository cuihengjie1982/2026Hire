# Video Taxonomy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add configurable task categories and direction-specific quality tags to video sharing without modifying the existing 37 video records.

**Architecture:** Keep `category` as the legacy compatibility field and add nullable course taxonomy fields plus normalized option/link tables. Edge Functions and local Express expose the same taxonomy contract; the React management page edits it, while the static mobile public page receives enriched course data from `training-public`.

**Tech Stack:** React 19, TypeScript, Vitest, Supabase Edge Functions (Deno), PostgreSQL, Express.

**Spec:** `docs/superpowers/specs/2026-08-29-video-taxonomy-design.md`

## Global Constraints

- Do not update or delete the existing 37 positive/negative course rows.
- Preserve course IDs, media URLs, action captions, share tokens, content, materials, and legacy categories.
- New database columns are nullable and legacy polarity derives from `category` when absent.
- Keep `/video-sharing` login-free and compatible with iOS WeChat, Safari, Android, and HarmonyOS.

---

### Task 1: Taxonomy Domain Contract

**Files:**
- Create: `src/modules/training/videoTaxonomy.ts`
- Modify: `src/modules/training/types.ts`
- Test: `src/modules/training/videoTaxonomy.test.ts`

**Interfaces:**
- Produces `VideoPolarity`, `VideoSeverity`, `VideoTaxonomyOption`, `VideoTaxonomy`, `resolveVideoPolarity`, and display-label helpers.

- [ ] Write tests proving explicit polarity wins, legacy categories remain compatible, and options are grouped by kind/polarity.
- [ ] Run the focused test and verify it fails because the domain module does not exist.
- [ ] Implement the minimal typed domain helpers.
- [ ] Run the focused test and verify it passes.

### Task 2: Additive Database Schema And API

**Files:**
- Create: `supabase/migrations/*_add_training_video_taxonomy.sql`
- Create: `server/src/db/migrations/041_add_training_video_taxonomy.sql`
- Modify: `supabase/functions/embox-api/training/index.ts`
- Modify: `supabase/functions/embox-api/index.ts`
- Modify: `supabase/functions/training-public/index.ts`
- Modify: `server/src/modules/training/training.routes.ts`
- Modify: `src/modules/training/api.ts`
- Test: `src/modules/training/api.test.ts`

**Interfaces:**
- Produces CRUD at `/training/video-taxonomy`, enriched course payloads, and course create/update fields `videoPolarity`, `taskCategoryId`, `qualityTagIds`, `videoSeverity`, `videoReviewNote`.

- [ ] Write failing mapper/API tests for legacy fallback and new snake_case fields.
- [ ] Generate the Supabase migration with `supabase migration new add_training_video_taxonomy`.
- [ ] Add nullable columns, secured dictionary/link tables, indexes, and default options without updating courses.
- [ ] Implement identical Edge and Express taxonomy behavior, including in-use delete protection.
- [ ] Enrich public course results with taxonomy labels.
- [ ] Run focused API tests and type checks.

### Task 3: Video Sharing Management UI

**Files:**
- Create: `src/modules/training/components/VideoTaxonomyManager.tsx`
- Modify: `src/modules/training/pages/TrainingVideoSharePage.tsx`
- Modify: `src/modules/training/pages/TrainingAcademyPage.tsx`

**Interfaces:**
- Consumes taxonomy APIs and course taxonomy fields.
- Produces category management and linked create/edit controls in video-sharing mode only.

- [ ] Add a classification-management button and modal with task/positive-tag/negative-tag sections.
- [ ] Add video nature, task category, multi-select quality tags, severity, and review note controls to the video-sharing course editor.
- [ ] Preserve the general training academy editor behavior.
- [ ] Show taxonomy labels in the management filters, table, and mobile cards.

### Task 4: Public Mobile Filtering

**Files:**
- Modify: `public/video-sharing.html`
- Test: `src/modules/training/publicVideoSharing.test.ts`

**Interfaces:**
- Consumes enriched `/training-public-api/courses` rows.
- Produces positive/negative first-level tabs and contextual task/tag filters.

- [ ] Extend fixtures and write failing tests for task and quality-tag filtering plus legacy fallback.
- [ ] Render responsive task/tag controls only when options exist in the active direction.
- [ ] Include classification metadata in search and cards.
- [ ] Verify existing positive/negative and other-document behavior remains intact.

### Task 5: Verification And Deployment

**Files:**
- Modify: `docs/operations/training-video-compatibility.md`

**Interfaces:**
- Produces a repeatable production verification record.

- [ ] Run focused Vitest suites, full TypeScript checks, production build, and static public-page tests.
- [ ] Inspect the migration and confirm it contains no course `UPDATE` or `DELETE`.
- [ ] Apply the migration, deploy `embox-api` and `training-public`, then query counts to confirm 24 positive and 13 negative records remain.
- [ ] Deploy Vercel, test desktop and mobile public flows, and verify existing share links.
- [ ] Commit and push `ylif4-fix` only after all verification passes.
