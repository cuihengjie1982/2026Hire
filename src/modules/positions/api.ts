import {supabase} from '../../shared/lib/supabase';
import {getItemsFromPayload, getValueFromPayload, cached, invalidateCache} from '../../shared/lib/apiClient';
import {USE_MOCK_API, getUserName} from '../../shared/lib/runtime';
import {type CreatePositionInput, type PositionDetail, type PositionSummary, type UpdatePositionInput, type ScoringRule, type GradeRule, type BaseScoreConfig, type ProfileRule} from './types';

/** Result shape for supabase single-row queries (no Database types generated) */
type DbResult<T> = { data: T | null; error: Error | null };

/**
 * Escape hatch for supabase table operations.
 *
 * The supabase client was initialized without generated Database types, so
 * `.from()` infers all tables as `never`. This cast is necessary until
 * `supabase gen types` is run against the database schema.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (table: string) => supabase.from(table) as any;

/** Raw shape of profile rules from API/database before normalization */
interface RawProfileRule {
  keyword?: string;
  name?: string;
  synonyms?: unknown;
  category?: string;
}

/** Raw shape of scoring rules from API/database before normalization */
interface RawScoringRule {
  dimension?: string;
  weight?: number;
  keywords?: string[];
  matchMode?: string;
  criteria?: string;
}

let positionsData: PositionSummary[] = (() => { try { const r = localStorage.getItem('em-box.mock.positions'); return r ? JSON.parse(r) : []; } catch { return []; } })();

// In-memory store for position details (mock mode)
let positionDetailsMap: Record<string, PositionDetail> = (() => { try { const r = localStorage.getItem('em-box.mock.position-details'); return r ? JSON.parse(r) : {}; } catch { return {}; } })();
const savePositions = () => { localStorage.setItem('em-box.mock.positions', JSON.stringify(positionsData)); localStorage.setItem('em-box.mock.position-details', JSON.stringify(positionDetailsMap)); };
const savePositionDetails = () => { localStorage.setItem('em-box.mock.positions', JSON.stringify(positionsData)); localStorage.setItem('em-box.mock.position-details', JSON.stringify(positionDetailsMap)); };

const mapPositionSummary = (raw: Record<string, unknown>): PositionSummary => ({
  id: String(raw.id ?? ''),
  code: String(raw.code ?? ''),
  name: String(raw.name ?? ''),
  category: String(raw.category ?? ''),
  status: (raw.status === 'inactive' ? 'inactive' : 'active'),
  projectId: typeof raw.project_id === 'string' ? raw.project_id : typeof raw.projectId === 'string' ? raw.projectId : '',
  description: typeof raw.description === 'string' ? raw.description : '',
  requiredCount: typeof raw.required_count === 'number' ? raw.required_count : typeof raw.requiredCount === 'number' ? raw.requiredCount : undefined,
  deliveryDays: typeof raw.delivery_days === 'number' ? raw.delivery_days : typeof raw.deliveryDays === 'number' ? raw.deliveryDays : undefined,
  createdAt: typeof raw.created_at === 'string' ? raw.created_at : typeof raw.createdAt === 'string' ? raw.createdAt : undefined,
  createdBy: typeof raw.created_by === 'string' ? raw.created_by : typeof raw.createdBy === 'string' ? raw.createdBy : undefined,
  updatedAt: typeof raw.updated_at === 'string' ? raw.updated_at : typeof raw.updatedAt === 'string' ? raw.updatedAt : undefined,
});

export const listPositions = async (): Promise<PositionSummary[]> => {
  if (USE_MOCK_API) {
    await new Promise(r => setTimeout(r, 120));
    return Array.from(new Map(positionsData.map(p => [p.id, p])).values());
  }

  return cached('listPositions', async () => {
    const {data, error} = await supabase
      .from('positions')
      .select('*')
      .order('created_at', {ascending: false});

    if (error) throw new Error(error.message);
    return Array.from(new Map((data || []).map(r => [r.id as string, r])).values()).map(mapPositionSummary);
  });
};

export const listPositionsByProject = async (projectId: string): Promise<PositionSummary[]> => {
  if (USE_MOCK_API) {
    await new Promise(r => setTimeout(r, 120));
    return Array.from(new Map(positionsData.filter(p => p.projectId === projectId).map(p => [p.id, p])).values());
  }

  const {data, error} = await supabase
    .from('positions')
    .select('*')
    .eq('project_id', projectId);

  if (error) throw new Error(error.message);
  return Array.from(new Map((data || []).map(r => [r.id as string, r])).values()).map(mapPositionSummary);
};

export const getPositionDetail = async (_positionId: string): Promise<PositionDetail | null> => {
  console.log('[DEBUG] getPositionDetail called, positionId:', _positionId);
  console.log('[DEBUG] getPositionDetail - USE_MOCK_API:', USE_MOCK_API);
  if (USE_MOCK_API) {
    await new Promise(r => setTimeout(r, 120));
    const stored = positionDetailsMap[_positionId] || null;
    console.log('[DEBUG] getPositionDetail mock - positionId:', _positionId);
    console.log('[DEBUG] getPositionDetail mock - stored:', JSON.stringify(stored?.profileRules));
    return stored;
  }

  // Get position from positions table
  const {data: positionData, error: positionError} = await supabase
    .from('positions')
    .select('*')
    .eq('id', _positionId)
    .single();

  if (positionError) {
    console.log('[DEBUG] getPositionDetail - positionError:', positionError.message);
    if (positionError.code === 'PGRST116') return null;
    throw new Error(positionError.message);
  }

  // Get position details from position_details table
  const {data: detailData, error: detailError} = await supabase
    .from('position_details')
    .select('*')
    .eq('position_id', _positionId)
    .maybeSingle();

  console.log('[DEBUG] getPositionDetail - positionData:', JSON.stringify(positionData).slice(0, 500));
  console.log('[DEBUG] getPositionDetail - detailData:', JSON.stringify(detailData || {}).slice(0, 500));

  if (positionData && typeof positionData === 'object') {
    const raw = positionData as Record<string, unknown>;

    // Handle profileRules - check snake_case, camelCase, and legacy 'profile' format
    let rawProfileRules: RawProfileRule[] = [];
    if (Array.isArray(raw.profile_rules)) {
      console.log('[DEBUG] getPositionDetail - using profile_rules from response');
      rawProfileRules = raw.profile_rules;
    } else if (Array.isArray((raw as Record<string, unknown>).profileRules)) {
      rawProfileRules = (raw as Record<string, unknown>).profileRules as RawProfileRule[];
    } else if (raw.profile && typeof raw.profile === 'object') {
      // Legacy format: profile has mustHave, niceToHave, bonus arrays
      console.log('[DEBUG] getPositionDetail - using legacy profile from response');
      const legacyProfile = raw.profile as Record<string, unknown>;
      const allItems = [
        ...(Array.isArray(legacyProfile.mustHave) ? legacyProfile.mustHave : []),
        ...(Array.isArray(legacyProfile.niceToHave) ? legacyProfile.niceToHave : []),
        ...(Array.isArray(legacyProfile.bonus) ? legacyProfile.bonus : []),
      ];
      rawProfileRules = allItems.map((item: string | RawProfileRule) => {
        if (typeof item === 'string') {
          return {keyword: item, synonyms: [], category: ''};
        }
        return {keyword: item.keyword || '', synonyms: Array.isArray(item.synonyms) ? item.synonyms : [], category: item.category || ''};
      });
    }
    const profileRules: ProfileRule[] = rawProfileRules.map((rule: RawProfileRule) => ({
      keyword: rule.keyword || '',
      synonyms: Array.isArray(rule.synonyms) ? rule.synonyms : [],
      category: rule.category || '',
    }));

    // Handle scoringRules - check if new structured format or legacy criteria text format
    const rawScoringRules = Array.isArray(raw.scoring_rules) ? raw.scoring_rules : [];
    const scoringRules: ScoringRule[] = rawScoringRules.map((rule: RawScoringRule) => {
      if (rule.keywords && Array.isArray(rule.keywords)) {
        return {
          dimension: rule.dimension || '',
          weight: rule.weight || 0,
          keywords: rule.keywords,
          matchMode: (rule.matchMode === 'all' ? 'all' : 'any') as ScoringRule['matchMode'],
        };
      }
      // Legacy format - convert criteria text to keywords array
      const criteriaText = rule.criteria || '';
      return {
        dimension: rule.dimension || '',
        weight: rule.weight || 0,
        keywords: criteriaText.split(/[,/、\s]+/).filter((k: string) => k.length >= 2),
        matchMode: 'any' as const,
      };
    });

    // Handle baseScoreConfig — only baseScore (profile weight) is needed
    const rawBaseScoreConfig = raw.base_score_config || (raw as Record<string, unknown>).baseScoreConfig;
    const baseScoreConfig = rawBaseScoreConfig ? {
      baseScore: (rawBaseScoreConfig as Record<string, unknown>).baseScore || (rawBaseScoreConfig as Record<string, unknown>).base_score || 50,
    } : null;

    // Merge detailData fields properly — detailData holds position_details table data
    const detail = detailData as Record<string, unknown> | null;

    // Extract raw fields from detailData (position_details table) with fallback to positionData fields
    const rawDetailProfileRules = (detail?.profile_rules ?? raw.profile_rules ?? (raw as Record<string, unknown>).profileRules ?? []) as RawProfileRule[];
    const rawDetailScoringRules = (detail?.scoring_rules ?? raw.scoring_rules ?? (raw as Record<string, unknown>).scoringRules ?? []) as RawScoringRule[];
    const detailGradeRules: GradeRule[] = (detail?.grade_rules ?? raw.grade_rules ?? (raw as Record<string, unknown>).gradeRules ?? []) as GradeRule[];
    const detailBaseScoreConfig: BaseScoreConfig | null = (detail?.base_score_config ?? (raw as Record<string, unknown>).baseScoreConfig ?? null) as BaseScoreConfig | null;
    const detailAiPrompt: string = (detail?.ai_prompt ?? raw.ai_prompt ?? (raw as Record<string, unknown>).aiPrompt ?? '') as string;

    // Normalize profileRules — ensure synonyms is always an array
    const normalizedProfileRules: ProfileRule[] = (rawDetailProfileRules as RawProfileRule[]).map((rule: RawProfileRule) => ({
      keyword: rule.keyword || rule.name || '',
      synonyms: Array.isArray(rule.synonyms) ? rule.synonyms : [],
      category: rule.category || '',
    }));

    // Normalize scoringRules — ensure keywords is always an array
    const normalizedScoringRules: ScoringRule[] = rawDetailScoringRules.map((rule: RawScoringRule) => {
      if (rule.keywords && Array.isArray(rule.keywords)) {
        return {
          dimension: rule.dimension || '',
          weight: rule.weight || 0,
          keywords: rule.keywords,
          matchMode: (rule.matchMode === 'all' ? 'all' : 'any') as ScoringRule['matchMode'],
        };
      }
      const criteriaText = rule.criteria || '';
      return {
        dimension: rule.dimension || '',
        weight: rule.weight || 0,
        keywords: criteriaText.split(/[,/、\s]+/).filter((k: string) => k.length >= 2),
        matchMode: 'any' as const,
      };
    });

    return {
      position: mapPositionSummary(raw),
      profileRules: normalizedProfileRules,
      scoringRules: normalizedScoringRules,
      gradeRules: detailGradeRules,
      baseScoreConfig: detailBaseScoreConfig,
      aiPrompt: detailAiPrompt,
    };
  }

  return null;
};

export type SavePositionDetailInput = {
  profileRules: ProfileRule[];
  scoringRules: ScoringRule[];
  gradeRules: GradeRule[];
  baseScoreConfig: BaseScoreConfig | null;
  aiPrompt?: string;
};

export const savePositionDetail = async (
  positionId: string,
  detail: SavePositionDetailInput,
): Promise<PositionDetail | null> => {
  console.log('[DEBUG] savePositionDetail called, positionId:', positionId);
  console.log('[DEBUG] savePositionDetail detail.profileRules:', JSON.stringify(detail.profileRules));
  if (USE_MOCK_API) {
    await new Promise(r => setTimeout(r, 120));
    const position = positionsData.find((p) => p.id === positionId);
    if (!position) return null;
    const updated: PositionDetail = {
      position,
      profileRules: detail.profileRules,
      scoringRules: detail.scoringRules,
      gradeRules: detail.gradeRules,
      baseScoreConfig: detail.baseScoreConfig,
      aiPrompt: detail.aiPrompt,
    };
    console.log('[DEBUG] savePositionDetail - stored:', JSON.stringify(updated.profileRules));
    positionDetailsMap[positionId] = updated;
    savePositionDetails();
    return updated;
  }

  // Upsert position_details table
  const upsertResult = await db('position_details')
    .upsert({
      position_id: positionId,
      profile_rules: detail.profileRules,
      scoring_rules: detail.scoringRules,
      grade_rules: detail.gradeRules,
      base_score_config: detail.baseScoreConfig,
      ai_prompt: detail.aiPrompt || '',
    }, {onConflict: 'position_id'}) as unknown as DbResult<null>;

  if (upsertResult.error) throw new Error(upsertResult.error.message);

  // Return updated detail
  invalidateCache('listPositions');
  return getPositionDetail(positionId);
};

export const createPosition = async (input: CreatePositionInput): Promise<PositionSummary> => {
  if (USE_MOCK_API) {
    await new Promise(r => setTimeout(r, 120));
    const newPosition: PositionSummary = {
      id: `pos-${Date.now()}`,
      code: `POS-${Date.now()}`,
      name: input.name,
      category: input.category,
      status: 'active',
      projectId: input.projectId ?? undefined,
      description: input.description ?? '',
      requiredCount: input.requiredCount,
      deliveryDays: input.deliveryDays,
      createdAt: new Date().toISOString(),
      createdBy: getUserName() ?? '未知用户',
      updatedAt: new Date().toISOString(),
    };
    positionsData.push(newPosition);
    // Initialize empty detail for the new position
    positionDetailsMap[newPosition.id] = {
      position: newPosition,
      profileRules: [],
      scoringRules: [],
      gradeRules: [],
      baseScoreConfig: null,
    };
    savePositions();
    return newPosition;
  }

  // Convert camelCase to snake_case for API
  const insertData = {
    code: `POS-${Date.now()}`,
    name: input.name,
    category: input.category,
    status: input.status || 'active',
    project_id: input.projectId || null,
    description: input.description || null,
    required_count: input.requiredCount ?? 0,
    delivery_days: input.deliveryDays ?? 0,
  };

  const insertResult = await db('positions')
    .insert(insertData)
    .select()
    .single() as unknown as DbResult<Record<string, unknown>>;

  if (insertResult.error) throw new Error(insertResult.error.message);
  if (!insertResult.data) throw new Error('Failed to create position');
  const summary = mapPositionSummary(insertResult.data);
  db('position_details').insert({ position_id: insertResult.data.id }).then(() => {}, () => {});
  invalidateCache('listPositions');
  return summary;
};

export const updatePosition = async (id: string, input: UpdatePositionInput): Promise<PositionSummary> => {
  if (USE_MOCK_API) {
    await new Promise(r => setTimeout(r, 120));
    const index = positionsData.findIndex((p) => p.id === id);
    if (index === -1) throw new Error('Position not found');
    positionsData[index] = {
      ...positionsData[index],
      ...input,
      updatedAt: new Date().toISOString(),
    };
    savePositions();
    return positionsData[index];
  }

  // Convert camelCase to snake_case for API
  const updateData: Record<string, unknown> = {
    name: input.name,
    category: input.category,
    status: input.status,
    description: input.description,
    required_count: input.requiredCount,
    delivery_days: input.deliveryDays,
  };

  const updateResult = await db('positions')
    .update(updateData)
    .eq('id', id)
    .select()
    .single() as unknown as DbResult<Record<string, unknown>>;

  if (updateResult.error) throw new Error(updateResult.error.message);
  if (!updateResult.data) throw new Error('Position not found');
  invalidateCache('listPositions');
  return mapPositionSummary(updateResult.data);
};

export const deletePosition = async (id: string): Promise<void> => {
  if (USE_MOCK_API) {
    await new Promise(r => setTimeout(r, 120));
    const index = positionsData.findIndex((p) => p.id === id);
    if (index !== -1) {
      positionsData.splice(index, 1);
    }
    delete positionDetailsMap[id];
    savePositions();
    return;
  }

  const {error} = await supabase
    .from('positions')
    .delete()
    .eq('id', id);

  if (error) throw new Error(error.message);
  invalidateCache('listPositions');
};