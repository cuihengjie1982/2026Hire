export const TRAINING_CATEGORIES = [
  '正向视频',
  '负向视频',
  '沟通表达',
  '专业能力',
  '应变能力',
  '综合素质',
  '综合',
] as const;

export const CATEGORY_COLORS: Record<string, string> = {
  '正向视频': 'bg-emerald-100 text-emerald-700',
  '负向视频': 'bg-red-100 text-red-700',
  '沟通表达': 'bg-blue-100 text-blue-700',
  '专业能力': 'bg-purple-100 text-purple-700',
  '应变能力': 'bg-orange-100 text-orange-700',
  '综合素质': 'bg-emerald-100 text-emerald-700',
  '综合': 'bg-surface-muted text-fg-secondary',
};
