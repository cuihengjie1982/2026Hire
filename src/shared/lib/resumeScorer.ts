import type {ParsedResumeInfo} from './mineruClient';
import type {PositionDetail, ProfileRule} from '../../modules/positions/types';

export interface ScoreResult {
  totalScore: number;
  grade: string;
  gradeColor: string;
  scoreColor: string;
  dimensionScores: {
    dimension: string;
    score: number;
    weight: number;
    maxScore: number;
  }[];
  matchedKeywords: string[];
  missingKeywords: string[];
  debugInfo?: {
    resumeTextLength: number;
    resumeSnippet: string;
    scoringRulesCount: number;
    profileRulesCount: number;
    profileWeight: number;
    profileDimension: {
      matched: string[];
      unmatched: string[];
      score: number;
    };
    dimensionDetails: {
      dimension: string;
      keywords: string[];
      matched: string[];
      score: number;
    }[];
  };
}

/**
 * Normalize text for Chinese matching: lowercase + remove spaces/punctuation
 */
const normalize = (text: string): string => {
  return text
    .toLowerCase()
    .replace(/[\s\-_/|，。、；：""''【】《》（）！？·…—\t\r\n]+/g, '');
};

/**
 * Build a synonym lookup from profileRules.
 * Maps each keyword/synonym (normalized) to ALL terms in its synonym group.
 */
const buildSynonymLookup = (profileRules: ProfileRule[]): Map<string, string[]> => {
  const map = new Map<string, string[]>();
  for (const rule of profileRules) {
    const normKeyword = normalize(rule.keyword);
    if (!normKeyword) continue;
    const allTerms = [normKeyword, ...rule.synonyms.map(s => normalize(s)).filter(Boolean)];
    const uniqueTerms = [...new Set(allTerms)];
    map.set(normKeyword, uniqueTerms);
    for (const syn of rule.synonyms) {
      const normSyn = normalize(syn);
      if (normSyn && !map.has(normSyn)) {
        map.set(normSyn, uniqueTerms);
      }
    }
  }
  return map;
};

/**
 * Fuzzy Chinese character subsequence match.
 * e.g. "数采" matches "数据采集", "标注" matches "数据标注"
 */
const fuzzyChineseMatch = (normKw: string, normText: string): boolean => {
  if (normKw.length < 2 || normKw.length > 6) return false;
  if (!/[\u4e00-\u9fa5]{2,}/.test(normKw)) return false;

  const chars = normKw.split('');
  let searchFrom = 0;

  for (const ch of chars) {
    const idx = normText.indexOf(ch, searchFrom);
    if (idx < 0) return false;
    if (idx - searchFrom > normKw.length * 2) return false;
    searchFrom = idx + 1;
  }
  return true;
};

/**
 * Partial substring match: any 2-char Chinese substring of keyword in text.
 * e.g. keyword="采集操作" → checks "采集" (matches "数据采集")
 */
const partialSubstringMatch = (normKw: string, normText: string): boolean => {
  if (normKw.length < 3) return false;
  if (!/[\u4e00-\u9fa5]{2,}/.test(normKw)) return false;

  for (let i = 0; i <= normKw.length - 2; i++) {
    const sub = normKw.substring(i, i + 2);
    if (/[\u4e00-\u9fa5]{2}/.test(sub) && normText.includes(sub)) {
      return true;
    }
  }
  return false;
};

/**
 * Enhanced keyword matching with multiple strategies
 */
function matchKeywordEnhanced(
  kw: string,
  resumeText: string,
  normalizedResume: string,
  parsedInfo: ParsedResumeInfo,
  synonymLookup: Map<string, string[]>,
): boolean {
  const lowerKw = kw.toLowerCase();
  const normKw = normalize(kw);

  if (!normKw) return false;

  // Strategy 1: Direct exact match
  if (resumeText.includes(lowerKw)) return true;
  if (normalizedResume.includes(normKw)) return true;

  const normSkills = parsedInfo.skills.map(s => normalize(s));
  const normWork = parsedInfo.workExperience.map(w => normalize(w));

  // Strategy 2: Match against skills
  if (normSkills.some(ns => ns.includes(normKw) || normKw.includes(ns))) return true;

  // Strategy 3: Match against work experience
  if (normWork.some(nw => nw.includes(normKw) || normKw.includes(nw))) return true;

  // Strategy 4: Synonym match from profileRules
  const synonyms = synonymLookup.get(normKw);
  if (synonyms) {
    for (const syn of synonyms) {
      if (!syn) continue;
      if (normalizedResume.includes(syn)) return true;
      if (normSkills.some(ns => ns.includes(syn) || syn.includes(ns))) return true;
      if (normWork.some(nw => nw.includes(syn) || syn.includes(nw))) return true;
    }
  }

  // Strategy 5: Fuzzy Chinese subsequence match
  if (fuzzyChineseMatch(normKw, normalizedResume)) return true;

  // Strategy 6: Partial substring match
  if (partialSubstringMatch(normKw, normalizedResume)) return true;

  // Strategy 7: Profile synonym group overlap
  if (/[\u4e00-\u9fa5]/.test(normKw)) {
    for (const [term, group] of synonymLookup.entries()) {
      const sharedChars = [...normKw].filter(ch => term.includes(ch) && /[\u4e00-\u9fa5]/.test(ch));
      if (sharedChars.length >= 2) {
        for (const syn of group) {
          if (normalizedResume.includes(syn)) return true;
          if (normSkills.some(ns => ns.includes(syn))) return true;
        }
      }
    }
  }

  return false;
}

/**
 * Calculate resume match score against position requirements
 *
 * Scoring model:
 *   总分 = 画像匹配分 + 评分维度分
 *   画像匹配分 = profileWeight × (匹配的画像规则数 / 总画像规则数)
 *   评分维度分 = Σ(每个维度按权重和匹配率计算)
 */
export const calculateResumeScore = (
  parsedInfo: ParsedResumeInfo,
  position: PositionDetail,
): ScoreResult => {
  // Build resume text corpus
  const resumeText = [
    parsedInfo.name,
    parsedInfo.email,
    parsedInfo.phone,
    parsedInfo.location,
    parsedInfo.education,
    parsedInfo.school,
    parsedInfo.major,
    parsedInfo.highestEducation,
    parsedInfo.expectedSalary,
    parsedInfo.currentlyEmployed,
    ...(parsedInfo.workExperience || []),
    ...(parsedInfo.skills || []),
    ...(parsedInfo.honors || []),
    parsedInfo.rawText,
  ].filter(Boolean).join(' ').toLowerCase();
  const normalizedResume = normalize(resumeText);

  // Build synonym lookup from profileRules
  const synonymLookup = buildSynonymLookup(position.profileRules || []);
  const profileRules = position.profileRules || [];

  // Determine profile matching weight (default 50)
  const profileWeight = position.baseScoreConfig?.baseScore ?? 50;

  console.log('[Scorer] === Starting Score Calculation ===');
  console.log('[Scorer] Resume text length:', resumeText.length, 'snippet:', resumeText.slice(0, 300));
  console.log('[Scorer] Position:', position.position?.name);
  console.log('[Scorer] ProfileRules:', profileRules.length, '| profileWeight:', profileWeight);
  console.log('[Scorer] ScoringRules:', position.scoringRules?.length || 0);

  // ==========================================
  // Part 1: 画像匹配分
  // ==========================================
  const profileMatched: string[] = [];
  const profileUnmatched: string[] = [];

  for (const rule of profileRules) {
    const matched = matchKeywordEnhanced(rule.keyword, resumeText, normalizedResume, parsedInfo, synonymLookup)
      || rule.synonyms.some(syn => matchKeywordEnhanced(syn, resumeText, normalizedResume, parsedInfo, synonymLookup));

    if (matched) {
      profileMatched.push(rule.keyword);
      console.log(`[Scorer] 画像 ✓ "${rule.keyword}"${rule.synonyms.length ? ` (synonyms: ${rule.synonyms.join(',')})` : ''}`);
    } else {
      profileUnmatched.push(rule.keyword);
      console.log(`[Scorer] 画像 ✗ "${rule.keyword}"`);
    }
  }

  const profileScore = profileRules.length > 0
    ? Math.round(profileWeight * (profileMatched.length / profileRules.length))
    : 0;

  console.log(`[Scorer] 画像匹配: ${profileMatched.length}/${profileRules.length} → ${profileScore}/${profileWeight}分`);

  // ==========================================
  // Part 2: 评分维度分
  // ==========================================
  const matchedKeywords: string[] = [];
  const missingKeywords: string[] = [];
  const dimensionScores: ScoreResult['dimensionScores'] = [];
  const dimensionDetails: ScoreResult['debugInfo']['dimensionDetails'] = [];

  // Compute raw dimension score before scaling (sum of matched weights)
  let rawDimensionScore = 0;
  const totalDimensionWeight = (position.scoringRules || []).reduce((sum, r) => sum + (r.weight || 0), 0);

  for (const rule of position.scoringRules) {
    const dimension = rule.dimension?.replace(/\t/g, '').trim() || '(unnamed)';
    let dimensionScore = 0;
    const dimMatched: string[] = [];

    if (rule.keywords && rule.keywords.length > 0) {
      for (const kw of rule.keywords) {
        const matched = matchKeywordEnhanced(kw, resumeText, normalizedResume, parsedInfo, synonymLookup);
        if (matched) {
          dimMatched.push(kw);
          matchedKeywords.push(kw);
        }
      }

      if (rule.matchMode === 'all') {
        dimensionScore = dimMatched.length === rule.keywords.length
          ? rule.weight
          : rule.weight * (dimMatched.length / rule.keywords.length) * 0.5;
      } else {
        dimensionScore = rule.weight * (dimMatched.length / rule.keywords.length);
      }
    }
    // If no keywords, dimension gets 0

    const finalScore = Math.round(Math.min(dimensionScore, rule.weight));
    rawDimensionScore += dimensionScore;
    dimensionScores.push({dimension, score: finalScore, weight: rule.weight, maxScore: rule.weight});
    dimensionDetails.push({dimension, keywords: rule.keywords || [], matched: dimMatched, score: finalScore});

    console.log(`[Scorer] 维度 "${dimension}" (${rule.weight}分): matched=${dimMatched}/${rule.keywords?.length || 0} → ${finalScore}分`);
  }

  // Scale dimension score so all weights sum to (100 - profileWeight)
  const dimensionWeightBudget = 100 - profileWeight;
  let dimensionTotalScore = 0;
  if (totalDimensionWeight > 0) {
    dimensionTotalScore = Math.round((rawDimensionScore / totalDimensionWeight) * dimensionWeightBudget);
  }

  // ==========================================
  // Total score
  // ==========================================
  let totalScore = profileScore + dimensionTotalScore;

  // Build missing keywords list
  for (const rule of position.scoringRules) {
    for (const kw of rule.keywords) {
      if (!matchedKeywords.includes(kw)) {
        missingKeywords.push(kw);
      }
    }
  }

  // Apply grade
  let grade = 'C';
  let gradeColor = 'bg-[#6B7280]';
  let scoreColor = 'border-[#6B7280]';

  if (position.gradeRules && position.gradeRules.length > 0) {
    for (const rule of position.gradeRules) {
      if (totalScore >= rule.minScore && totalScore <= rule.maxScore) {
        grade = rule.grade;
        break;
      }
    }
  }

  switch (grade) {
    case 'A级': case 'A':
      gradeColor = 'bg-[#10B981]'; scoreColor = 'border-[#10B981]'; break;
    case 'B+级': case 'B+':
      gradeColor = 'bg-[#3B82F6]'; scoreColor = 'border-[#3B82F6]'; break;
    case 'B级': case 'B':
      gradeColor = 'bg-[#0EA5E9]'; scoreColor = 'border-[#0EA5E9]'; break;
    default:
      gradeColor = 'bg-[#6B7280]'; scoreColor = 'border-[#6B7280]';
  }

  totalScore = Math.min(100, Math.max(0, totalScore));

  console.log(`[Scorer] === Final: 画像${profileScore} + 维度${dimensionTotalScore} = ${totalScore}分 (${grade}) ===`);

  return {
    totalScore,
    grade,
    gradeColor,
    scoreColor,
    dimensionScores,
    matchedKeywords,
    missingKeywords,
    debugInfo: {
      resumeTextLength: resumeText.length,
      resumeSnippet: resumeText.slice(0, 200),
      scoringRulesCount: position.scoringRules?.length || 0,
      profileRulesCount: profileRules.length,
      profileWeight,
      profileDimension: {
        matched: profileMatched,
        unmatched: profileUnmatched,
        score: profileScore,
      },
      dimensionDetails,
    },
  };
};
