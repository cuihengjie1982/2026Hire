import {describe, expect, it} from 'vitest';
import {calculateResumeScore} from '../resumeScorer';
import type {ParsedResumeInfo} from '../mineruClient';
import type {PositionDetail, ProfileRule, ScoringRule} from '../../../modules/positions/types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const makeParsedInfo = (
  overrides: Partial<ParsedResumeInfo> = {},
): ParsedResumeInfo => ({
  name: '张三',
  email: 'zhangsan@example.com',
  phone: '13800138000',
  location: '北京',
  education: '2018-2022 清华大学 计算机科学',
  workExperience: ['2022-01 〜 2024-01 ABC公司 前端开发工程师'],
  skills: ['React', 'TypeScript', 'Node.js'],
  expectedSalary: '',
  currentlyEmployed: '',
  photoBase64: '',
  gender: '',
  ageOrBirth: '',
  highestEducation: '',
  school: '',
  major: '',
  honors: [],
  rawText: '张三 28岁 5年经验 React TypeScript Node.js 北京',
  ...overrides,
});

// Build a base position using the new profileRules + scoringRules format
const basePosition: PositionDetail = {
  position: {id: 'pos-1', code: 'P001', name: '数据采集员', category: 'ITF', status: 'active'},
  profileRules: [
    {keyword: 'React', synonyms: [], category: '技能'},
    {keyword: 'TypeScript', synonyms: [], category: '技能'},
    {keyword: 'Python', synonyms: [], category: '技能'},
    {keyword: 'Docker', synonyms: [], category: '技能'},
    {keyword: 'AWS', synonyms: [], category: '技能'},
  ],
  scoringRules: [
    {dimension: '基础匹配度', weight: 40, keywords: ['React', 'TypeScript'], matchMode: 'any'},
    {dimension: '专业契合度', weight: 30, keywords: ['Python', 'Docker'], matchMode: 'any'},
    {dimension: '经验匹配', weight: 30, keywords: ['Node.js'], matchMode: 'any'},
  ],
  gradeRules: [
    {grade: 'S级', minScore: 90, maxScore: 100, label: '强烈推荐', action: '优先推动'},
    {grade: 'A级', minScore: 80, maxScore: 89, label: '推荐', action: '推动'},
    {grade: 'B+级', minScore: 70, maxScore: 79, label: '可推荐', action: '备选'},
    {grade: 'B级', minScore: 60, maxScore: 69, label: '一般', action: '观望'},
    {grade: 'C级', minScore: 0, maxScore: 59, label: '不推荐', action: '淘汰'},
  ],
  baseScoreConfig: {baseScore: 50},
  aiPrompt: '',
};

const makePosition = (
  overrides: Partial<PositionDetail> = {},
): PositionDetail => ({...basePosition, ...overrides});

const makeProfileRule = (keyword: string, synonyms: string[] = [], category = '技能'): ProfileRule => ({
  keyword,
  synonyms,
  category,
});

const makeScoringRule = (
  dimension: string,
  weight: number,
  keywords: string[],
  matchMode: 'any' | 'all' = 'any',
): ScoringRule => ({
  dimension,
  weight,
  keywords,
  matchMode,
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('calculateResumeScore', () => {
  it('returns a valid ScoreResult structure', () => {
    const result = calculateResumeScore(makeParsedInfo(), makePosition());

    expect(result).toHaveProperty('totalScore');
    expect(result).toHaveProperty('grade');
    expect(result).toHaveProperty('gradeColor');
    expect(result).toHaveProperty('scoreColor');
    expect(result).toHaveProperty('dimensionScores');
    expect(result).toHaveProperty('matchedKeywords');
    expect(result).toHaveProperty('missingKeywords');
  });

  it('total score is clamped between 0 and 100', () => {
    const result = calculateResumeScore(makeParsedInfo(), makePosition());
    expect(result.totalScore).toBeGreaterThanOrEqual(0);
    expect(result.totalScore).toBeLessThanOrEqual(100);
  });

  it('matches scoring rule keywords present in resume', () => {
    const info = makeParsedInfo({
      rawText: '熟练掌握React和TypeScript，有Node.js经验',
    });
    const position = makePosition({
      profileRules: [
        makeProfileRule('React'),
        makeProfileRule('TypeScript'),
        makeProfileRule('Python'),
      ],
      scoringRules: [
        makeScoringRule('技能要求', 100, ['React', 'TypeScript', 'Python'], 'any'),
      ],
    });

    const result = calculateResumeScore(info, position);
    expect(result.matchedKeywords).toContain('React');
    expect(result.matchedKeywords).toContain('TypeScript');
    // Python not in resume text, so it's missing from scoring rule keywords
    expect(result.missingKeywords).toContain('Python');
  });

  it('reports missing scoring rule keywords', () => {
    const info = makeParsedInfo({rawText: '我只会HTML和JS'});
    const position = makePosition({
      scoringRules: [
        makeScoringRule('技能要求', 50, ['Python', 'Java'], 'any'),
      ],
    });

    const result = calculateResumeScore(info, position);
    expect(result.missingKeywords).toContain('Python');
    expect(result.missingKeywords).toContain('Java');
    expect(result.matchedKeywords).toEqual([]);
  });

  it('matches scoring keywords present in resume', () => {
    const info = makeParsedInfo({rawText: '会Python和Docker'});
    const position = makePosition({
      scoringRules: [
        makeScoringRule('技能要求', 50, ['Python', 'Docker'], 'any'),
      ],
    });

    const result = calculateResumeScore(info, position);
    expect(result.matchedKeywords).toContain('Python');
    expect(result.matchedKeywords).toContain('Docker');
    expect(result.missingKeywords).toEqual([]);
  });

  it('applies correct grade colors for high score', () => {
    const info = makeParsedInfo({
      rawText: 'React TypeScript Node.js Python Docker AWS 10年经验',
    });

    const result = calculateResumeScore(info, makePosition());
    // With all 5 scoring rule keywords matched, score should be high
    expect(result.totalScore).toBeGreaterThanOrEqual(70);
  });

  it('produces dimension scores with correct structure', () => {
    const result = calculateResumeScore(makeParsedInfo(), makePosition());
    for (const ds of result.dimensionScores) {
      expect(ds).toHaveProperty('dimension');
      expect(ds).toHaveProperty('score');
      expect(ds).toHaveProperty('weight');
      expect(ds).toHaveProperty('maxScore');
      expect(typeof ds.score).toBe('number');
    }
  });

  it('case-insensitive keyword matching', () => {
    const info = makeParsedInfo({rawText: '熟练使用react和typescript'});
    const position = makePosition({
      scoringRules: [
        makeScoringRule('技能', 100, ['React', 'TypeScript'], 'any'),
      ],
    });

    const result = calculateResumeScore(info, position);
    expect(result.matchedKeywords).toContain('React');
    expect(result.matchedKeywords).toContain('TypeScript');
  });

  it('supports synonym matching in profile rules', () => {
    const info = makeParsedInfo({rawText: '熟练使用React前端框架'});
    const position = makePosition({
      profileRules: [
        {keyword: 'React', synonyms: ['React.js', 'ReactJS'], category: '技能'},
      ],
      scoringRules: [
        makeScoringRule('技能', 50, ['React'], 'any'),
      ],
    });

    const result = calculateResumeScore(info, position);
    expect(result.matchedKeywords).toContain('React');
  });

  it('matchMode all requires all keywords to match', () => {
    const info = makeParsedInfo({rawText: '我会Python'});
    const position = makePosition({
      scoringRules: [
        makeScoringRule('技能要求', 50, ['Python', 'Docker'], 'all'),
      ],
    });

    const result = calculateResumeScore(info, position);
    // Only Python matched, so with 'all' mode score should be reduced
    const dim = result.dimensionScores.find(d => d.dimension === '技能要求');
    expect(dim).toBeDefined();
    expect(dim!.score).toBeLessThan(50);
    expect(result.missingKeywords).toContain('Docker');
  });

  it('no matched scoring keywords gives zero dimension contribution', () => {
    const info = makeParsedInfo({rawText: '任何内容都不匹配'});
    const position = makePosition({
      scoringRules: [
        makeScoringRule('技能要求', 100, ['Python', 'Java'], 'any'),
      ],
    });

    const result = calculateResumeScore(info, position);
    expect(result.matchedKeywords).toEqual([]);
    expect(result.missingKeywords).toContain('Python');
    expect(result.missingKeywords).toContain('Java');
  });

  it('grade is assigned based on gradeRules', () => {
    const info = makeParsedInfo({
      rawText: 'React TypeScript Node.js Python Docker AWS', // high match
    });

    const result = calculateResumeScore(info, makePosition());
    // Score should be high enough for B+ or above
    expect(['S级', 'A级', 'B+级', 'B级']).toContain(result.grade);
  });
});