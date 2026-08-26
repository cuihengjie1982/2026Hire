// @vitest-environment node
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { afterEach, describe, expect, it, vi } from 'vitest';

const raw = 'https://eqdfyhqeqkbjvivscjau.supabase.co/storage/v1/object/public/training-materials/materials/test.mp4';
const variant = raw.replace('/materials/test', '/materials/ios-compatible/test');
const proxy = 'https://hire.cmbpo.com/training-media/materials/test.mp4';
const course = {
  title: 'Example',
  content: [{ contentType: 'video', contentUrl: raw }, { contentType: 'text', text: 'Transcript' }],
  assessment_config: { actionCaptionsByUrl: { [raw]: [{ start: 0, end: 4, text: 'Original caption' }] } },
};
const windows: JSDOM[] = [];

async function loadPlayer(play = vi.fn().mockResolvedValue(undefined)) {
  const dom = new JSDOM(readFileSync('public/training-video.html', 'utf8'), {
    url: 'https://hire.cmbpo.com/tv/course/token', runScripts: 'outside-only',
  });
  windows.push(dom);
  const { window } = dom;
  Object.defineProperty(window.navigator, 'userAgent', { value: 'iPhone MicroMessenger' });
  Object.assign(window, {
    fetch: vi.fn().mockResolvedValue({ ok: true, json: async () => ({ course }) }),
    MediaError: { MEDIA_ERR_NETWORK: 2, MEDIA_ERR_DECODE: 3, MEDIA_ERR_SRC_NOT_SUPPORTED: 4 },
  });
  const video = window.document.querySelector('video')!;
  Object.defineProperties(video, {
    play: { value: play }, pause: { value: vi.fn() }, load: { value: vi.fn() },
    error: { configurable: true, value: { code: 4 } },
    paused: { configurable: true, value: true },
  });
  window.eval(readFileSync('public/training-video-compatibility.js', 'utf8'));
  for (const script of window.document.querySelectorAll('script:not([src])')) window.eval(script.textContent!);
  await new Promise(resolve => setImmediate(resolve));
  return {
    window, video, play,
    button: window.document.getElementById('play-button')!,
    message: window.document.getElementById('message')!,
    error: () => video.dispatchEvent(new window.Event('error')),
  };
}

afterEach(() => { for (const dom of windows.splice(0)) dom.window.close(); vi.useRealTimers(); });

describe('public player source transitions', () => {
  it('loads the iOS-compatible file without requiring login', async () => {
    const { video, window } = await loadPlayer();
    expect(video.src).toBe(variant);
    expect(window.location.pathname).toBe('/tv/course/token');
    expect(window.document.getElementById('transcript-content')!.textContent).toContain('Transcript');
    expect(window.document.getElementById('actions-content')!.textContent).toContain('Original caption');
  });
  it('tries each fallback once, leaves the original open link, and restarts on retry', async () => {
    const { video, error, button, window } = await loadPlayer();
    error(); expect(video.src).toBe(raw);
    error(); expect(video.src).toBe(proxy);
    error(); expect(button.textContent).toBe('重新播放');
    expect(window.document.getElementById('open-video')!.getAttribute('href')).toBe(raw);
    button.click(); expect(video.src).toBe(variant);
  });
  it('does not consume a fallback on user-gesture permission errors', async () => {
    const play = vi.fn().mockRejectedValue(Object.assign(new Error('Tap required'), { name: 'NotAllowedError' }));
    const { video, button, message } = await loadPlayer(play);
    button.click();
    await new Promise(resolve => setImmediate(resolve));
    expect(video.src).toBe(variant);
    expect(message.textContent).toContain('点击');
    expect(button.classList.contains('hidden')).toBe(false);
  });
  it('ignores an old play promise rejected after the source has switched', async () => {
    let rejectOld: (value: Error) => void = () => {};
    const play = vi.fn().mockImplementationOnce(() => new Promise((_, reject) => { rejectOld = reject; }))
      .mockResolvedValue(undefined);
    const { video, button, error } = await loadPlayer(play);
    button.click(); error();
    expect(video.src).toBe(raw);
    rejectOld(Object.assign(new Error('Source changed'), { name: 'AbortError' }));
    await new Promise(resolve => setImmediate(resolve));
    expect(video.src).toBe(raw);
  });
  it('continues playback automatically after a media error if playback was requested', async () => {
    const { button, error, play } = await loadPlayer();
    button.click(); error();
    await new Promise(resolve => setImmediate(resolve));
    expect(play).toHaveBeenCalledTimes(2);
  });
  it('clears a stale buffering overlay when playback time advances', async () => {
    const { window, video, button, message } = await loadPlayer();
    button.click();
    Object.defineProperty(video, 'paused', { value: false });
    video.currentTime = 2;
    video.dispatchEvent(new window.Event('timeupdate'));
    expect(button.classList.contains('hidden')).toBe(true);
    expect(message.textContent).not.toContain('缓冲');
  });
  it('falls back when a play event fires but frames never start', async () => {
    const { window, video, button } = await loadPlayer();
    vi.useFakeTimers();
    button.click();
    Object.defineProperty(video, 'paused', { value: false });
    video.dispatchEvent(new window.Event('play'));
    await vi.advanceTimersByTimeAsync(8100);
    expect(video.src).toBe(raw);
  });
  it('arms fallback when playback is started with native video controls', async () => {
    const { window, video } = await loadPlayer();
    vi.useFakeTimers();
    Object.defineProperty(video, 'paused', { value: false });
    video.dispatchEvent(new window.Event('play'));
    await vi.advanceTimersByTimeAsync(8100);
    expect(video.src).toBe(raw);
  });
  it('does not show buffering or change sources after the user pauses', async () => {
    const { window, video, button, message } = await loadPlayer();
    vi.useFakeTimers();
    button.click();
    video.dispatchEvent(new window.Event('pause'));
    video.dispatchEvent(new window.Event('waiting'));
    await vi.advanceTimersByTimeAsync(9000);
    expect(video.src).toBe(variant);
    expect(button.textContent).toBe('继续播放');
    expect(message.textContent).not.toContain('正在缓冲');
  });
  it('restores the timestamp on fallback so action captions keep their place', async () => {
    const { window, video, error } = await loadPlayer();
    video.currentTime = 30;
    error();
    video.currentTime = 0;
    Object.defineProperty(video, 'duration', { value: 100 });
    video.dispatchEvent(new window.Event('loadedmetadata'));
    expect(video.currentTime).toBe(30);
  });
});
