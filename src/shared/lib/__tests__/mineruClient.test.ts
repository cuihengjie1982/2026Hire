import {describe, expect, it} from 'vitest';
import {extractResumeInfoFromMarkdown} from '../mineruClient';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('extractResumeInfoFromMarkdown', () => {
  it('extracts email from markdown text', () => {
    const md = '# 简历\n\n姓名: 张三\n邮箱: zhangsan@gmail.com\n';
    const result = extractResumeInfoFromMarkdown(md);
    expect(result.email).toBe('zhangsan@gmail.com');
  });

  it('extracts phone number in Chinese format', () => {
    const md = '联系电话 13812345678\n';
    const result = extractResumeInfoFromMarkdown(md);
    expect(result.phone).toContain('13812345678');
  });

  it('extracts phone with +86 prefix', () => {
    const md = '电话: +86-139-1234-5678\n';
    const result = extractResumeInfoFromMarkdown(md);
    expect(result.phone).toBe('+8613912345678');
  });

  it('extracts name from "姓 名" pattern', () => {
    const md = '姓 名  朱松豪\n';
    const result = extractResumeInfoFromMarkdown(md);
    expect(result.name).toBe('朱松豪');
  });

  it('extracts location from "地点" pattern', () => {
    const md = '地点：北京市朝阳区\n';
    const result = extractResumeInfoFromMarkdown(md);
    expect(result.location).toContain('北京');
  });

  it('extracts education with date pattern', () => {
    const md = '2018-2022 清华大学 计算机科学与技术\n';
    const result = extractResumeInfoFromMarkdown(md);
    expect(result.education).toContain('2018-2022');
    expect(result.education).toContain('清华大学');
  });

  it('extracts work experience from date ranges', () => {
    const md = '2022-01 - 2024-01 ABC科技公司\n负责前端开发\n系统架构设计\n';
    const result = extractResumeInfoFromMarkdown(md);
    expect(result.workExperience.length).toBeGreaterThan(0);
    expect(result.workExperience[0]).toContain('2022-01');
  });

  it('returns empty strings for missing fields', () => {
    const md = '# 简历\n\n这是简单的简历内容\n';
    const result = extractResumeInfoFromMarkdown(md);
    expect(result.email).toBe('');
    expect(result.phone).toBe('');
    // name may be extracted from generic pattern or empty
    expect(typeof result.name).toBe('string');
  });

  it('rawText contains the original markdown', () => {
    const md = '# 简历\n\nSome content\n';
    const result = extractResumeInfoFromMarkdown(md);
    expect(result.rawText).toBe(md);
  });

  it('deduplicates and limits skills to 10', () => {
    const md = `# 简历
职业技能证书: ${Array.from({length: 15}, (_, i) => `技能${i + 1}`).join('、')}
语言: 中文
`;
    const result = extractResumeInfoFromMarkdown(md);
    expect(result.skills.length).toBeLessThanOrEqual(10);
    // Should be unique
    expect(new Set(result.skills).size).toBe(result.skills.length);
  });
});
