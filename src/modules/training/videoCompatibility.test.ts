import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';

const origin = 'https://hire.cmbpo.com';
const root = 'https://eqdfyhqeqkbjvivscjau.supabase.co/storage/v1/object/public/training-materials/';
const raw = `${root}materials/example.mp4`;
const variant = `${root}materials/ios-compatible/example.mp4`;
const proxy = `${origin}/training-media/materials/example.mp4`;
let api: {
  variantUrl: (url: string, origin: string) => string;
  variantObjectName: (path: string) => string;
  candidates: (url: string, options: { origin: string; userAgent: string; touchPoints?: number }) => string[];
};

beforeAll(() => {
  window.eval(readFileSync('public/training-video-compatibility.js', 'utf8'));
  api = (window as any).TrainingVideoCompatibility;
});

describe('shared video compatibility addresses', () => {
  it('derives the same immutable variant from raw and proxied URLs', () => {
    expect(api.variantUrl(raw, origin)).toBe(variant);
    expect(api.variantUrl(proxy, origin)).toBe(variant);
  });
  it('retains encoded file names and converts other containers without collisions', () => {
    expect(api.variantUrl(`${root}materials/%E6%93%A6%20%E6%A1%8C.mov?x=1`, origin)).toBe(`${root}materials/ios-compatible-containers/%E6%93%A6%20%E6%A1%8C.mov.mp4`);
  });
  it.each(['mov', 'webm', 'm4v', 'avi', 'mkv'])('separates %s originals from MP4s with the same multi-extension basename', extension => {
    const source = `materials/nested/example.${extension}`;
    expect(api.variantObjectName(source)).not.toBe(api.variantObjectName(`${source}.mp4`));
    expect(api.variantObjectName(`${source}.mp4`)).toBe(`materials/ios-compatible/nested/example.${extension}.mp4`);
  });
  it('does not generate variants for foreign URLs, documents, or existing variants', () => {
    expect(api.variantUrl('https://example.org/video.mp4', origin)).toBe('');
    expect(api.variantUrl(`${root}materials/file.pdf`, origin)).toBe('');
    expect(api.variantUrl(variant, origin)).toBe('');
    expect(api.variantUrl('https://evil.example/storage/v1/object/public/training-materials/materials/a.mp4', origin)).toBe('');
  });
  it('rejects invalid storage object names', () => {
    for (const path of ['other/video.mp4', 'materials/../video.mp4', 'materials/ios-compatible/a.mp4', 'materials/ios-compatible-containers/a.mov.mp4', 'materials/a.pdf']) {
      expect(() => api.variantObjectName(path)).toThrow();
    }
  });
  it.each(['iPhone MicroMessenger', 'iPhone Safari', 'iPad Safari'])('prioritizes the compatible file on %s', (userAgent) => {
    expect(api.candidates(raw, { origin, userAgent })).toEqual([variant, raw, proxy]);
  });
  it('recognizes desktop-mode iPad Safari', () => {
    expect(api.candidates(raw, { origin, userAgent: 'Macintosh Safari', touchPoints: 5 })).toEqual([variant, raw, proxy]);
  });
  it.each(['Android MicroMessenger', 'HarmonyOS MicroMessenger'])('preserves the working WeChat route on %s', (userAgent) => {
    expect(api.candidates(raw, { origin, userAgent })).toEqual([proxy, raw, variant]);
  });
  it('uses original first on desktop and deduplicates external addresses', () => {
    expect(api.candidates(raw, { origin, userAgent: 'Macintosh Chrome' })).toEqual([raw, proxy, variant]);
    expect(api.candidates('https://example.org/video.mp4', { origin, userAgent: 'iPhone' })).toEqual(['https://example.org/video.mp4']);
    expect(api.candidates('', { origin, userAgent: 'iPhone' })).toEqual([]);
  });
});
