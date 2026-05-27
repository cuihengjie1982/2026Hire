import {describe, it, expect, vi, beforeEach} from 'vitest';
import {
  type ParsedResumeInfo,
  type RouteDecision,
  assessQuality,
  mergeResults,
  complementaryExtract,
  routeFile,
  quickTextProbe,
  type ParseRoute,
} from '../resumePipeline';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Mock pdf-parse
vi.mock('pdf-parse', () => ({
  PDFParse: {
    getText: vi.fn().mockResolvedValue({text: 'mock pdf text'}),
  },
}));

// Mock mineruClient
vi.mock('../mineruClient', () => ({
  parseResumeWithMinerU: vi.fn(),
  extractResumeInfoFromMarkdown: vi.fn(),
  renderPdfPagesAsImages: vi.fn(),
}));

// Mock runtime
vi.mock('../runtime', () => ({
  USE_MOCK_API: true,
  API_BASE_URL: '',
  getAuthToken: vi.fn().mockReturnValue('test-token'),
}));

// Mock apiClient
vi.mock('../apiClient', () => ({
  fetchJson: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFile(name: string, type = 'application/pdf'): File {
  return new File(['dummy content'], name, {type});
}

function fullInfo(overrides: Partial<ParsedResumeInfo> = {}): ParsedResumeInfo {
  return {
    name: '张三',
    gender: '男',
    ageOrBirth: '25岁',
    phone: '13800138000',
    email: 'zhangsan@example.com',
    location: '上海',
    education: '本科',
    highestEducation: '本科',
    school: '复旦大学',
    major: '计算机科学',
    workExperience: ['2020-2023 阿里巴巴 工程师 负责后端开发'],
    skills: ['React', 'TypeScript'],
    honors: ['优秀毕业生'],
    expectedSalary: '15K',
    currentlyEmployed: '在职',
    availability: '一个月内',
    photoBase64: '',
    rawText: '',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests: assessQuality
// ---------------------------------------------------------------------------

describe('assessQuality', () => {
  it('returns 100 for a fully populated info', () => {
    const {score, level, missing} = assessQuality(fullInfo());
    expect(score).toBe(100);
    expect(level).toBe('high');
    expect(missing).toEqual([]);
  });

  it('returns 0 for an empty info', () => {
    const info: ParsedResumeInfo = {
      name: '', gender: '', ageOrBirth: '', phone: '', email: '',
      location: '', education: '', highestEducation: '', school: '',
      major: '', workExperience: [], skills: [], honors: [],
      expectedSalary: '', currentlyEmployed: '', availability: '',
      photoBase64: '', rawText: '',
    };
    const {score, level, missing} = assessQuality(info);
    expect(score).toBe(0);
    expect(level).toBe('low');
    expect(missing.length).toBeGreaterThan(0);
  });

  it('scores name=35 + phone=30 = 65 (medium)', () => {
    const info = fullInfo({
      gender: '', ageOrBirth: '', email: '', location: '',
      education: '', highestEducation: '', school: '', major: '',
      workExperience: [], skills: [], honors: [],
      expectedSalary: '', currentlyEmployed: '', availability: '',
    });
    const {score, level} = assessQuality(info);
    expect(score).toBe(65); // name(35) + phone(30)
    expect(level).toBe('medium');
  });

  it('scores name=35 + phone=30 + email=15 = 80 (high)', () => {
    const info = fullInfo({
      gender: '', ageOrBirth: '', location: '',
      education: '', highestEducation: '', school: '', major: '',
      workExperience: [], skills: [], honors: [],
      expectedSalary: '', currentlyEmployed: '', availability: '',
    });
    const {score, level} = assessQuality(info);
    expect(score).toBe(80);
    expect(level).toBe('high');
  });

  it('correctly identifies missing fields', () => {
    const info = fullInfo({phone: '', email: '', school: ''});
    const {missing} = assessQuality(info);
    expect(missing).toContain('电话');
    expect(missing).toContain('邮箱');
    expect(missing).toContain('学校');
    expect(missing).not.toContain('姓名');
  });

  it('scores 40 as medium boundary', () => {
    const info = fullInfo({
      phone: '', email: '', location: '',
      education: '', highestEducation: '', school: '', major: '',
      workExperience: [], skills: [], honors: [],
      expectedSalary: '', currentlyEmployed: '', availability: '',
      gender: '', ageOrBirth: '',
    });
    // Only name=35
    const {score, level} = assessQuality(info);
    expect(score).toBe(35);
    expect(level).toBe('low');
  });
});

// ---------------------------------------------------------------------------
// Tests: mergeResults
// ---------------------------------------------------------------------------

describe('mergeResults', () => {
  it('keeps primary non-empty values', () => {
    const primary = fullInfo({name: '张三'});
    const secondary = fullInfo({name: '李四'});
    const result = mergeResults(primary, secondary);
    expect(result.name).toBe('张三');
  });

  it('fills empty primary from secondary', () => {
    const primary = fullInfo({phone: '', email: ''});
    const secondary = fullInfo({phone: '13900139000', email: 'lisi@test.com'});
    const result = mergeResults(primary, secondary);
    expect(result.phone).toBe('13900139000');
    expect(result.email).toBe('lisi@test.com');
  });

  it('fills empty array from secondary', () => {
    const primary = fullInfo({skills: []});
    const secondary = fullInfo({skills: ['Python', 'Go']});
    const result = mergeResults(primary, secondary);
    expect(result.skills).toEqual(['Python', 'Go']);
  });

  it('keeps primary array when non-empty', () => {
    const primary = fullInfo({skills: ['React']});
    const secondary = fullInfo({skills: ['Python', 'Go']});
    const result = mergeResults(primary, secondary);
    expect(result.skills).toEqual(['React']);
  });

  it('does not mutate primary', () => {
    const primary = fullInfo({phone: ''});
    const original = {...primary};
    mergeResults(primary, fullInfo({phone: '999'}));
    expect(primary.phone).toBe(original.phone);
  });
});

// ---------------------------------------------------------------------------
// Tests: complementaryExtract
// ---------------------------------------------------------------------------

describe('complementaryExtract', () => {
  it('extracts phone from raw text', () => {
    const info = fullInfo({phone: ''});
    const result = complementaryExtract('联系电话：138-1234-5678，欢迎来电', info);
    expect(result.phone).toBe('13812345678');
  });

  it('extracts bare phone number', () => {
    const info = fullInfo({phone: ''});
    const result = complementaryExtract('我的号码是13912345678', info);
    expect(result.phone).toBe('13912345678');
  });

  it('extracts email from raw text', () => {
    const info = fullInfo({email: ''});
    const result = complementaryExtract('邮箱地址：test.user@company.com.cn 是我的', info);
    expect(result.email).toBe('test.user@company.com.cn');
  });

  it('extracts name from raw text', () => {
    const info = fullInfo({name: ''});
    const result = complementaryExtract('姓名：王小明\n男 25岁', info);
    expect(result.name).toBe('王小明');
  });

  it('does not overwrite existing fields', () => {
    const info = fullInfo({phone: '13800138000'});
    const result = complementaryExtract('手机：19900001111', info);
    expect(result.phone).toBe('13800138000');
  });

  it('skips non-name patterns', () => {
    const info = fullInfo({name: ''});
    const result = complementaryExtract('姓名：全职\n期望工作', info);
    expect(result.name).toBe('');
  });

  it('returns unchanged info when rawText is empty', () => {
    const info = fullInfo();
    const result = complementaryExtract('', info);
    expect(result).toEqual(info);
  });
});

// ---------------------------------------------------------------------------
// Tests: routeFile
// ---------------------------------------------------------------------------

describe('routeFile', () => {
  it('routes image files to vision', async () => {
    const png = makeFile('photo.png', 'image/png');
    const decision = await routeFile(png);
    expect(decision.path).toBe('vision');
    expect(decision.reason).toContain('png');
  });

  it('routes jpg files to vision', async () => {
    const jpg = makeFile('scan.jpg', 'image/jpeg');
    const decision = await routeFile(jpg);
    expect(decision.path).toBe('vision');
  });

  it('routes non-PDF non-image to text', async () => {
    const doc = makeFile('resume.doc', 'application/msword');
    const decision = await routeFile(doc);
    expect(decision.path).toBe('text');
    expect(decision.reason).toContain('doc');
  });
});

// ---------------------------------------------------------------------------
// Tests: quickTextProbe
// ---------------------------------------------------------------------------

describe('quickTextProbe', () => {
  it('returns empty for non-PDF files', async () => {
    const png = makeFile('photo.png', 'image/png');
    const text = await quickTextProbe(png);
    expect(text).toBe('');
  });
});

// ---------------------------------------------------------------------------
// Tests: ParseRoute type
// ---------------------------------------------------------------------------

describe('ParseRoute type', () => {
  it('has expected values', () => {
    const routes: ParseRoute[] = ['text', 'vision', 'vision_fallback'];
    expect(routes).toHaveLength(3);
  });
});
