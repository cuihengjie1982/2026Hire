// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { ffmpegArgs, isCompatibleProbe, hasFastStart, processVideo, variantObjectName, variantExists, canReuseVerification } from './training-video-compatibility.mjs';

const goodProbe = {
  streams: [{ codec_type: 'video', codec_name: 'h264', codec_tag_string: 'avc1', profile: 'High', level: 41, pix_fmt: 'yuv420p', width: 1440, height: 1080 }],
  format: { duration: '12.5' },
};
function atom(type: string, size = 16) {
  const result = Buffer.alloc(size);
  result.writeUInt32BE(size);
  result.write(type, 4);
  return result;
}

describe('compatible media worker', () => {
  it('uses the exact same immutable object naming as the browser', () => {
    expect(variantObjectName('materials/a.mp4')).toBe('materials/ios-compatible/a.mp4');
    expect(() => variantObjectName('materials/ios-compatible/a.mp4')).toThrow();
  });
  it('normalizes codec, pixel format, audio, frame rate, aspect ratio and MP4 index', () => {
    const args = ffmpegArgs('in.mp4', 'out.mp4');
    expect(args).toEqual(expect.arrayContaining(['libx264', 'high', '4.1', 'avc1', 'yuv420p', 'aac', 'aac_low', '+faststart', '0:a:0?']));
    expect(args[args.indexOf('-vf') + 1]).toContain('force_original_aspect_ratio=decrease');
    expect(args[args.indexOf('-vf') + 1]).toContain('force_divisible_by=2');
    expect(args[args.indexOf('-vf') + 1]).toContain('1080');
    expect(args[args.indexOf('-vf') + 1]).toContain('fps=30');
    expect(args[args.indexOf('-vf') + 1]).toContain('out_range=tv');
    expect(args[args.indexOf('-color_range') + 1]).toBe('tv');
    expect(args.at(-1)).toBe('out.mp4');
  });
  it('accepts only media satisfying the playback contract', () => {
    expect(isCompatibleProbe(goodProbe)).toBe(true);
    for (const patch of [{ codec_name: 'hevc' }, { pix_fmt: 'yuvj420p' }, { height: 1440 }, { width: 1441 }, { level: 51 }]) {
      expect(isCompatibleProbe({ ...goodProbe, streams: [{ ...goodProbe.streams[0], ...patch }] })).toBe(false);
    }
    expect(isCompatibleProbe({ streams: [], format: {} })).toBe(false);
    expect(isCompatibleProbe({ ...goodProbe, streams: [...goodProbe.streams, { codec_type: 'audio', codec_name: 'opus' }] })).toBe(false);
  });
  it('checks MP4 atom order rather than searching arbitrary bytes for moov', () => {
    expect(hasFastStart(Buffer.concat([atom('ftyp'), atom('moov'), atom('mdat')]))).toBe(true);
    expect(hasFastStart(Buffer.concat([atom('ftyp'), atom('mdat'), atom('moov')]))).toBe(false);
    expect(hasFastStart(Buffer.from('moov'))).toBe(false);
  });
  it('treats Supabase Object not found as absent, not other lookup errors', async () => {
    const info = vi.fn().mockResolvedValue({ data: null, error: { status: 400, message: 'Object not found' } });
    const client = { storage: { from: () => ({ info }) } };
    await expect(variantExists(client, 'materials/ios-compatible/a.mp4')).resolves.toBe(false);
    info.mockResolvedValue({ data: null, error: { status: 403, message: 'Forbidden' } });
    await expect(variantExists(client, 'materials/ios-compatible/a.mp4')).rejects.toThrow('Forbidden');
  });
  it('reuses verification only when both original and compatible object fingerprints match', () => {
    const source = { etag: 'source', size: 123 };
    const remote = { etag: 'output', size: 100 };
    const previous = { originalAfter: source, output: { ...remote, probe: goodProbe, faststart: true, range: true }, status: 'created' };
    expect(canReuseVerification(previous, source, remote)).toBe(true);
    expect(canReuseVerification(previous, { ...source, etag: 'changed' }, remote)).toBe(false);
    expect(canReuseVerification(previous, source, { ...remote, size: 0 })).toBe(false);
    expect(canReuseVerification({ ...previous, status: 'failed' }, source, remote)).toBe(false);
    expect(canReuseVerification(null, source, remote)).toBe(false);
  });
  const job = { objectName: 'materials/a.mp4', url: 'https://example.invalid/a.mp4' };
  function io(exists = false) {
    return {
      exists: vi.fn().mockResolvedValue(exists),
      sourceState: vi.fn().mockResolvedValue({ etag: 'original', size: 123 }),
      download: vi.fn().mockResolvedValue(undefined),
      encode: vi.fn().mockResolvedValue(undefined),
      validateLocal: vi.fn().mockResolvedValue(goodProbe),
      upload: vi.fn().mockResolvedValue(undefined),
      verifyRemote: vi.fn().mockResolvedValue({ size: 100, probe: goodProbe }),
      cleanup: vi.fn().mockResolvedValue(undefined),
    };
  }
  it('skips an existing verified variant without touching source data', async () => {
    const deps = io(true);
    const result = await processVideo(job, deps);
    expect(result.status).toBe('skipped');
    expect(deps.verifyRemote).toHaveBeenCalledWith('materials/ios-compatible/a.mp4');
    expect(deps.encode).not.toHaveBeenCalled();
    expect(deps.upload).not.toHaveBeenCalled();
  });
  it('uploads only to the variant path after encoding and validating', async () => {
    const deps = io();
    const result = await processVideo(job, deps);
    expect(result.status).toBe('created');
    expect(deps.upload).toHaveBeenCalledWith('materials/ios-compatible/a.mp4');
    expect(deps.verifyRemote).toHaveBeenCalledWith('materials/ios-compatible/a.mp4');
    expect(result.originalBefore).toEqual(result.originalAfter);
    expect(deps.cleanup).toHaveBeenCalledOnce();
  });
  it('never uploads an invalid encoding and always cleans local temporary files', async () => {
    const deps = io();
    deps.validateLocal.mockRejectedValue(new Error('invalid encoding'));
    await expect(processVideo(job, deps)).rejects.toThrow('invalid encoding');
    expect(deps.upload).not.toHaveBeenCalled();
    expect(deps.cleanup).toHaveBeenCalledOnce();
  });
  it('detects an original changed during processing before upload', async () => {
    const deps = io();
    deps.sourceState.mockResolvedValueOnce({ etag: 'before', size: 123 }).mockResolvedValue({ etag: 'after', size: 123 });
    await expect(processVideo(job, deps)).rejects.toThrow('Original changed');
    expect(deps.upload).not.toHaveBeenCalled();
  });
  it('propagates upload failures without marking success', async () => {
    const deps = io();
    deps.upload.mockRejectedValue(new Error('Storage unavailable'));
    await expect(processVideo(job, deps)).rejects.toThrow('Storage unavailable');
    expect(deps.verifyRemote).not.toHaveBeenCalled();
    expect(deps.cleanup).toHaveBeenCalledOnce();
  });
});
