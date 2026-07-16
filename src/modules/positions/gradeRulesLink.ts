import type {GradeRule} from './types';

const SCORE_MIN = 0;
const SCORE_MAX = 100;

/** 列表自上而下 = 分数从高到低（index 0 为最高档） */
export const clampGradeRule = (rule: GradeRule): GradeRule => {
  const minScore = Math.max(SCORE_MIN, Math.min(SCORE_MAX, rule.minScore));
  const maxScore = Math.max(SCORE_MIN, Math.min(SCORE_MAX, rule.maxScore));
  return {
    ...rule,
    minScore: Math.min(minScore, maxScore),
    maxScore: Math.max(minScore, maxScore),
  };
};

/** 修改最低分后向下联动：低一档最高分 = 本档最低分 - 1，并保证 min ≤ max */
export const linkGradesDown = (rules: GradeRule[], fromIndex: number): GradeRule[] => {
  const next = rules.map(clampGradeRule);
  for (let j = fromIndex + 1; j < next.length; j++) {
    const higher = next[j - 1];
    const maxScore = Math.max(SCORE_MIN, higher.minScore - 1);
    const minScore = Math.min(next[j].minScore, maxScore);
    next[j] = clampGradeRule({...next[j], minScore, maxScore});
  }
  return next;
};

/** 修改最高分后向上联动：高一档最低分 = 本档最高分 + 1，并保证 min ≤ max */
export const linkGradesUp = (rules: GradeRule[], fromIndex: number): GradeRule[] => {
  const next = rules.map(clampGradeRule);
  for (let j = fromIndex - 1; j >= 0; j--) {
    const lower = next[j + 1];
    const minScore = Math.min(SCORE_MAX, lower.maxScore + 1);
    const maxScore = Math.max(next[j].maxScore, minScore);
    next[j] = clampGradeRule({...next[j], minScore, maxScore});
  }
  return next;
};

/** 新建档位：最高分继承上一档最低分；首档默认 90–100 */
export const createNextGradeRule = (rules: GradeRule[]): GradeRule => {
  const last = rules[rules.length - 1];
  if (!last) {
    return clampGradeRule({grade: '', minScore: 90, maxScore: 100, label: '', action: ''});
  }
  const maxScore = last.minScore;
  const minScore = Math.max(SCORE_MIN, maxScore - 10);
  return clampGradeRule({grade: '', minScore, maxScore, label: '', action: ''});
};

export const updateGradeRule = (
  rules: GradeRule[],
  index: number,
  field: keyof GradeRule,
  value: string | number,
): GradeRule[] => {
  let next = rules.map((g, i) => (i === index ? {...g, [field]: value} : g));
  next[index] = clampGradeRule(next[index]);
  if (field === 'minScore') {
    return linkGradesDown(next, index);
  }
  if (field === 'maxScore') {
    return linkGradesUp(next, index);
  }
  return next;
};
