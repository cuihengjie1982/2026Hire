import { createReadStream, createWriteStream } from 'node:fs';
import { mkdtemp, open, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createClient } from '@supabase/supabase-js';
import { Upload } from 'tus-js-client';
import '../public/training-video-compatibility.js';

const media = globalThis.TrainingVideoCompatibility;
export const variantObjectName = media.variantObjectName;
const exec = promisify(execFile);
const BUCKET = 'training-materials';
const PROJECT_URL = 'https://eqdfyhqeqkbjvivscjau.supabase.co';
const REQUEST_TIMEOUT = 60_000;
const MAX_SOURCE_BYTES = 500 * 1024 * 1024;

export function ffmpegArgs(input, output) {
  return ['-hide_banner', '-loglevel', 'error', '-nostdin', '-n', '-i', input,
    '-map', '0:v:0', '-map', '0:a:0?', '-sn', '-dn', '-map_metadata', '-1',
    '-vf', "scale=w='min(1920,iw)':h='min(1080,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2:out_range=tv,setsar=1,fps=30",
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-profile:v', 'high',
    '-level:v', '4.1', '-tag:v', 'avc1', '-pix_fmt', 'yuv420p', '-color_range', 'tv',
    '-maxrate', '8M', '-bufsize', '16M', '-g', '60',
    '-c:a', 'aac', '-profile:a', 'aac_low', '-b:a', '128k', '-ac', '2',
    '-movflags', '+faststart', output];
}

export function isCompatibleProbe(probe) {
  const streams = probe?.streams ?? [];
  const videos = streams.filter(s => s.codec_type === 'video');
  const audio = streams.filter(s => s.codec_type === 'audio');
  const v = videos[0];
  return videos.length === 1 && v.codec_name === 'h264' && v.codec_tag_string === 'avc1' &&
    v.profile === 'High' && v.level <= 41 && v.pix_fmt === 'yuv420p' &&
    v.width > 0 && v.width <= 1920 && v.height > 0 && v.height <= 1080 &&
    v.width % 2 === 0 && v.height % 2 === 0 && Number(probe.format?.duration) > 0 &&
    audio.every(a => a.codec_name === 'aac' && a.profile === 'LC');
}

export function hasFastStart(buffer) {
  let offset = 0;
  while (offset + 8 <= buffer.length) {
    let size = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    if (type === 'mdat') return false;
    if (type === 'moov') return true;
    if (size === 1) {
      if (offset + 16 > buffer.length) return false;
      size = Number(buffer.readBigUInt64BE(offset + 8));
    }
    if (size < 8 || !Number.isSafeInteger(size)) return false;
    offset += size;
  }
  return false;
}

function assertUnchanged(before, after) {
  if (!before.etag || before.etag !== after.etag || before.size !== after.size) {
    throw new Error('Original changed during processing; refusing to publish a stale variant');
  }
}

function fingerprintMatches(expected, actual) {
  return Boolean(expected?.etag && expected.size > 0 && expected.etag === actual?.etag && expected.size === actual.size);
}

export function createVariantProvenance(job, source, output) {
  return { version: 1, objectName: job.objectName, target: variantObjectName(job.objectName),
    source: { etag: source.etag, size: source.size }, output: { etag: output.etag, size: output.size } };
}

function reportProvenance(job, previous) {
  if (!previous || previous.objectName !== job.objectName || previous.target !== variantObjectName(job.objectName) ||
      !fingerprintMatches(previous.originalBefore, previous.originalAfter) ||
      !canReuseVerification(previous, previous.originalAfter, previous.output)) return null;
  return createVariantProvenance(job, previous.originalAfter, previous.output);
}

function assertProvenanceSource(record, job, source) {
  if (!record) throw new Error('Variant provenance missing; refusing to adopt an unverified existing copy');
  if (record.version !== 1 || record.objectName !== job.objectName || record.target !== variantObjectName(job.objectName) ||
      !fingerprintMatches(record.source, source)) throw new Error('Variant provenance source mismatch; original may have changed');
}

function assertProvenanceOutput(record, output) {
  if (!fingerprintMatches(record.output, output)) throw new Error('Variant provenance output mismatch; compatible copy may have changed');
}

export function canReuseVerification(previous, original, remote) {
  return Boolean(previous && remote?.etag && remote.size > 0 && ['created', 'skipped'].includes(previous.status) &&
    previous.originalAfter?.etag === original.etag && previous.originalAfter?.size === original.size &&
    previous.output?.etag === remote.etag && previous.output?.size === remote.size &&
    remote.etag && remote.size > 0 && previous.output.faststart && previous.output.range &&
    isCompatibleProbe(previous.output.probe));
}

export async function processVideo(job, io) {
  const target = variantObjectName(job.objectName);
  try {
    const originalBefore = await io.sourceState();
    if (await io.exists(target)) {
      const persisted = await io.readProvenance(target);
      const provenance = persisted ?? reportProvenance(job, io.previous);
      assertProvenanceSource(provenance, job, originalBefore);
      const output = await io.verifyRemote(target);
      assertProvenanceOutput(provenance, output);
      const originalAfter = await io.sourceState();
      assertUnchanged(originalBefore, originalAfter);
      if (!persisted) await io.writeProvenance(target, provenance);
      return { objectName: job.objectName, target, status: 'skipped', originalBefore, originalAfter, output };
    }
    await io.download();
    await io.encode();
    await io.validateLocal();
    assertUnchanged(originalBefore, await io.sourceState());
    await io.upload(target, originalBefore);
    const output = await io.verifyRemote(target);
    const originalAfter = await io.sourceState();
    assertUnchanged(originalBefore, originalAfter);
    await io.writeProvenance(target, createVariantProvenance(job, originalBefore, output));
    return { objectName: job.objectName, target, status: 'created', originalBefore, originalAfter, output };
  } finally {
    await io.cleanup();
  }
}

export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY must be set in the worker environment');
  return createClient(PROJECT_URL, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { fetch: (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT) }) },
  });
}

export async function listCourses(client) {
  const courses = [];
  for (let offset = 0; ; offset += 200) {
    const { data, error } = await client.from('training_courses').select('*')
      .eq('is_active', true).order('id').range(offset, offset + 199);
    if (error) throw new Error(`Course list failed: ${error.message}`);
    courses.push(...data);
    if (data.length < 200) return courses;
  }
}

export function collectVideos(courses) {
  const jobs = new Map();
  for (const course of courses) {
    const items = [...(Array.isArray(course.content) ? course.content : []), ...(Array.isArray(course.materials) ? course.materials : [])];
    for (const item of items) {
      const url = item.contentUrl ?? item.content_url ?? item.url;
      if (!url) continue;
      const objectName = media.objectName(url, 'https://hire.cmbpo.com');
      try { variantObjectName(objectName); } catch { continue; }
      if (!jobs.has(objectName)) jobs.set(objectName, { objectName, url: media.originalUrl(objectName), courseIds: [] });
      jobs.get(objectName).courseIds.push(course.id);
    }
  }
  return [...jobs.values()];
}

export async function variantExists(client, target) {
  const { data, error } = await client.storage.from(BUCKET).info(target);
  if (error) {
    if (error.status === 404 || (error.status === 400 && error.message === 'Object not found')) return false;
    throw new Error(`Variant lookup failed: ${error.message}`);
  }
  return Boolean(data);
}

export async function readVariantProvenance(client, target) {
  const bucket = client.storage.from(BUCKET);
  const { data, error } = await bucket.download(`${target}.source.json`);
  if (!error) {
    if (data.size > 8192) throw new Error('Variant provenance record too large');
    return JSON.parse(await data.text());
  }
  if (error.status !== 404 && !(error.status === 400 && error.message === 'Object not found')) {
    throw new Error(`Variant provenance lookup failed: ${error.message}`);
  }
  // TUS stores source identity atomically with the file, so a later report-write failure is recoverable.
  const info = await bucket.info(target);
  if (info.error) throw new Error(`Variant metadata lookup failed: ${info.error.message}`);
  const uploaded = info.data.metadata?.trainingVideoSource;
  if (!uploaded) return null;
  if (uploaded.outputSize !== info.data.size || !info.data.etag) throw new Error('Variant provenance output size mismatch');
  const etag = info.data.etag.startsWith('"') ? info.data.etag : JSON.stringify(info.data.etag);
  return { version: uploaded.version, objectName: uploaded.objectName, target: uploaded.target,
    source: uploaded.source, output: { etag, size: info.data.size } };
}

export async function writeVariantProvenance(client, target, record) {
  if (variantObjectName(record.objectName) !== target) throw new Error('Invalid provenance target');
  const { error } = await client.storage.from(BUCKET).upload(`${target}.source.json`, Buffer.from(JSON.stringify(record)), {
    contentType: 'text/plain', cacheControl: '31536000', upsert: false,
  });
  if (error) throw new Error(`Variant provenance save failed: ${error.message}`);
}

async function checkedFetch(url, options = {}) {
  const res = await fetch(url, { ...options, signal: AbortSignal.timeout(options.timeout ?? REQUEST_TIMEOUT) });
  if (!res.ok) throw new Error(`Media HTTP ${res.status}`);
  return res;
}

async function sourceState(url) {
  const res = await checkedFetch(url, { method: 'HEAD' });
  return { etag: res.headers.get('etag'), size: Number(res.headers.get('content-length')) };
}

async function probeFile(path) {
  const { stdout } = await exec('ffprobe', ['-v', 'error', '-rw_timeout', '60000000', '-show_streams', '-show_format', '-of', 'json', path], { timeout: 120_000, maxBuffer: 2 * 1024 * 1024 });
  return JSON.parse(stdout);
}

async function validateLocal(path, originalPath) {
  const probe = await probeFile(path);
  if (!isCompatibleProbe(probe)) throw new Error('Encoded video fails H.264 compatibility checks');
  const original = await probeFile(originalPath);
  const durationDelta = Math.abs(Number(original.format.duration) - Number(probe.format.duration));
  if (durationDelta > 1) throw new Error(`Encoded duration differs by ${durationDelta.toFixed(2)} seconds`);
  if (original.streams.some(s => s.codec_type === 'audio') !== probe.streams.some(s => s.codec_type === 'audio')) {
    throw new Error('Encoded audio track presence differs from original');
  }
  const file = await open(path, 'r');
  try {
    const prefix = Buffer.alloc(1024 * 1024);
    const { bytesRead } = await file.read(prefix, 0, prefix.length, 0);
    if (!hasFastStart(prefix.subarray(0, bytesRead))) throw new Error('Encoded MP4 is not faststart');
  } finally { await file.close(); }
  return probe;
}

async function verifyRemote(path, expectedSize) {
  const url = media.originalUrl(path);
  const state = await sourceState(url);
  if (!state.size || (expectedSize && state.size !== expectedSize)) throw new Error('Remote variant size mismatch');
  const response = await checkedFetch(url, { headers: { Range: 'bytes=0-65535' } });
  if (response.status !== 206 || !response.headers.get('content-range')?.startsWith('bytes 0-') ||
      !response.headers.get('content-type')?.startsWith('video/mp4')) {
    await response.body?.cancel();
    throw new Error('Remote variant does not support MP4 byte ranges');
  }
  if (!hasFastStart(Buffer.from(await response.arrayBuffer()))) throw new Error('Remote variant is not faststart');
  const probe = await probeFile(url);
  if (!isCompatibleProbe(probe)) throw new Error('Remote variant codec validation failed');
  return { ...state, range: true, faststart: true, probe };
}

export async function tusUpload(file, objectName, job, source) {
  if (variantObjectName(job.objectName) !== objectName) throw new Error('Upload target must be a compatible variant');
  const size = (await stat(file)).size;
  const stream = createReadStream(file);
  await new Promise((resolveUpload, rejectUpload) => {
    let timer;
    const upload = new Upload(stream, {
      endpoint: PROJECT_URL.replace('.supabase.co', '.storage.supabase.co') + '/storage/v1/upload/resumable',
      uploadSize: size,
      chunkSize: 6 * 1024 * 1024,
      retryDelays: [0, 3000, 5000, 10000, 20000],
      uploadDataDuringCreation: true,
      storeFingerprintForResuming: false,
      headers: { authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`, 'x-upsert': 'false' },
      metadata: { bucketName: BUCKET, objectName, contentType: 'video/mp4', cacheControl: '31536000',
        metadata: JSON.stringify({ trainingVideoSource: {
          version: 1, objectName: job.objectName, target: objectName, source, outputSize: size,
        } }) },
      onError(error) {
        clearTimeout(timer);
        stream.destroy();
        const status = error.originalResponse?.getStatus();
        rejectUpload(new Error(`Variant TUS upload failed${status ? ` (HTTP ${status})` : ''}`));
      },
      onSuccess() { clearTimeout(timer); stream.destroy(); resolveUpload(); },
    });
    timer = setTimeout(() => {
      upload.abort().catch(() => {});
      stream.destroy();
      rejectUpload(new Error('Variant upload exceeded 30 minute limit'));
    }, 30 * 60_000);
    upload.start();
  });
}

async function makeIO(client, job, previous, forceVerification) {
  const dir = await mkdtemp(join(tmpdir(), 'training-compatible-'));
  const input = join(dir, 'source');
  const output = join(dir, 'compatible.mp4');
  let encodedSize;
  let originalState;
  return {
    previous,
    sourceState: async () => { originalState = await sourceState(job.url); return originalState; },
    exists: target => variantExists(client, target),
    readProvenance: target => readVariantProvenance(client, target),
    writeProvenance: (target, record) => writeVariantProvenance(client, target, record),
    download: async () => {
      const res = await checkedFetch(job.url, { timeout: 20 * 60_000 });
      const size = Number(res.headers.get('content-length'));
      if (!size || size > MAX_SOURCE_BYTES) {
        await res.body?.cancel();
        throw new Error('Source size missing or exceeds 500 MiB safety limit');
      }
      await pipeline(Readable.fromWeb(res.body), createWriteStream(input, { flags: 'wx' }));
      if ((await stat(input)).size !== size) throw new Error('Incomplete source download');
    },
    encode: async () => {
      await exec('ffmpeg', ffmpegArgs(input, output), { timeout: 45 * 60_000, maxBuffer: 1024 * 1024 });
    },
    validateLocal: async () => {
      const probe = await validateLocal(output, input);
      encodedSize = (await stat(output)).size;
      return probe;
    },
    upload: (target, source) => tusUpload(output, target, job, source),
    verifyRemote: async target => {
      if (previous && !encodedSize && !forceVerification) {
        const remote = await sourceState(media.originalUrl(target));
        if (canReuseVerification(previous, originalState, remote)) return { ...previous.output, reusedVerification: true };
      }
      return verifyRemote(target, encodedSize);
    },
    cleanup: () => rm(dir, { recursive: true, force: true }),
  };
}

async function main() {
  const args = process.argv.slice(2);
  const option = name => args.includes(name) ? args[args.indexOf(name) + 1] : undefined;
  const client = createAdminClient();
  const jobs = collectVideos(await listCourses(client)).filter(job => !option('--only') || job.objectName === option('--only'));
  if (!jobs.length) throw new Error('No matching original videos found');
  const reportPath = option('--report') ?? join(tmpdir(), 'training-video-compatibility-report.json');
  let previousResults = [];
  try { previousResults = JSON.parse(await readFile(reportPath, 'utf8')).results ?? []; }
  catch (error) { if (error.code !== 'ENOENT') console.warn('Previous verification report unavailable; requiring persisted source provenance.'); }
  const report = { startedAt: new Date().toISOString(), total: jobs.length, results: [] };
  console.log(`Found ${jobs.length} original videos; originals will not be modified.`);
  if (args.includes('--dry-run')) {
    console.log(JSON.stringify(jobs.map(j => ({ objectName: j.objectName, target: variantObjectName(j.objectName) })), null, 2));
    return;
  }
  for (const job of jobs) {
    console.log(`[${report.results.length + 1}/${jobs.length}] ${job.objectName}`);
    try {
      const previous = previousResults.find(r => r.objectName === job.objectName);
      const result = await processVideo(job, await makeIO(client, job, previous, args.includes('--verify-existing')));
      report.results.push(result);
      console.log(`  ${result.status}: H.264, faststart, Range verified`);
    } catch (error) {
      report.results.push({ objectName: job.objectName, status: 'failed', error: error.message });
      console.error(`  failed: ${error.message}`);
    }
    await writeFile(reportPath, JSON.stringify(report, null, 2));
  }
  report.finishedAt = new Date().toISOString();
  await writeFile(reportPath, JSON.stringify(report, null, 2));
  const failed = report.results.filter(r => r.status === 'failed');
  console.log(`Complete: ${jobs.length - failed.length}/${jobs.length} verified. Report: ${reportPath}`);
  if (failed.length) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
