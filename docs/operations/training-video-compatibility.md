# Training Video Compatibility

## Storage Contract

- Originals remain in `training-materials/materials/` and are never overwritten by the worker.
- Compatible MP4s are stored in `materials/ios-compatible/` with the original MP4 basename. Other containers use the separate `materials/ios-compatible-containers/` namespace and retain their extension before `.mp4`, preventing collisions with multi-extension MP4 originals.
- Share URLs, course IDs, captions, notes and transcript content keep referencing the original asset.
- iOS uses the compatible copy first. Other clients retain their original routing, with the compatible copy available as fallback.
- Output is H.264 High Level 4.1 (`avc1`), limited-range `yuv420p`, even dimensions at most 1920x1080, 30 fps, optional AAC-LC, MP4 faststart.

## Run a Worker

Requirements: Node 22+, FFmpeg/FFprobe on PATH, dependencies installed with `npm ci --ignore-scripts`, and a server-only `SUPABASE_SERVICE_ROLE_KEY` environment variable for the configured project. Never put this key into a `VITE_` variable or frontend file.

```bash
# List matching source objects without uploading.
node scripts/training-video-compatibility.mjs --dry-run

# Process one object; an existing valid copy is skipped.
node scripts/training-video-compatibility.mjs \
  --only materials/1787647686320-9911fd35.mp4 \
  --report /tmp/video-first-report.json

# Process all active courses, including paginated courses beyond the first 200.
node scripts/training-video-compatibility.mjs --report /tmp/video-report.json

# Re-probe every remote variant instead of reusing prior fingerprint verification.
node scripts/training-video-compatibility.mjs --verify-existing --report /tmp/video-report.json
```

Only one processor should run against production at a time. The Actions workflow uses a concurrency lock. Local/manual invocations must not overlap it. TUS uploads also refuse to overwrite an existing object.

Every new copy is locally probed and duration-checked before upload, then remotely checked for size, H.264 metadata, MP4 atom order and `206` byte-range support. Original ETag/size is checked before and after. Temporary source/output files are removed on success and failure. A failed file is recorded while remaining files continue; any failed file makes the process exit nonzero.

Reports can be reused on the next run. A previously validated file avoids another media download only when both original and output ETag/size still match and the previous report records valid codec/range/faststart checks. `--verify-existing` forces the full audit.

Source identity is saved atomically in TUS custom metadata, and the completed verification writes an immutable `.source.json` record alongside the variant. These small JSON records use `text/plain`, already allowed by the bucket. An existing copy is accepted only when its source and output fingerprints match persisted provenance. Legacy copies can acquire provenance from an exact, successful prior report with unchanged before/after fingerprints. Missing or mismatched provenance fails closed, even when codec checks pass; `--verify-existing` does not bypass it. Never overwrite an original at the same path to replace a course video: use a new uploaded object and update the course URL.

## Scheduled Processing

`.github/workflows/training-video-compatibility.yml` checks out **`ylif4-fix`**, runs at minute 17 and 47, and supports manual dispatch. Reports are retained as artifacts for 14 days; the latest verification report is cached to avoid repeatedly downloading unchanged video bytes.

GitHub only schedules workflows present on the repository's default branch. Installing the workflow on `ylif4-fix` alone does **not** enable the schedule. The workflow-only default-branch installation and any production-branch setting changes require explicit owner approval. Do not deploy the older main application as part of installing the scheduler.

New uploads are asynchronous: they can wait until the next scheduled run, plus encoding time. GitHub may delay scheduled runs. On public repositories GitHub may also disable scheduled workflows after 60 days without repository activity; keep operational monitoring and re-enable the workflow when needed. The uploaded original remains available while the compatible copy is pending, but a format-incompatible iPhone cannot play it until conversion completes.

Set `SUPABASE_SERVICE_ROLE_KEY` as an Actions secret before enabling the workflow. Use the CLI's stdin/env-file option; do not paste the value into commands, workflow YAML or logs. Restrict repository write access and review changes to the workflow/worker because they execute with this credential.

## Category Backfill

The course editor accepts `正向视频` and `负向视频`, alongside existing competency categories. Public mobile browsing defaults to positive videos; documents and ordinary videos remain under `其他资料`.

The one-time backfill only infers from explicit video section prefixes. Existing positive/negative categories are not reclassified. Mixed positive/negative sections are left alone.

```bash
node scripts/backfill-training-video-categories.mjs --snapshot /tmp/category-before.json
# Inspect counts and the protected snapshot first, then apply that exact snapshot.
node scripts/backfill-training-video-categories.mjs --snapshot /tmp/category-before.json --apply
```

Each update compares the original row and uses old category/updated timestamp conditions. Only category is written; automatic `updated_at` changes are allowed. If concurrent editing is detected, the script stops without undoing other user edits. Keep the snapshot and `.after.json` privately for audit/recovery.

## Verification and Recovery

- Run `npm test` and `npm run build` before release. Existing unrelated TypeScript errors must be distinguished from new errors; do not describe a failing `npm run lint` as passing.
- `scripts/verify-training-sharing.mjs` is the release-specific browser check for the 24/13 course batch. Set `VIDEO_TEST_COURSES` to a current public-course JSON response and `VIDEO_TEST_BASE_URL` to the local or deployed origin. It checks desktop/mobile Chromium and WebKit, real video playback, seeking and pause/resume, and writes screenshots/report to `VIDEO_TEST_OUTPUT` (default `/tmp/em-box-browser-verification`).
- Browser emulation does not certify real iPhone WeChat or every Android/Harmony device. Complete a real-device smoke test of a positive and a negative video after release.
- On worker failure, inspect the report, resolve network/format problems and rerun. Originals and course URLs remain intact. An invalid existing variant is reported rather than overwritten; verify its exact path before any operator-approved removal.
- A pre-provenance legacy copy with no successful report must not be adopted using codec checks alone. Recovery requires independently proving it corresponds to the unchanged source, or an operator-approved replacement of that derived copy. New uploads retain their atomic source metadata even if the subsequent report write is interrupted.
- Roll back frontend behavior by redeploying the previously verified `ylif4-fix` commit. Compatible copies are additive and can remain; do not delete originals during rollback.

## August 26 Validation

- Category snapshot identified 37 changes: 24 positive and 13 negative. All non-category content/configuration fields remained unchanged.
- The first verified 334-second source remained 252,825,372 bytes with unchanged ETag. Its compatible copy is 197,564,781 bytes, H.264 1440x1080, `yuv420p`, faststart, with working byte ranges.
- Local Chromium and WebKit verification used actual production media and passed category separation, unauthenticated access, playback, seek and pause/resume. Physical-phone verification is still a separate acceptance step.
- Final batch: all 37 variants passed source-fingerprint, codec, faststart and Range checks. Original total: 5,582,955,977 bytes; compatible total: 2,903,233,960 bytes. One initial remote-verification network failure was resolved by preserving the unproven derived copy in quarantine and regenerating it; no original object was moved or overwritten.
- Release code through `106cdc3` is on `ylif4-fix`. Formal-domain HTML/player/helper bytes matched the release, and five real-API/media browser configurations passed at desktop, iPhone WebKit, Android and Harmony viewport sizes. The test machine needed a loopback CONNECT address mapping for `hire.cmbpo.com`; HTTPS responses and media were not mocked.
- 263 unit tests passed, 1 skipped; production build passed. There are 21 pre-existing TypeScript-check errors outside this work.
- Owner-authorized production branch and encrypted Actions secret are configured. Default `main` received only the scheduler file in `db673ea` with `[skip ci]`, without redeploying its old application. [The first independent Actions run](https://github.com/cuihengjie1982/2026Hire/actions/runs/32915880254) succeeded and saved its report/cache. This does not remove GitHub schedule-delay/inactivity limitations or replace real-device acceptance.
