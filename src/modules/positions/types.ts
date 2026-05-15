export type PositionStatus = 'draft' | 'active' | 'archived';

// PositionCategory accepts any string (ITF, ITW, MWV, or custom values)
export type PositionCategory = string;

export type PositionSummary = {
  id: string;
  code: string;
  name: string;
  category: PositionCategory;
  status: 'active' | 'inactive'; // 启用/关闭
  projectId?: string;
  description?: string;
  requiredCount?: number;
  deliveryDays?: number;
  createdAt?: string;
  createdBy?: string;
  updatedAt?: string;
};

export type CreatePositionInput = {
  name: string;
  category: PositionCategory;
  projectId?: string | null;
  description?: string;
  requiredCount?: number;
  deliveryDays?: number;
};

export type UpdatePositionInput = {
  name?: string;
  category?: PositionCategory;
  status?: 'active' | 'inactive';
  projectId?: string | null;
  description?: string;
  requiredCount?: number;
  deliveryDays?: number;
};

// 画像配置规则
export type ProfileRule = {
  keyword: string;       // 关键词，如"电脑操作熟练"
  synonyms: string[];   // 同义词列表，如["计算机操作熟练", "Office熟练"]
  category: string;      // 类别：如"基础能力", "工作经验", "性格特质"
};

// 评分维度规则
export type ScoringRule = {
  dimension: string;       // 维度名称，如"专业技能"
  weight: number;           // 权重，如 30
  keywords: string[];      // 明确的关键字列表，如["舞蹈","表演","体操"]
  matchMode: 'all' | 'any'; // 匹配模式：必须匹配全部 还是 匹配任意即可
};

export type GradeRule = {
  grade: string;          // A级, B+级, B级, C级
  minScore: number;        // 最低分
  maxScore: number;       // 最高分
  label: string;          // 标签：如"强烈推荐"
  action: string;         // 动作：如"优先推动"
};

// 基础分配置（画像匹配权重）
export type BaseScoreConfig = {
  baseScore: number;       // 画像匹配权重，如 50（总分100中，画像匹配占50分，剩余分给评分维度）
};

export type PositionDetail = {
  position: PositionSummary;
  profileRules: ProfileRule[];  // 画像配置
  scoringRules: ScoringRule[];  // 评分标准配置
  gradeRules: GradeRule[];      // Grade Rules 分数档位
  baseScoreConfig?: BaseScoreConfig; // 基础分配置
  aiPrompt?: string;            // AI 智能筛选提示词
};
