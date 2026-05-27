/**
 * 简历解析智能路由管道
 *
 * 核心思路：
 * 1. quickTextProbe 快速探测 PDF 文本层（2s 超时，零成本）
 * 2. 根据探测结果路由到 TEXT_PATH 或 VISION_PATH
 * 3. TEXT_PATH 质量 < 40 时自动升级到 VISION_PATH
 * 4. 统一质量评分 + 补充提取
 */

import {fetchJson} from './apiClient';
import {
  type ParsedResumeInfo,
  type MinerUParseResult,
  parseResumeWithMinerU,
  extractResumeInfoFromMarkdown,
  renderPdfPagesAsImages,
} from './mineruClient';
import {USE_MOCK_API, API_BASE_URL, getAuthToken} from './runtime';

// ---------------------------------------------------------------------------
// 类型定义
// ---------------------------------------------------------------------------

export type ParseRoute = 'text' | 'vision' | 'vision_fallback';

export interface PipelineConfig {
  mineruToken?: string;
  authToken?: string;
}

export interface PipelineMetadata {
  route: ParseRoute;
  stagesUsed: string[];
  totalDurationMs: number;
  qualityScore: number;
  qualityLevel: 'high' | 'medium' | 'low';
  mineruUsed: boolean;
  visionLlmUsed: boolean;
}

export interface PipelineResult {
  parsedInfo: ParsedResumeInfo;
  contentMd: string;
  photoBase64: string;
  metadata: PipelineMetadata;
}

// ---------------------------------------------------------------------------
// 路由决策
// ---------------------------------------------------------------------------

/** 文件类型 → 解析路径 */
export type ParsePath = 'text' | 'vision';

export interface RouteDecision {
  path: ParsePath;
  reason: string;
  textProbe?: string;
}

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp']);

/**
 * 快速探测 PDF 文本层 — 只读第一页，2 秒超时
 * 返回提取到的文本，空字符串表示无法提取
 */
export async function quickTextProbe(file: File): Promise<string> {
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  if (ext !== 'pdf') return '';

  try {
    const PDFParse = (await import('pdf-parse')).PDFParse;
    const data = new Uint8Array(await file.arrayBuffer());
    // @ts-expect-error pdf-parse v2 API
    const result = await PDFParse.getText(data);
    return result.text || '';
  } catch {
    return '';
  }
}

/**
 * 路由决策：根据文件类型和文本探测结果决定走 TEXT_PATH 还是 VISION_PATH
 */
export async function routeFile(file: File): Promise<RouteDecision> {
  const ext = file.name.split('.').pop()?.toLowerCase() || '';

  // 图片文件：直接走 Vision
  if (IMAGE_EXTENSIONS.has(ext)) {
    return {path: 'vision', reason: `图片文件 (${ext})`};
  }

  // 非 PDF 文件：走文本路径
  if (ext !== 'pdf') {
    return {path: 'text', reason: `非 PDF 文件 (${ext})`};
  }

  // PDF：探测文本层
  const probeText = await quickTextProbe(file);
  const hasChinese = /[\u4e00-\u9fa5]/.test(probeText);
  const substantial = probeText.trim().length > 200 && hasChinese;

  if (substantial) {
    return {
      path: 'text',
      reason: `文本型 PDF (probe: ${probeText.trim().length} chars, hasChinese: ${hasChinese})`,
      textProbe: probeText,
    };
  }

  return {
    path: 'vision',
    reason: `扫描/图片 PDF (probe: ${probeText.trim().length} chars, hasChinese: ${hasChinese})`,
    textProbe: probeText,
  };
}

// ---------------------------------------------------------------------------
// 质量评估
// ---------------------------------------------------------------------------

const QUALITY_WEIGHTS: Array<{field: keyof ParsedResumeInfo; weight: number; label: string}> = [
  {field: 'name', weight: 35, label: '姓名'},
  {field: 'phone', weight: 30, label: '电话'},
  {field: 'email', weight: 15, label: '邮箱'},
  {field: 'school', weight: 10, label: '学校'},
  {field: 'highestEducation', weight: 5, label: '学历'},
  {field: 'skills', weight: 5, label: '技能'},
];

export function assessQuality(info: ParsedResumeInfo): {
  score: number;
  level: 'high' | 'medium' | 'low';
  missing: string[];
} {
  let score = 0;
  const missing: string[] = [];

  for (const {field, weight, label} of QUALITY_WEIGHTS) {
    const value = info[field];
    const present = Array.isArray(value)
      ? value.length > 0
      : typeof value === 'string' && value.trim().length > 0;

    if (present) {
      score += weight;
    } else {
      missing.push(label);
    }
  }

  return {
    score,
    level: score >= 70 ? 'high' : score >= 40 ? 'medium' : 'low',
    missing,
  };
}

// ---------------------------------------------------------------------------
// 结果合并
// ---------------------------------------------------------------------------

/** 合并两个解析结果：非空字段优先取 primary，空字段从 secondary 补充 */
export function mergeResults(
  primary: ParsedResumeInfo,
  secondary: ParsedResumeInfo,
): ParsedResumeInfo {
  const stringFields: (keyof ParsedResumeInfo)[] = [
    'name', 'gender', 'ageOrBirth', 'phone', 'email', 'location',
    'education', 'highestEducation', 'school', 'major',
    'expectedSalary', 'currentlyEmployed', 'availability',
    'photoBase64', 'rawText',
  ];
  const arrayFields: (keyof ParsedResumeInfo)[] = [
    'workExperience', 'skills', 'honors',
  ];

  const merged = {...primary} as ParsedResumeInfo;

  for (const field of stringFields) {
    const pVal = primary[field] as string;
    const sVal = secondary[field] as string;
    if (!pVal?.trim() && sVal?.trim()) {
      (merged as unknown as Record<string, unknown>)[field] = sVal;
    }
  }

  for (const field of arrayFields) {
    const pArr = primary[field] as string[];
    const sArr = secondary[field] as string[];
    if ((!pArr || pArr.length === 0) && sArr && sArr.length > 0) {
      (merged as unknown as Record<string, unknown>)[field] = sArr;
    }
  }

  return merged;
}

// ---------------------------------------------------------------------------
// 补充提取 — 从任意原始文本中正则匹配 phone/email
// ---------------------------------------------------------------------------

export function complementaryExtract(
  rawText: string,
  info: ParsedResumeInfo,
): ParsedResumeInfo {
  if (!rawText) return info;
  const result = {...info};

  // 补充电话
  if (!result.phone) {
    const phoneMatch = rawText.match(/(?:电话|手机|联系|Mobile)[：:、\s]*([+\d（）\(\)\-]{7,})/i)
      || rawText.match(/(1[3-9]\d{9})/);
    if (phoneMatch) {
      result.phone = phoneMatch[1].replace(/[\-（）\(\)]/g, '');
    }
  }

  // 补充邮箱
  if (!result.email) {
    const emailMatch = rawText.match(/([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/);
    if (emailMatch) result.email = emailMatch[1];
  }

  // 补充姓名（2-4 个中文字符，排除常见非名字词）
  if (!result.name) {
    const namePatterns = [
      /(?:姓名|Name)[：:、\-\s]+([\u4e00-\u9fa5]{2,4})/i,
      /(?:姓\s*名)[：:、\-\s]+([\u4e00-\u9fa5]{2,4})/i,
    ];
    const skipNames = new Set(['全职', '兼职', '实习', '临时', '外包', '派遣']);
    for (const pat of namePatterns) {
      const m = rawText.match(pat);
      if (m && !skipNames.has(m[1])) {
        result.name = m[1];
        break;
      }
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// 提取路径实现
// ---------------------------------------------------------------------------

/** TEXT_PATH: MinerU/pdf-parse → regex → AI 文本 */
async function extractViaTextPath(
  file: File,
  probeText: string | undefined,
  config: PipelineConfig,
  stages: string[],
): Promise<{info: ParsedResumeInfo; contentMd: string; photoBase64: string}> {
  // 1. 尝试 MinerU（如果 token 可用）
  let mineruResult: MinerUParseResult | null = null;
  let contentMd = '';
  let photoBase64 = '';

  if (config.mineruToken || USE_MOCK_API === false) {
    try {
      mineruResult = await parseResumeWithMinerU(file, config.mineruToken || '');
      if (mineruResult.success && mineruResult.content_md) {
        contentMd = mineruResult.content_md;
        photoBase64 = mineruResult.photoBase64 || '';
        stages.push('mineru');
      }
    } catch (e) {
      console.warn('[Pipeline] MinerU failed:', e);
    }
  }

  // 2. 如果 MinerU 失败，使用探测文本或客户端提取
  if (!contentMd && probeText) {
    contentMd = `# 简历\n\n${probeText}`;
    stages.push('textProbe');
  } else if (!contentMd) {
    // 最后尝试 pdf-parse
    try {
      const PDFParse = (await import('pdf-parse')).PDFParse;
      const data = new Uint8Array(await file.arrayBuffer());
      // @ts-expect-error pdf-parse v2 API
      const pdfResult = await PDFParse.getText(data);
      if (pdfResult.text) {
        contentMd = `# 简历\n\n${pdfResult.text}`;
        stages.push('pdfParse');
      }
    } catch (e) {
      console.warn('[Pipeline] pdf-parse failed:', e);
    }
  }

  // 3. 正则提取
  let info = extractResumeInfoFromMarkdown(contentMd || '');
  stages.push('regex');

  // 4. AI 文本增强（如果有足够的文本）— 仅非 mock 模式
  if (!USE_MOCK_API && contentMd && contentMd.trim().length >= 20) {
    try {
      const aiResult = await aiTextParse(contentMd, config.authToken);
      if (aiResult) {
        info = mergeResults(aiResult, info);
        stages.push('aiText');
      }
    } catch (e) {
      console.warn('[Pipeline] AI text parse failed:', e);
    }
  }

  // 5. 补充提取
  info = complementaryExtract(contentMd, info);

  if (photoBase64 && !info.photoBase64) {
    info.photoBase64 = photoBase64;
  }

  return {info, contentMd, photoBase64};
}

/** VISION_PATH: 渲染页面 → 批量 Vision LLM */
async function extractViaVisionPath(
  file: File,
  config: PipelineConfig,
  stages: string[],
): Promise<{info: ParsedResumeInfo; photoBase64: string}> {
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  const isImage = IMAGE_EXTENSIONS.has(ext);
  const arrayBuffer = await file.arrayBuffer();

  let images: string[] = [];
  let mimeType = 'image/jpeg';
  let photoBase64 = '';

  if (isImage) {
    // 图片文件直接转 base64
    const bytes = new Uint8Array(arrayBuffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i += 8192) {
      const chunk = bytes.subarray(i, Math.min(i + 8192, bytes.length));
      binary += String.fromCharCode(...chunk);
    }
    images = [btoa(binary)];
    mimeType = `image/${ext === 'jpg' ? 'jpeg' : ext}`;
    photoBase64 = `data:${mimeType};base64,${images[0]}`;
  } else if (ext === 'pdf') {
    // PDF 渲染为图片
    images = await renderPdfPagesAsImages(arrayBuffer);
    if (images.length > 0) {
      photoBase64 = `data:image/jpeg;base64,${images[0]}`;
    }
  }

  if (images.length === 0) {
    return {
      info: emptyResult(),
      photoBase64,
    };
  }

  // 批量 Vision LLM 调用 — 仅非 mock 模式
  if (!USE_MOCK_API) {
    try {
      const result = await visionParseBatch(images, mimeType, config.authToken);
      if (result) {
        stages.push('visionParse');
        if (photoBase64 && !result.photoBase64) {
          result.photoBase64 = photoBase64;
        }
        return {info: result, photoBase64};
      }
    } catch (e) {
      console.warn('[Pipeline] Vision LLM batch failed:', e);
    }
  }

  return {info: emptyResult(photoBase64), photoBase64};
}

// ---------------------------------------------------------------------------
// AI 调用封装
// ---------------------------------------------------------------------------

/** AI 文本解析 — 调用后端 /api/ai/parse-resume */
async function aiTextParse(
  resumeText: string,
  authToken?: string,
): Promise<ParsedResumeInfo | null> {
  if (!resumeText || resumeText.trim().length < 30) return null;

  try {
    const base = USE_MOCK_API ? '' : API_BASE_URL;
    const resp = await fetch(`${base}/api/ai/parse-resume`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(authToken ? {'Authorization': `Bearer ${authToken}`} : {}),
      },
      body: JSON.stringify({resumeText}),
    });

    if (!resp.ok) return null;

    const data = await resp.json();
    if (!data.name && !data.phone && !data.school) return null;

    return {
      name: data.name || '',
      gender: data.gender || '',
      ageOrBirth: data.ageOrBirth || '',
      phone: data.phone || '',
      email: data.email || '',
      location: data.location || '',
      education: data.education || '',
      highestEducation: data.highestEducation || '',
      school: data.school || '',
      major: data.major || '',
      workExperience: Array.isArray(data.workExperience)
        ? data.workExperience.map((e: Record<string, string>) => [e.period, e.company, e.role, e.desc].filter(Boolean).join(' '))
        : [],
      skills: Array.isArray(data.skills) ? data.skills : [],
      honors: Array.isArray(data.honors) ? data.honors : [],
      expectedSalary: data.expectedSalary || '',
      currentlyEmployed: data.currentlyEmployed || '',
      availability: data.availability || '',
      photoBase64: data.photoBase64 || '',
      rawText: '',
    };
  } catch (e) {
    console.warn('[Pipeline] AI text parse error:', e);
    return null;
  }
}

/** 批量 Vision LLM 解析 — 一次发送所有图片到后端 */
async function visionParseBatch(
  images: string[],
  mimeType: string,
  authToken?: string,
): Promise<ParsedResumeInfo | null> {
  // 一次性发送所有页面到后端
  try {
    const result = await fetchJson<Record<string, unknown>>('/api/ai/vision-parse', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(authToken ? {'Authorization': `Bearer ${authToken}`} : {}),
      },
      body: JSON.stringify({images, mimeType}),
      timeoutMs: 180000,
    } as RequestInit & { timeoutMs?: number });

    if (result && result.name) {
      return mapVisionResult(result);
    }
  } catch (e) {
    console.warn('[Pipeline] Vision batch failed, falling back to per-page:', e);
  }

  // 批量失败时降级为逐页调用
  for (let i = 0; i < images.length; i++) {
    try {
      const result = await visionParseSingle(images[i], mimeType, authToken);
      if (result && result.name) return result;
    } catch (e) {
      console.warn(`[Pipeline] Vision page ${i + 1} failed:`, e);
    }
  }

  return null;
}

/** 单张图片 Vision 解析（降级用） */
async function visionParseSingle(
  imageBase64: string,
  mimeType: string,
  authToken?: string,
): Promise<ParsedResumeInfo | null> {
  try {
    const result = await fetchJson<Record<string, unknown>>('/api/ai/vision-parse', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(authToken ? {'Authorization': `Bearer ${authToken}`} : {}),
      },
      body: JSON.stringify({imageBase64, mimeType}),
      timeoutMs: 120000,
    } as RequestInit & { timeoutMs?: number });

    if (result && result.name) {
      return mapVisionResult(result);
    }
    return null;
  } catch (e) {
    console.warn('[Pipeline] Vision proxy failed:', e);
    return null;
  }
}

/** 统一映射 Vision API 返回 → ParsedResumeInfo */
function mapVisionResult(result: Record<string, unknown>): ParsedResumeInfo {
  return {
    name: String(result.name || ''),
    gender: String(result.gender || ''),
    ageOrBirth: String(result.ageOrBirth || ''),
    phone: String(result.phone || ''),
    email: String(result.email || ''),
    location: String(result.location || ''),
    education: String(result.education || ''),
    highestEducation: String(result.highestEducation || ''),
    school: String(result.school || ''),
    major: String(result.major || ''),
    workExperience: Array.isArray(result.workExperience)
      ? result.workExperience.map((e: Record<string, string>) => [e.period, e.company, e.role, e.desc].filter(Boolean).join(' '))
      : [],
    skills: Array.isArray(result.skills) ? result.skills.map(String) : [],
    honors: Array.isArray(result.honors) ? result.honors.map(String) : [],
    expectedSalary: String(result.expectedSalary || ''),
    currentlyEmployed: String(result.currentlyEmployed || ''),
    availability: String(result.availability || ''),
    photoBase64: String(result.photoBase64 || ''),
    rawText: '',
  };
}

// ---------------------------------------------------------------------------
// 主入口
// ---------------------------------------------------------------------------

function emptyResult(photoBase64 = ''): ParsedResumeInfo {
  return {
    name: '', gender: '', ageOrBirth: '', phone: '', email: '', location: '',
    education: '', highestEducation: '', school: '', major: '', workExperience: [],
    skills: [], honors: [], expectedSalary: '', currentlyEmployed: '', availability: '',
    photoBase64, rawText: '',
  };
}

/**
 * 简历解析主入口 — 智能路由管道
 *
 * 调用方式：
 * ```typescript
 * const result = await parseResume(file, {
 *   mineruToken: MINERU_API_TOKEN,
 *   authToken: getAuthToken(),
 * });
 * console.log(result.parsedInfo, result.metadata);
 * ```
 */
export async function parseResume(
  file: File,
  config: PipelineConfig = {},
): Promise<PipelineResult> {
  const startTime = Date.now();
  const stages: string[] = [];
  let mineruUsed = false;
  let visionLlmUsed = false;

  // 1. 路由决策
  const route = await routeFile(file);
  stages.push(`route:${route.path}`);
  console.log(`[Pipeline] ${file.name} → ${route.path} (${route.reason})`);

  let parsedInfo: ParsedResumeInfo;
  let contentMd = '';
  let photoBase64 = '';
  let finalRoute: ParseRoute = route.path === 'vision' ? 'vision' : 'text';

  if (route.path === 'vision') {
    // === VISION_PATH ===
    const visionResult = await extractViaVisionPath(file, config, stages);
    parsedInfo = visionResult.info;
    photoBase64 = visionResult.photoBase64;
    visionLlmUsed = stages.includes('visionParse');
  } else {
    // === TEXT_PATH ===
    const textResult = await extractViaTextPath(file, route.textProbe, config, stages);
    parsedInfo = textResult.info;
    contentMd = textResult.contentMd;
    photoBase64 = textResult.photoBase64;
    mineruUsed = stages.includes('mineru');

    // 质量检查：如果 TEXT_PATH 结果不好，升级到 VISION_PATH
    const quality = assessQuality(parsedInfo);
    if (quality.score < 40) {
      console.log(`[Pipeline] TEXT_PATH quality=${quality.score} (< 40), escalating to VISION_PATH`);
      const visionResult = await extractViaVisionPath(file, config, stages);
      if (visionResult.info.name || visionResult.info.phone) {
        parsedInfo = mergeResults(visionResult.info, parsedInfo);
        photoBase64 = visionResult.photoBase64 || photoBase64;
        finalRoute = 'vision_fallback';
      }
      visionLlmUsed = stages.includes('visionParse');
    }
  }

  // 最终质量评估
  const quality = assessQuality(parsedInfo);
  const totalMs = Date.now() - startTime;

  const metadata: PipelineMetadata = {
    route: finalRoute,
    stagesUsed: stages,
    totalDurationMs: totalMs,
    qualityScore: quality.score,
    qualityLevel: quality.level,
    mineruUsed,
    visionLlmUsed,
  };

  console.log(`[Pipeline] ${file.name}: route=${finalRoute}, quality=${quality.score}(${quality.level}), ` +
    `${quality.missing.length > 0 ? `missing=[${quality.missing.join(',')}]` : 'all fields present'}, ` +
    `${totalMs}ms, stages=${stages.join('→')}`);

  return {
    parsedInfo,
    contentMd,
    photoBase64,
    metadata,
  };
}
