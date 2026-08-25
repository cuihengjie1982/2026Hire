import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import {describe, expect, it, vi} from 'vitest';

type Course = Record<string, unknown>;

const courses: Course[] = [
  {
    id: 'positive', title: '正向课程', category: '正向视频', share_token: 'positive-token',
    content: [{sectionTitle: '正向示范', contentUrl: 'https://files.example.com/positive.mp4'}], materials: [],
  },
  {
    id: 'negative', title: '负向课程', category: '负向视频', share_token: 'negative-token',
    content: [{sectionTitle: '负向示范', contentUrl: 'https://files.example.com/negative.mp4'}], materials: [],
  },
  {
    id: 'ordinary', title: '沟通课程', category: '沟通表达', share_token: 'ordinary-token',
    content: [{sectionTitle: '普通视频', contentUrl: 'https://files.example.com/ordinary.mp4'}], materials: [],
  },
  {
    id: 'document', title: '制度课程', category: '专业能力', share_token: 'document-token',
    content: [], materials: [{title: '培训资料', url: 'https://files.example.com/guide.pdf'}],
  },
];

const html = readFileSync('public/video-sharing.html', 'utf8');

async function loadPage(response: {ok: boolean; json: () => Promise<unknown>} = {
  ok: true,
  json: async () => ({items: courses}),
}) {
  const fetch = vi.fn().mockResolvedValue(response);
  const dom = new JSDOM(html, {
    url: 'https://hire.example.com/video-sharing',
    runScripts: 'dangerously',
    beforeParse(window) {
      Object.defineProperty(window, 'fetch', {value: fetch, configurable: true});
    },
  });
  await new Promise(resolve => setTimeout(resolve, 0));
  return dom;
}

describe('public video sharing page', () => {
  it('shows the loading message until the course request settles', () => {
    let resolveFetch: (response: {ok: boolean; json: () => Promise<unknown>}) => void;
    const dom = new JSDOM(html, {
      url: 'https://hire.example.com/video-sharing',
      runScripts: 'dangerously',
      beforeParse(window) {
        Object.defineProperty(window, 'fetch', {
          value: vi.fn(() => new Promise(resolve => { resolveFetch = resolve; })),
          configurable: true,
        });
      },
    });

    expect(dom.window.document.querySelector('#message')!.textContent).toContain('正在加载培训资料');
    resolveFetch!({ok: true, json: async () => ({items: courses})});
  });

  it('defaults to positive videos and separates negative videos', async () => {
    const dom = await loadPage();
    const list = dom.window.document.querySelector('#list')!;

    expect(list.textContent).toContain('正向示范');
    expect(list.textContent).not.toContain('负向示范');
    expect(list.textContent).not.toContain('普通视频');

    (dom.window.document.querySelector('[data-category="negative"]') as HTMLButtonElement).click();
    expect(list.textContent).toContain('负向示范');
    expect(list.textContent).not.toContain('正向示范');
  });

  it('shows counts, keeps ordinary videos and documents in other, and searches within that group', async () => {
    const dom = await loadPage();
    const document = dom.window.document;
    const other = document.querySelector('[data-category="other"]') as HTMLButtonElement;

    expect(document.querySelector('[data-category="positive"]')!.textContent).toContain('1');
    expect(document.querySelector('[data-category="negative"]')!.textContent).toContain('1');
    expect(other.textContent).toContain('2');
    other.click();
    expect(document.querySelector('#list')!.textContent).toContain('普通视频');
    expect(document.querySelector('#list')!.textContent).toContain('培训资料');

    const search = document.querySelector('#search') as HTMLInputElement;
    search.value = '资料';
    search.dispatchEvent(new dom.window.Event('input', {bubbles: true}));
    expect(document.querySelector('#list')!.textContent).toContain('培训资料');
    expect(document.querySelector('#list')!.textContent).not.toContain('普通视频');
  });

  it('does not render the other selector when every asset is explicitly categorized', async () => {
    const dom = await loadPage({
      ok: true,
      json: async () => ({items: courses.slice(0, 2)}),
    });

    expect(dom.window.document.querySelector('[data-category="other"]')).toBeNull();
  });

  it('retains loading and error states', async () => {
    const dom = await loadPage({
      ok: false,
      json: async () => ({error: {message: '培训资料加载失败'}}),
    });

    expect(dom.window.document.querySelector('#message')!.textContent).toContain('培训资料加载失败');
  });
});
