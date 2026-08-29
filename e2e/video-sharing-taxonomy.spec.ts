import {expect, test} from '@playwright/test';

test.use({channel: 'chrome'});

const publicCourses = {
  items: [
    {
      id: 'positive-course',
      title: '整理桌面示范',
      description: '流程自然完整',
      category: '正向视频',
      share_token: 'positive-token',
      content: [{sectionTitle: '整理桌面', contentType: 'video', contentUrl: 'https://example.com/positive.mp4'}],
      materials: [],
      task_category: {id: 'task-organizing', name: '收纳'},
      quality_tags: [{id: 'tag-natural', name: '动作自然'}],
      video_polarity: 'positive',
    },
    {
      id: 'negative-course',
      title: '擦桌子问题示例',
      description: '摆拍和动作过慢',
      category: '负向视频',
      share_token: 'negative-token',
      content: [{sectionTitle: '擦桌子', contentType: 'video', contentUrl: 'https://example.com/negative.mp4'}],
      materials: [],
      task_category: {id: 'task-cleaning', name: '清洁'},
      quality_tags: [
        {id: 'tag-staged', name: '摆拍严重'},
        {id: 'tag-slow', name: '动作太慢'},
      ],
      video_polarity: 'negative',
      video_severity: 'severe',
    },
  ],
};

test('mobile public page separates positive and negative videos with contextual filters', async ({page}) => {
  await page.setViewportSize({width: 390, height: 844});
  await page.route('**/training-public-api/courses', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(publicCourses),
  }));

  const baseUrl = process.env.VIDEO_SHARING_TEST_BASE_URL ?? '';
  await page.goto(`${baseUrl}/video-sharing.html`);

  await expect(page.getByRole('heading', {name: '视频分享'})).toBeVisible();
  await expect(page.getByRole('button', {name: '正向视频 1'})).toBeVisible();
  await expect(page.getByRole('button', {name: '负向视频 1'})).toBeVisible();
  await expect(page.getByText('整理桌面', {exact: true})).toBeVisible();
  await expect(page.getByRole('button', {name: '收纳 1'})).toBeVisible();
  await expect(page.getByRole('button', {name: '动作自然 1'})).toBeVisible();
  await expect(page.getByText('擦桌子', {exact: true})).toHaveCount(0);

  await page.getByRole('button', {name: '负向视频 1'}).click();

  await expect(page.getByText('擦桌子', {exact: true})).toBeVisible();
  await expect(page.getByRole('button', {name: '清洁 1'})).toBeVisible();
  await expect(page.getByRole('button', {name: '摆拍严重 1'})).toBeVisible();
  await expect(page.getByRole('button', {name: '动作太慢 1'})).toBeVisible();
  await expect(page.getByText('整理桌面', {exact: true})).toHaveCount(0);
  await expect(page.locator('.tag-severity')).toHaveText('严重');

  const hasPageOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(hasPageOverflow).toBe(false);
  await page.screenshot({path: '/tmp/video-sharing-taxonomy-mobile.png', fullPage: true});
});
