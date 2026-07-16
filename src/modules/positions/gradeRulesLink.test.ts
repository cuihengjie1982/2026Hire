import {describe, expect, it} from 'vitest';
import {createNextGradeRule, linkGradesDown, linkGradesUp, updateGradeRule} from './gradeRulesLink';
import type {GradeRule} from './types';

const tier = (grade: string, min: number, max: number): GradeRule => ({
  grade,
  minScore: min,
  maxScore: max,
  label: grade,
  action: '',
});

describe('gradeRulesLink', () => {
  it('creates first tier as 90-100', () => {
    const next = createNextGradeRule([]);
    expect(next).toMatchObject({minScore: 90, maxScore: 100});
  });

  it('creates next tier with max inheriting previous min', () => {
    const next = createNextGradeRule([tier('A', 90, 100)]);
    expect(next.maxScore).toBe(90);
    expect(next.minScore).toBe(80);
  });

  it('links lower tiers when minScore increases', () => {
    const rules = [tier('A', 90, 100), tier('B+', 80, 89), tier('B', 70, 79)];
    const updated = updateGradeRule(rules, 1, 'minScore', 85);
    expect(updated[2].maxScore).toBe(84);
  });

  it('links higher tiers when maxScore increases', () => {
    const rules = [tier('A', 90, 100), tier('B+', 80, 89)];
    const updated = updateGradeRule(rules, 1, 'maxScore', 95);
    expect(updated[0].minScore).toBe(96);
  });

  it('linkGradesDown clamps min when max shrinks below min', () => {
    const rules = [tier('A', 95, 100), tier('B', 80, 94)];
    const updated = linkGradesDown(rules, 0);
    expect(updated[1].maxScore).toBe(94);
    expect(updated[1].minScore).toBeLessThanOrEqual(updated[1].maxScore);
  });

  it('linkGradesUp expands max when min rises above max', () => {
    const rules = [tier('A', 90, 89), tier('B', 70, 80)];
    const updated = linkGradesUp(rules, 1);
    expect(updated[0].minScore).toBe(81);
    expect(updated[0].maxScore).toBeGreaterThanOrEqual(updated[0].minScore);
  });
});
