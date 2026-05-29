/**
 * 简历解析智能路由管道
 *
 * 核心思路：
 * 1. quickTextProbe 快速探测 PDF 文本层（2s 超时，零成本）
 * 2. 根据探测结果路由到 TEXT_PATH 或 VISION_PATH
 * 3. TEXT_PATH 质量 < 40 时自动升级到 VISION_PATH
 * 4. 统一质量评分 + 补充提取
 */

import {
  type ParsedResumeInfo,
  type MinerUParseResult,
  parseResumeWithMinerU,
  extractResumeInfoFromMarkdown,
  renderPdfPagesAsImages,
  textToMarkdown,
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

interface PhotoBbox { x: number; y: number; width: number; height: number }

/** Result from vision LLM parse, including photo bounding box for cropping */
interface VisionParseResult {
  info: ParsedResumeInfo;
  photoBbox: PhotoBbox | null;
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
    const { PDFParse } = await import('pdf-parse');
    const data = new Uint8Array(await file.arrayBuffer());
    // pdf-parse v2 web version uses instance API (new PDFParse(data).getText()),
    // not the static API (PDFParse.getText(data)) from the Node version.
    // Using the wrong API silently returns empty text in production (Vercel).
    const pdf = new PDFParse(data);
    const result = await pdf.getText();
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
  {field: 'name', weight: 25, label: '姓名'},
  {field: 'phone', weight: 20, label: '电话'},
  {field: 'email', weight: 15, label: '邮箱'},
  {field: 'school', weight: 15, label: '学校'},
  {field: 'highestEducation', weight: 10, label: '学历'},
  {field: 'major', weight: 5, label: '专业'},
  {field: 'skills', weight: 5, label: '技能'},
  {field: 'workExperience', weight: 5, label: '工作经历'},
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

  // Normalize rawText: collapse whitespace but preserve meaningful structure
  const normalized = rawText.replace(/\s+/g, ' ');

  // 补充电话 — labeled + bare 11-digit Chinese mobile + +86 prefix
  if (!result.phone) {
    let phoneMatch = normalized.match(/(?:电话|手机|联系|Mobile|Tel|Phone|联系方式)[：:、\s]*([+\d（）\(\)\-]{7,18})/i);
    if (!phoneMatch) {
      // Bare Chinese mobile: 1[3-9]xxxxxxxxx
      phoneMatch = normalized.match(/(?:^|\s)(1[3-9]\d{9})(?:\s|$)/);
    }
    if (!phoneMatch) {
      // +86 prefix
      phoneMatch = normalized.match(/(?:\+86[-\s]?)?(1[3-9]\d{9})/);
    }
    if (!phoneMatch) {
      // Also try rawText (non-normalized) for multi-line labeled phone
      phoneMatch = rawText.match(/(?:电话|手机|联系|Mobile)[：:、\s]*\n?\s*([+\d（）\(\)\-]{7,18})/i);
    }
    if (phoneMatch) {
      result.phone = phoneMatch[1].replace(/[\-（）\(\)\s]/g, '');
    }
  }

  // 补充邮箱 — labeled + bare email
  if (!result.email) {
    let emailMatch = normalized.match(/(?:邮箱|邮件|Email|E-mail)[：:、\s]*([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/i);
    if (!emailMatch) {
      // Bare email anywhere in text
      emailMatch = normalized.match(/([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/);
    }
    if (!emailMatch) {
      // Multi-line: label on one line, email on next
      emailMatch = rawText.match(/(?:邮箱|邮件|Email|E-mail)[：:、\s]*\n?\s*([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/i);
    }
    if (emailMatch) result.email = emailMatch[1];
  }

  // 补充姓名 — labeled + bare 2-4 char Chinese name
  if (!result.name) {
    const namePatterns = [
      /(?:姓名|Name|名字)[：:、\-\s]+([\u4e00-\u9fa5]{2,4})/i,
      /(?:姓\s*名)[：:、\-\s]+([\u4e00-\u9fa5]{2,4})/i,
      // Multi-line: 姓名 on one line, name on next (common in pdftotext)
      /姓\s*名\s*\n\s*([\u4e00-\u9fa5]{2,4})/i,
    ];
    const skipNames = new Set(['全职', '兼职', '实习', '临时', '外包', '派遣']);
    for (const pat of namePatterns) {
      const m = rawText.match(pat);
      if (m && !skipNames.has(m[1])) {
        result.name = m[1];
        break;
      }
    }
    // Fallback: first 2-4 char Chinese sequence in the first 200 chars of rawText
    // that isn't a skip word (resumes typically have name at the top)
    if (!result.name) {
      const headText = rawText.slice(0, 200);
      const bareNameMatch = headText.match(/(?:^|\n)\s*([\u4e00-\u9fa5]{2,4})\s*(?:\n|$)/);
      if (bareNameMatch && !skipNames.has(bareNameMatch[1])) {
        result.name = bareNameMatch[1];
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

  // 2. 如果 MinerU 失败，使用探测文本或客户端提取（textToMarkdown 修复中文碎片化）
  if (!contentMd && probeText) {
    contentMd = textToMarkdown(probeText);
    stages.push('textProbe');
  } else if (!contentMd) {
    // 最后尝试 pdf-parse（web 版本使用 instance API）
    try {
      const { PDFParse } = await import('pdf-parse');
      const data = new Uint8Array(await file.arrayBuffer());
      const pdf = new PDFParse(data);
      const pdfResult = await pdf.getText();
      if (pdfResult.text) {
        contentMd = textToMarkdown(pdfResult.text);
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

/** Crop a photo region from a page image using bounding box coordinates (ratios 0-1) */
async function cropPhotoFromPage(pageBase64: string, bbox: PhotoBbox): Promise<string> {
  try {
    const img = new Image();
    const src = `data:image/jpeg;base64,${pageBase64}`;

    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Image load failed'));
      img.src = src;
    });

    const w = img.naturalWidth;
    const h = img.naturalHeight;
    const sx = Math.round(bbox.x * w);
    const sy = Math.round(bbox.y * h);
    const sw = Math.round(bbox.width * w);
    const sh = Math.round(bbox.height * h);

    const canvas = document.createElement('canvas');
    canvas.width = sw;
    canvas.height = sh;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
    return canvas.toDataURL('image/jpeg', 0.85);
  } catch {
    return '';
  }
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
      const visionResult = await visionParseBatch(images, mimeType, config.authToken);
      if (visionResult) {
        stages.push('visionParse');
        // Crop photo from first page using bbox if available
        if (visionResult.photoBbox && images[0]) {
          photoBase64 = await cropPhotoFromPage(images[0], visionResult.photoBbox);
        } else {
          photoBase64 = '';
        }
        return {info: visionResult.info, photoBase64};
      }
    } catch (e) {
      console.warn('[Pipeline] Vision LLM batch failed:', e);
    }
  }

  return {info: emptyResult(''), photoBase64: ''};
}

// ---------------------------------------------------------------------------
// AI 调用封装
// ---------------------------------------------------------------------------

/** AI 文本解析 — 调用 Edge Function ai-proxy（带 30s 超时） */
async function aiTextParse(
  resumeText: string,
  authToken?: string,
): Promise<ParsedResumeInfo | null> {
  if (!resumeText || resumeText.trim().length < 30) return null;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  try {
    const edgeUrl = USE_MOCK_API
      ? '/api/ai/parse-resume'
      : `${API_BASE_URL}/functions/v1/embox-api/ai-proxy`;

    const resp = await fetch(edgeUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(authToken ? {'Authorization': `Bearer ${authToken}`} : {}),
      },
      body: JSON.stringify({ action: 'parse-resume', resumeText }),
      signal: controller.signal,
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
    if (e instanceof DOMException && e.name === 'AbortError') {
      console.warn('[Pipeline] AI text parse timed out (30s)');
    } else {
      console.warn('[Pipeline] AI text parse error:', e);
    }
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

/** 批量 Vision LLM 解析 — 分批发送到 Edge Function ai-proxy，超过 2 页时分片避免请求体过大 */
async function visionParseBatch(
  images: string[],
  mimeType: string,
  authToken?: string,
): Promise<VisionParseResult | null> {
  const edgeUrl = USE_MOCK_API
    ? '/api/ai/vision-parse'
    : `${API_BASE_URL}/functions/v1/embox-api/ai-proxy`;

  const tryBatch = async (chunk: string[]): Promise<VisionParseResult | null> => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 180000);
    try {
      const resp = await fetch(edgeUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? {'Authorization': `Bearer ${authToken}`} : {}),
        },
        body: JSON.stringify({ action: 'parse-resume-vision', images: chunk, mimeType }),
        signal: controller.signal,
      });

      if (!resp.ok) return null;
      const result = await resp.json() as Record<string, unknown>;

      if (result._parseFailed) {
        console.warn('[Pipeline] Vision _parseFailed:', result._parseError, '| model:', result.modelUsed);
      }

      if (result && (result.name || result.phone || result.email)) {
        return mapVisionResult(result);
      }
      // Log raw response to debug why Vision LLM returned empty fields
      if (result._rawResponse) {
        console.warn('[Pipeline] Vision LLM returned empty fields. Raw response:', String(result._rawResponse).slice(0, 1000));
      } else if (result._parseFailed) {
        // already logged above
      } else {
        console.warn('[Pipeline] Vision LLM returned no usable data:', JSON.stringify(result).slice(0, 500));
      }
      return null;
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') {
        console.warn('[Pipeline] Vision chunk timed out (180s)');
      } else {
        console.warn('[Pipeline] Vision chunk failed:', e);
      }
      return null;
    } finally {
      clearTimeout(timeoutId);
    }
  };

  // Helper: pause between retries to avoid rate limiting (Zhipu rate limit is ~30 RPM)
  const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

  // Try full batch first
  const batchResult = await tryBatch(images);
  if (batchResult) return batchResult;

  // Rate-limited or failed — wait before fallback attempts
  // Zhipu rate limit is ~30 RPM, so 5s gives the limiter a full window to reset
  await delay(5000);

  // Fallback: single page with delays between each
  for (let i = 0; i < images.length; i++) {
    if (i > 0) await delay(3000); // pause between pages (3s for rate limit reset)
    try {
      const result = await visionParseSingle(images[i], mimeType, authToken);
      if (result && (result.info.name || result.info.phone || result.info.email)) return result;
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
): Promise<VisionParseResult | null> {
  const edgeUrl = USE_MOCK_API
    ? '/api/ai/vision-parse'
    : `${API_BASE_URL}/functions/v1/embox-api/ai-proxy`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 120000);

  try {
    const resp = await fetch(edgeUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(authToken ? {'Authorization': `Bearer ${authToken}`} : {}),
      },
      body: JSON.stringify({ action: 'parse-resume-vision', images: [imageBase64], mimeType }),
      signal: controller.signal,
    });

    if (!resp.ok) return null;
    const result = await resp.json() as Record<string, unknown>;

    if (result._parseFailed) {
      console.warn('[Pipeline] Vision single _parseFailed:', result._parseError, '| model:', result.modelUsed);
    }

    if (result && (result.name || result.phone || result.email)) {
      clearTimeout(timeoutId);
      return mapVisionResult(result);
    }
    return null;
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      console.warn('[Pipeline] Vision single page timed out (120s)');
    } else {
      console.warn('[Pipeline] Vision proxy failed:', e);
    }
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

/** 统一映射 Vision API 返回 → ParsedResumeInfo */
function mapVisionResult(result: Record<string, unknown>): VisionParseResult {
  const info: ParsedResumeInfo = {
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
    photoBase64: '',
    rawText: '',
  };
  let photoBbox: PhotoBbox | null = null;
  if (result.photoBbox && typeof result.photoBbox === 'object') {
    const b = result.photoBbox as Record<string, unknown>;
    if (typeof b.x === 'number' && typeof b.y === 'number' && typeof b.width === 'number' && typeof b.height === 'number') {
      photoBbox = { x: b.x, y: b.y, width: b.width, height: b.height };
    }
  }
  return { info, photoBbox };
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
/** Build a markdown representation from parsed resume fields.
 *  Used when VISION_PATH extracts structured fields without raw text,
 *  so AI agents have enough content for rawText-based processing. */
function buildContentMd(info: ParsedResumeInfo): string {
  const lines: string[] = ['# 简历'];
  if (info.name) lines.push('\n## 基本信息', `- 姓名：${info.name}`);
  if (info.gender) lines.push(`- 性别：${info.gender}`);
  if (info.ageOrBirth) lines.push(`- 年龄/出生：${info.ageOrBirth}`);
  if (info.phone) lines.push(`- 电话：${info.phone}`);
  if (info.email) lines.push(`- 邮箱：${info.email}`);
  if (info.location) lines.push(`- 所在地：${info.location}`);
  if (info.currentlyEmployed) lines.push(`- 在职状态：${info.currentlyEmployed}`);
  if (info.expectedSalary) lines.push(`- 期望薪资：${info.expectedSalary}`);
  if (info.school || info.highestEducation || info.major) {
    lines.push('\n## 教育信息');
    if (info.school) lines.push(`- 学校：${info.school}`);
    if (info.highestEducation) lines.push(`- 学历：${info.highestEducation}`);
    if (info.major) lines.push(`- 专业：${info.major}`);
    if (info.education) lines.push(`- 教育经历：${info.education}`);
  }
  if (info.workExperience.length > 0) {
    lines.push('\n## 工作经历');
    info.workExperience.forEach((exp) => lines.push(`- ${exp}`));
  }
  if (info.skills.length > 0) {
    lines.push('\n## 技能');
    info.skills.forEach((skill) => lines.push(`- ${skill}`));
  }
  return lines.join('\n');
}

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
    if (USE_MOCK_API) {
      // Mock 模式：跳过 Vision 路径（避免 pdfjs-dist CDN worker 下载挂起）
      parsedInfo = emptyResult();
      photoBase64 = '';
      stages.push('vision:skipped(mock)');
    } else {
      const visionResult = await extractViaVisionPath(file, config, stages);
      parsedInfo = visionResult.info;
      photoBase64 = visionResult.photoBase64;
      visionLlmUsed = stages.includes('visionParse');
      contentMd = buildContentMd(parsedInfo);
      // CRITICAL: Assign cropped photo to parsedInfo so it shows on candidate cards
      if (photoBase64) {
        parsedInfo.photoBase64 = photoBase64;
      }
    }
  } else {
    // === TEXT_PATH ===
    const textResult = await extractViaTextPath(file, route.textProbe, config, stages);
    parsedInfo = textResult.info;
    contentMd = textResult.contentMd;
    photoBase64 = textResult.photoBase64;
    mineruUsed = stages.includes('mineru');

    // 质量检查：如果 TEXT_PATH 结果不好，升级到 VISION_PATH（仅非 mock 模式）
    const quality = assessQuality(parsedInfo);
    if (quality.score < 65 && !USE_MOCK_API) {
      console.log(`[Pipeline] TEXT_PATH quality=${quality.score} (< 40), escalating to VISION_PATH`);
      const visionResult = await extractViaVisionPath(file, config, stages);
      if (visionResult.info.name || visionResult.info.phone) {
        parsedInfo = mergeResults(visionResult.info, parsedInfo);
        photoBase64 = visionResult.photoBase64 || photoBase64;
        if (photoBase64 && !parsedInfo.photoBase64) {
          parsedInfo.photoBase64 = photoBase64;
        }
        finalRoute = 'vision_fallback';
      }
      visionLlmUsed = stages.includes('visionParse');
    } else if (quality.score < 65 && USE_MOCK_API) {
      console.log(`[Pipeline] TEXT_PATH quality=${quality.score} (< 40), skipping vision escalation (mock mode)`);
      stages.push('vision:skipped(mock)');
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
