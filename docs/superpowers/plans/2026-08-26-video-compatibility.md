# Video Compatibility and Polarity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve existing shared media while making iOS playback compatible and separating positive/negative videos on mobile.

**Architecture:** Add explicit course categories and a mobile-first category selector to the existing standalone public page. Derive an immutable H.264 variant path from each original Storage path, then use an ordered player fallback queue. A bounded FFmpeg worker creates missing variants without changing source objects or course links.

**Tech Stack:** React/TypeScript, standalone HTML/JavaScript, Vitest/jsdom, Playwright, FFmpeg, tus-js-client, Supabase Storage, GitHub Actions, Vercel.

**Spec:** `docs/superpowers/specs/2026-08-26-ios-video-compatibility-and-polarity-design.md`

## Global Constraints

- 现有分享链接保持不变。
- 不删除、不覆盖 37 条原始视频。
- 新建或编辑课程时可选择“正向视频”或“负向视频”。
- 手机公开页首次进入默认显示正向视频，用户可在页面顶部切换负向视频，两组记录不混排。
- 不修改动作流、文字稿、笔记和分享令牌的数据结构。
- MP4, H.264/AVC `avc1`, High Profile Level 4.1, `yuv420p`, at most 1920x1080 with even dimensions, AAC-LC when audio exists, `faststart`.
- Production code remains on `ylif4-fix`; no merge of unrelated application code into `main`.
- Credentials must never enter source control, browser code, test fixtures, or logs.

---

### Task 1: Course Categories and Public Mobile Grouping

**Files:**
- Modify: `src/modules/training/pages/TrainingAcademyPage.tsx`
- Modify: `public/video-sharing.html`
- Create: `src/modules/training/courseCategories.ts`
- Create: `src/modules/training/courseCategories.test.ts`
- Create: `src/modules/training/publicVideoSharing.test.ts`

**Interfaces:**
- Consumes existing `TrainingCourse.category: string` and public assets with `category`, `kind`, and `searchText`.
- Produces `TRAINING_CATEGORIES: readonly string[]` and `CATEGORY_COLORS: Record<string, string>` for the management page.
- Public page owns `activeCategory = 'positive'`; maps explicit category strings to `positive`, `negative`, or `other`. Mobile has no mixed default list; no classification guessed from ordinary course titles.

- [ ] Add tests for both new dropdown options and retained legacy categories, and execute the actual public page script in jsdom with positive, negative, ordinary-video, PDF fixtures.

```ts
expect(TRAINING_CATEGORIES).toEqual(expect.arrayContaining(['正向视频', '负向视频', '沟通表达', '专业能力', '综合']));
// Public page behavior, after mocked courses fetch settles:
expect(document.querySelector('#list')!.textContent).toContain('正向示范');
expect(document.querySelector('#list')!.textContent).not.toContain('负向示范');
(document.querySelector('[data-category="negative"]') as HTMLButtonElement).click();
expect(document.querySelector('#list')!.textContent).toContain('负向示范');
expect(document.querySelector('#list')!.textContent).not.toContain('正向示范');
```

- [ ] Run `npx vitest run src/modules/training/courseCategories.test.ts src/modules/training/publicVideoSharing.test.ts` and confirm the missing behavior fails.
- [ ] Implement constants/dropdown/colors; add category selectors before search, with counts, selected states, conditional other selector, category tags, responsive fixed-height controls. Keep existing file-type filters, copy/open links, search, pagination, document preview, and auth behavior.

```js
function categoryGroup(asset) {
  if (asset.kind !== 'video') return 'other';
  if (asset.category === '正向视频') return 'positive';
  if (asset.category === '负向视频' || asset.category === '负面视频') return 'negative';
  return 'other';
}
// Apply this predicate before existing file-kind and search predicates:
var inCategory = activeCategory === 'all' || categoryGroup(asset) === activeCategory;
```

- [ ] Test category switching, counts, absence of other when empty, search within category, documents in other, loading/error states. Run targeted tests and `npm run lint`; report pre-existing lint issues separately.
- [ ] Commit only the listed files with `feat: separate positive and negative shared videos`.

### Task 2: Compatible Media Worker and Player Queue

**Files:**
- Create: `public/training-video-compatibility.js`
- Modify: `public/training-video.html`
- Create: `src/modules/training/videoCompatibility.test.ts`
- Create: `src/modules/training/publicVideoPlayer.test.ts`
- Create: `scripts/training-video-compatibility.mjs`
- Create: `scripts/training-video-compatibility.test.ts`
- Create: `.github/workflows/training-video-compatibility.yml`

**Interfaces:**
- Classic script exposes `globalThis.TrainingVideoCompatibility` with `variantUrl(rawUrl, origin)`, `candidates(rawUrl, {origin, userAgent, touchPoints})`.
- Worker exports `variantObjectName(path)`, `ffmpegArgs(input, output)`, `isCompatibleProbe(probe)`, `processVideo(job, dependencies)`; script CLI reads service-role key from environment only and paginates active course records.
- Input object paths are confined to the configured project's public `training-materials/materials/`; output lives only in `materials/ios-compatible/`.

- [ ] Add failing behavior tests for deterministic paths, encoded names, unsupported hosts/paths, iOS/Android/desktop candidate order and deduplication, media error fallback, user-gesture denial, and stale play rejection after source change.

```ts
const raw = 'https://eqdfyhqeqkbjvivscjau.supabase.co/storage/v1/object/public/training-materials/materials/example.mp4';
expect(api.variantUrl(raw, 'https://hire.cmbpo.com')).toContain('/materials/ios-compatible/example.mp4');
expect(api.candidates(raw, {origin: 'https://hire.cmbpo.com', userAgent: 'iPhone MicroMessenger', touchPoints: 1})[0]).toContain('/ios-compatible/');
```

- [ ] Add worker tests for required FFmpeg options, one-job idempotent skip, validation failure never uploading, and failure propagation. Run all new tests to observe red state.

```ts
expect(ffmpegArgs('input.mp4', 'output.mp4')).toEqual(expect.arrayContaining(['libx264', 'yuv420p', '+faststart', 'avc1', '4.1', 'aac']));
expect(variantObjectName('materials/example.mp4')).toBe('materials/ios-compatible/example.mp4');
expect(() => variantObjectName('materials/ios-compatible/example.mp4')).toThrow();
```

- [ ] Implement classic helper and queue. iOS: variant/raw/proxy; other WeChat: proxy/raw/variant; desktop: raw/proxy/variant. Preserve original URL for captions and fallback link. Exhaustion shows retry; retry restarts candidates. `NotAllowedError` prompts a tap without consuming a source; stale `AbortError` is ignored. Playback time advancement clears buffering state. Stall timeout moves to next source without changing course identity.
- [ ] Implement worker with sequential per-file temporary directories, FFprobe validation, CRF 23 `libx264` veryfast, fps capped at 30, aspect-preserving even-dimension scale, maxrate/bufsize compatible with Level 4.1, AAC-LC, faststart, immutable TUS upload with 6 MiB chunks and finite retries. Check original ETag/length before and after; verify remote length, H.264 metadata and initial moov. Existing valid variants skip; a failed object does not block subsequent jobs.
- [ ] Add least-privilege Actions workflow with read-only contents permissions, concurrency group and 6-hour timeout, Node 22, FFmpeg install, `npm ci --ignore-scripts`, schedule/manual trigger, explicit checkout of `ylif4-fix`. Default-branch scheduler must be installed separately with permission because GitHub ignores schedules in non-default branches.
- [ ] Run `npx vitest run src/modules/training/videoCompatibility.test.ts src/modules/training/publicVideoPlayer.test.ts scripts/training-video-compatibility.test.ts`; encode/probe a synthetic short sample as real FFmpeg smoke test; commit `fix: add iOS-compatible media variants and playback fallback`.

### Task 3: Production Backfill, Full Verification and Deployment

**Files:**
- Create: `scripts/backfill-training-video-categories.mjs`
- Create: `scripts/backfill-training-video-categories.test.ts`
- Create: `docs/operations/training-video-compatibility.md`
- Local ignored artifacts: `.artifacts/video-compatibility/` snapshots, reports, screenshots (no credentials).

**Interfaces:**
- Backfill `inferCategory(course)` returns explicit positive/negative only when video section prefixes agree; conflicting/absent evidence returns null.
- Backfill CLI defaults dry-run; `--apply` writes only `category` with a compare-and-swap filter using the old category. Snapshot entire old course data locally before writes and verify every other column is unchanged.

- [ ] Add tests and run red for prefix rules, conflicting prefixes and no evidence. Implement classification and safe backfill.

```ts
expect(inferCategory({content:[{contentType:'video',sectionTitle:'正向视频-擦桌子'}]})).toBe('正向视频');
expect(inferCategory({content:[{contentType:'video',sectionTitle:'负面视频-整理桌面'}]})).toBe('负向视频');
expect(inferCategory({content:[{contentType:'text',sectionTitle:'普通文档'}]})).toBeNull();
```

- [ ] Retrieve current project credentials into a protected temporary location, set the Actions secret through stdin, and never print credential values. Fetch latest course/source snapshot. Run backfill dry-run, confirm 24 positive/13 negative, apply and compare all other fields.
- [ ] Run the compatible worker first for `1787647686320-9911fd35.mp4`, verify the sample, then run remaining jobs. Ensure every original retains its ETag/size and every variant passes remote validation. Write a machine-readable report and verify 37 successful variants.
- [ ] Run full `npm test`, `npm run lint`, `npm run build`; inspect any baseline failures. Run Playwright Chromium/WebKit public-page and player tests at desktop/mobile sizes, capture screenshots, check layout overflow, clicks, category separation, no login redirects, and network responses.
- [ ] Push `ylif4-fix`; link the existing Vercel `2026-hire` project and deploy that branch. Do not deploy Supabase functions unless changed. Verify production HTML/version, category counts, original course links and representative Range responses.
- [ ] Install only the scheduler workflow on default branch with explicit permission and without redeploying the old main application; confirm Actions execution and future schedule. Document schedule delay, safe retry, secret management and rollback. Report exact verified results and the remaining physical-iPhone WeChat verification limitation.
