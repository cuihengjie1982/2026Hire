import { chromium, webkit } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const base = process.env.VIDEO_TEST_BASE_URL || 'http://localhost:3016';
const output = process.env.VIDEO_TEST_OUTPUT || '/private/tmp/em-box-browser-verification';
const data = JSON.parse(await readFile(process.env.VIDEO_TEST_COURSES || '/private/tmp/em-box-public-current.json', 'utf8'));
const negative = data.items.find(c => c.id === '557f442c-03f5-4e25-9539-695a392733d0');
if (!negative) throw new Error('Verification course missing from public snapshot');
const environments = [
  { name: 'desktop-chromium', engine: chromium, viewport: { width: 1440, height: 1000 } },
  { name: 'iphone-wechat-webkit', engine: webkit, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 Version/18.5 Mobile/15E148 MicroMessenger/8.0.60' },
  { name: 'iphone-safari-webkit', engine: webkit, viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 Version/18.5 Mobile/15E148 Safari/604.1' },
  { name: 'android-wechat-chromium', engine: chromium, viewport: { width: 393, height: 851 }, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/126.0.0.0 Mobile Safari/537.36 MicroMessenger/8.0.60' },
  { name: 'harmony-wechat-chromium', engine: chromium, viewport: { width: 360, height: 780 }, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (Linux; Android 12; HarmonyOS) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36 MicroMessenger/8.0.60' },
];
await mkdir(output, { recursive: true });
const results = [];
for (const env of environments) {
  const browser = await env.engine.launch();
  const context = await browser.newContext({ viewport: env.viewport, isMobile: env.isMobile, hasTouch: env.hasTouch, userAgent: env.userAgent });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  try {
    // Only local routing is substituted. Course payloads and video bytes come from production.
    if (base.startsWith('http://localhost')) {
      await page.route('**/training-public-api/**', async route => {
        const suffix = new URL(route.request().url()).pathname.split('/training-public-api/')[1];
        const query = new URL(route.request().url()).search;
        const res = await route.fetch({ url: `https://eqdfyhqeqkbjvivscjau.supabase.co/functions/v1/training-public/${suffix}${query}` });
        await route.fulfill({ response: res });
      });
      await page.route('**/training-media/**', async route => {
        const suffix = new URL(route.request().url()).pathname.split('/training-media/')[1];
        await route.fulfill({ status: 307, headers: { location: `https://eqdfyhqeqkbjvivscjau.supabase.co/storage/v1/object/public/training-materials/${suffix}` } });
      });
    }
    await page.goto(`${base}/video-sharing.html`, { waitUntil: 'domcontentloaded' });
    await page.locator('[data-category="positive"]').waitFor({ timeout: 30_000 });
    const positiveCount = await page.locator('.card').count();
    if (positiveCount !== 24) throw new Error(`Expected 24 positive cards, saw ${positiveCount}`);
    const positiveTags = await page.locator('.card .tag').allTextContents();
    if (positiveTags.some(t => t !== '正向视频')) throw new Error('Mixed positive list');
    await page.screenshot({ path: join(output, `${env.name}-positive.png`) });
    await page.locator('[data-category="negative"]').click();
    const negativeCount = await page.locator('.card').count();
    if (negativeCount !== 13) throw new Error(`Expected 13 negative cards, saw ${negativeCount}`);
    if ((await page.locator('.card .tag').allTextContents()).some(t => t !== '负向视频')) throw new Error('Mixed negative list');
    await page.locator('#search').fill('整理桌面');
    if (await page.locator('.card').count() !== 1) throw new Error('Scoped search failed');
    await page.locator('#search').fill('');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    if (overflow) throw new Error('Horizontal page overflow');
    await page.screenshot({ path: join(output, `${env.name}-negative.png`) });

    const playerPath = base.startsWith('http://localhost')
      ? `/training-video.html?courseId=${negative.id}&token=${encodeURIComponent(negative.share_token)}` : negative.share_path;
    await page.goto(base + playerPath, { waitUntil: 'domcontentloaded' });
    await page.locator('#player:not(.hidden)').waitFor({ timeout: 30_000 });
    const firstSource = await page.locator('video').getAttribute('src');
    await page.locator('#play-button').click();
    await page.waitForFunction(() => {
      const v = document.querySelector('video');
      return v && v.currentTime > 1 && !v.paused;
    }, undefined, { timeout: 45_000 });
    await page.locator('#play-button').waitFor({ state: 'hidden', timeout: 10_000 });
    await page.evaluate(() => { document.querySelector('video').currentTime = 25; });
    await page.waitForFunction(() => document.querySelector('video').currentTime > 25.2, undefined, { timeout: 30_000 });
    await page.evaluate(() => { document.querySelector('video').pause(); });
    await page.locator('#play-button:not(.hidden)').waitFor();
    await page.locator('#play-button').click();
    await page.waitForFunction(() => !document.querySelector('video').paused, undefined, { timeout: 10_000 });
    const playback = await page.locator('video').evaluate(v => ({ currentTime: v.currentTime, width: v.videoWidth, height: v.videoHeight, source: v.currentSrc, readyState: v.readyState, error: v.error?.code }));
    if (!playback.width || !playback.height || playback.error) throw new Error('Blank or failed playback');
    await page.screenshot({ path: join(output, `${env.name}-playing.png`) });
    if (errors.length) throw new Error(`Page errors: ${errors.join('; ')}`);
    results.push({ environment: env.name, status: 'passed', positiveCount, negativeCount, firstSource, playback });
    console.log(`${env.name}: categories 24/13, no login, play/seek/pause/resume passed`);
  } catch (error) {
    await page.screenshot({ path: join(output, `${env.name}-failed.png`) }).catch(() => {});
    const state = await page.locator('video').evaluateAll(videos => videos.map(v => ({ source: v.currentSrc, currentTime: v.currentTime, readyState: v.readyState, error: v.error?.code }))).catch(() => []);
    results.push({ environment: env.name, status: 'failed', error: error.message, state, errors });
    console.error(`${env.name}: ${error.message}`);
  } finally {
    await context.close();
    await browser.close();
    await writeFile(join(output, 'report.json'), JSON.stringify(results, null, 2));
  }
}
if (results.some(r => r.status !== 'passed')) process.exitCode = 1;
