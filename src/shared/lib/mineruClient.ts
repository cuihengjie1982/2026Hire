// MinerU API client for document parsing
// Docs: https://mineru.net
//
// 安全设计：Vision AI 调用通过后端代理 (/api/ai/vision-parse)，API Key 不暴露到浏览器。
// MinerU 文档解析如果 Token 可用，仍然从前端直接调用（MinerU Token 是 JWT，风险可控）。

import {API_BASE_URL, USE_MOCK_API, getAuthToken} from './runtime';
import {fetchJson} from './apiClient';

// MinerU Token — 用于 PDF 文档解析（非 AI Vision，风险可控）
const MINERU_API_TOKEN = import.meta.env.VITE_MINERU_API_TOKEN || '';

/** 通过后端代理调用 Vision AI 解析简历图片（API Key 安全，不暴露到浏览器） */
async function parseResumeImageViaProxy(imageBase64: string, mimeType: string): Promise<ParsedResumeInfo | null> {
  try {
    const result = await fetchJson<Record<string, unknown>>('/api/ai/vision-parse', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({imageBase64, mimeType}),
      timeoutMs: 120000,
    } as RequestInit & { timeoutMs?: number });
    if (result && result.name) {
      return result as unknown as ParsedResumeInfo;
    }
    return null;
  } catch (e) {
    console.warn('[VisionProxy] 代理调用失败:', e);
    return null;
  }
}

// When VITE_USE_MOCK_API=false and API_BASE_URL points to Supabase,
// we call MinerU API directly from the browser (bypassing the backend proxy
// which relied on server-side exec for pdftotext/tesseract).
// The backend /api/mineru/file_parse route is only available in the local
// Express dev server. In production (Vercel + Supabase), we call MinerU directly.
const MINERU_API_URL = 'https://mineru.net/api/v4/extract/task';

export interface MinerUParseResult {
  success: boolean;
  content_md?: string;
  middle_json_path?: string;
  content_list?: Array<{
    type: string;
    text: string;
    page_idx: number;
  }>;
  photoBase64?: string;
  error?: string;
}

// Client-side PDF text extraction using pdf-parse
const extractTextFromPdfClientSide = async (file: File): Promise<string | null> => {
  try {
    const PDFParse = (await import('pdf-parse')).PDFParse;
    const data = new Uint8Array(await file.arrayBuffer());
    // @ts-expect-error pdf-parse v2 API
    const result = await PDFParse.getText(data);
    return result.text || null;
  } catch (error) {
    console.warn('[MinerU] Client-side PDF parse failed, will use server-side parsing:', error);
    return null;
  }
};

// Convert extracted text to markdown-like format
const textToMarkdown = (text: string): string => {
  // Step 1: Remove binary garbage (long base64-like strings, control chars)
  let cleaned = text
    .replace(/[a-zA-Z0-9+/=]{20,}/g, '')  // Remove base64/hex strings (lowered threshold)
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')  // Remove control chars except \n \t
    .replace(/\x0C/g, '\n');  // Form feed → newline

  // Step 2: Fix pdftotext Chinese character fragmentation
  // pdftotext often outputs each char on its own line with blank lines between
  let prev = '';
  while (prev !== cleaned) {
    prev = cleaned;
    cleaned = cleaned
      .replace(/([\u4e00-\u9fa5])\n+([\u4e00-\u9fa5])/g, '$1$2')
      .replace(/([\u4e00-\u9fa5])\n+([a-zA-Z0-9])/g, '$1$2')
      .replace(/([a-zA-Z0-9])\n+([\u4e00-\u9fa5])/g, '$1$2');
  }

  // Step 3: Join fragmented words/numbers across single newlines
  cleaned = cleaned
    .replace(/([a-zA-Z0-9])\n+([a-zA-Z0-9])/g, '$1$2')
    .replace(/([.,;:!?])\n+([a-zA-Z0-9\u4e00-\u9fa5])/g, '$1 $2')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\t+/g, ' ')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .trim();

  let markdown = '# 简历\n\n';

  // Split into lines
  const lines = cleaned.split('\n').filter(l => l.trim());

  // Section headers to skip (standalone)
  const skipSections = ['基本信息', '教育背景', '实习经历', '校园经历', '工作经历', '技能特长', '自我评价', '个人简历', 'Personal resume', 'RESUME'];

  // Field pattern: label + colon/space + value
  const fieldPattern = /^([\u4e00-\u9fa5]{1,6})[：:、\s]+(.+)$/;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.length > 200) continue;

    const skip = skipSections.some(s => trimmed === s || (trimmed.includes(s) && trimmed.length < 20));
    if (skip) continue;

    // Skip lines that look like binary garbage remnants (short random alphanumeric + special chars)
    if (/^[a-zA-Z0-9+/=_~\-]{3,}$/.test(trimmed) && !/[@.]/.test(trimmed)) continue;
    // Skip very short lines that are pure gibberish (2-4 chars of mixed case/numbers with no meaning)
    if (trimmed.length <= 4 && /^[a-zA-Z0-9_~+\-=]+$/.test(trimmed) && /[a-z]/.test(trimmed) && /[A-Z0-9]/.test(trimmed)) continue;

    const fieldMatch = trimmed.match(fieldPattern);
    if (fieldMatch) {
      const [, fieldName, fieldValue] = fieldMatch;
      const cleanValue = fieldValue.trim();
      if (cleanValue && cleanValue.length < 100) {
        markdown += `${fieldName}：${cleanValue}\n`;
      }
    } else {
      markdown += `${trimmed}\n`;
    }
  }

  // If we didn't extract much, use cleaned raw text
  if (markdown === '# 简历\n\n') {
    markdown = `# 简历\n\n${cleaned}`;
  }

  return markdown;
};

// Render all pages of a PDF as base64 images (for Vision LLM parsing)
export const renderPdfPagesAsImages = async (arrayBuffer: ArrayBuffer): Promise<string[]> => {
  const PDFJS = await import('pdfjs-dist');
  PDFJS.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.min.mjs`;

  const pdf = await PDFJS.getDocument({data: new Uint8Array(arrayBuffer)}).promise;
  const pageImages: string[] = [];
  const maxPages = Math.min(pdf.numPages, 5); // limit to 5 pages to avoid token limits

  for (let i = 1; i <= maxPages; i++) {
    const page = await pdf.getPage(i);
    const scale = 2.0; // 2x resolution for better OCR quality
    const viewport = page.getViewport({scale});
    const canvas = document.createElement('canvas');
    canvas.height = viewport.height;
    canvas.width = viewport.width;
    await page.render({canvasContext: canvas.getContext('2d')!, viewport} as any).promise;
    pageImages.push(canvas.toDataURL('image/jpeg', 0.85).split(',')[1]); // strip data URI prefix
  }
  return pageImages;
};

// Parse resume using Vision LLM — converts PDF pages to images and sends to AI
export const parseResumeWithVision = async (file: File): Promise<ParsedResumeInfo> => {
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  const isImage = ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp'].includes(ext);
  const arrayBuffer = await file.arrayBuffer();

  let imageParts: string[] = [];
  let mimeType = 'image/jpeg';

  if (isImage) {
    // Image file — use directly
    const bytes = new Uint8Array(arrayBuffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i += 8192) {
      const chunk = bytes.subarray(i, Math.min(i + 8192, bytes.length));
      binary += String.fromCharCode(...chunk);
    }
    imageParts = [btoa(binary)];
    mimeType = `image/${ext === 'jpg' ? 'jpeg' : ext}`;
  } else if (ext === 'pdf') {
    // PDF — render pages as images
    imageParts = await renderPdfPagesAsImages(arrayBuffer);
  } else {
    return {name: '', gender: '', ageOrBirth: '', phone: '', email: '', location: '',
      education: '', highestEducation: '', school: '', major: '', workExperience: [],
      skills: [], honors: [], expectedSalary: '', currentlyEmployed: '', availability: '',
      photoBase64: '', rawText: ''};
  }

  // Also extract photo from first page if it's a PDF
  let photoBase64 = '';
  if (ext === 'pdf' && imageParts.length > 0) {
    photoBase64 = `data:image/jpeg;base64,${imageParts[0]}`;
  }

  try {
    // 所有 Vision AI 调用通过后端代理，API Key 不暴露到浏览器
    // 后端自动选择可用的 Vision 模型（GLM-4V / MiniMax-VL / Gemini）
    for (const image of imageParts) {
      const result = await parseResumeImageViaProxy(image, mimeType);
      if (result && result.name) {
        // 如果有照片，附加到结果
        if (photoBase64 && !result.photoBase64) {
          result.photoBase64 = photoBase64;
        }
        return result;
      }
    }

    // 代理调用失败，返回空结果
    console.warn('[Vision] 后端代理解析失败，返回空结果');
    return emptyResult(photoBase64);
  } catch (e) {
    console.error('[Vision] parse error:', e);
    return emptyResult(photoBase64);
  }
}

function emptyResult(photoBase64: string) {
  return {name: '', gender: '', ageOrBirth: '', phone: '', email: '', location: '',
    education: '', highestEducation: '', school: '', major: '', workExperience: [],
    skills: [], honors: [], expectedSalary: '', currentlyEmployed: '', availability: '',
    photoBase64, rawText: ''};
}

// Extract first page from PDF as image (base64) for photo display
const extractPdfFirstPageImage = async (arrayBuffer: ArrayBuffer): Promise<string> => {
  try {
    const PDFJS = await import('pdfjs-dist');
    const pdfjsLib = PDFJS;
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.min.mjs`;

    const loadingTask = pdfjsLib.getDocument({data: new Uint8Array(arrayBuffer)});
    const pdf = await loadingTask.promise;
    const page = await pdf.getPage(1);
    const scale = 2; // Higher resolution for better quality
    const viewport = page.getViewport({scale});

    // Create canvas
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d')!;
    canvas.height = viewport.height;
    canvas.width = viewport.width;

    const renderContext = {
      canvasContext: context,
      viewport,
    };

    await page.render(renderContext as any).promise;
    return canvas.toDataURL('image/jpeg', 0.85);
  } catch (e) {
    throw new Error(`Failed to extract PDF first page: ${e}`);
  }
};

export const parseResumeWithMinerU = async (
  file: File,
  _apiToken: string,
): Promise<MinerUParseResult> => {
  try {
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    const isImage = ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp'].includes(ext);
    const isPdf = ext === 'pdf';

    const arrayBuffer = await file.arrayBuffer();
    // Convert to base64 in chunks to avoid stack overflow on large files
    const bytes = new Uint8Array(arrayBuffer);
    let binary = '';
    const chunkSize = 8192;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
      binary += String.fromCharCode(...chunk);
    }
    const base64 = btoa(binary);

    // For image files, use the file itself as photo
    let photoBase64 = '';
    if (isImage) {
      photoBase64 = `data:image/${ext === 'jpg' ? 'jpeg' : ext};base64,${base64}`;
    }

    // Controller for aborting fetch requests
    const controller = new AbortController();
    // Hard cap: Supabase cancels Edge Function workers at ~150s. Set to 45s so we get
    // a real HTTP response instead of a connection reset. Client-side PDF parse is the fallback.
    const timeoutId = setTimeout(() => controller.abort(), 45000);

    try {
      // Use server-side proxy in production to avoid exposing MinerU token in browser
      // Two-phase async: 1) upload file → get task_id, 2) poll for results
      // Falls back to client-side parsing if proxy is unavailable
      const isProduction = API_BASE_URL.includes('supabase.co') && USE_MOCK_API === false;

      if (isProduction) {
        try {
          const token = getAuthToken();
          const proxyFormData = new FormData();
          proxyFormData.append('file', file);

          // Phase 1: Start extraction (upload file)
          const startResponse = await fetch(`${API_BASE_URL}/functions/v1/embox-api/mineru-proxy/parse`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
            },
            body: proxyFormData,
            signal: controller.signal,
          });

          if (!startResponse.ok) {
            throw new Error(`Parse start failed: HTTP ${startResponse.status}`);
          }

          const startResult = await startResponse.json();
          console.log('[MinerU] Parse start:', JSON.stringify(startResult).slice(0, 300));
          // If the proxy returned content directly (backward compat), use it
          if (startResult.content_md && startResult.content_md.length > 50) {
            clearTimeout(timeoutId);
            if (!photoBase64 && startResult.content_list && Array.isArray(startResult.content_list)) {
              const imageEntry = startResult.content_list.find((item: {type: string; text: string}) => item.type === 'image' && item.text);
              if (imageEntry) {
                photoBase64 = imageEntry.text.startsWith('data:') ? imageEntry.text : `data:image/jpeg;base64,${imageEntry.text}`;
              }
            }
            return {
              success: true,
              content_md: startResult.content_md,
              content_list: startResult.content_list || [],
              photoBase64,
            };
          }

          // Phase 2: Poll for results (task_id based)
          if (startResult.task_id && startResult.status === 'processing') {
            // Reset timeout for polling phase — give MinerU up to 120s to finish
            clearTimeout(timeoutId);
            const pollTimeoutId = setTimeout(() => controller.abort(), 130000);

            const maxPolls = 40; // 40 × 3s = 120s max
            for (let i = 0; i < maxPolls; i++) {
              await new Promise(r => setTimeout(r, 3000));

              const pollResponse = await fetch(`${API_BASE_URL}/functions/v1/embox-api/mineru-proxy/poll`, {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${token}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  task_id: startResult.task_id,
                  api_type: startResult.api_type || 'agent',
                }),
                signal: controller.signal,
              });

              if (!pollResponse.ok) {
                console.warn(`[MinerU] Poll ${i + 1} failed: HTTP ${pollResponse.status}`);
                continue;
              }

              const pollResult = await pollResponse.json();
              console.log(`[MinerU] Poll ${i + 1}: status=${pollResult.status}, state=${pollResult.state || '?'}, hasContent=${!!pollResult.content_md}, contentLen=${pollResult.content_md?.length ?? 0}`);

              if (pollResult.error) {
                clearTimeout(pollTimeoutId);
                throw new Error(pollResult.error.message || 'Poll failed');
              }

              if (pollResult.status === 'done' && pollResult.content_md && pollResult.content_md.length > 50) {
                clearTimeout(pollTimeoutId);
                if (!photoBase64 && pollResult.content_list && Array.isArray(pollResult.content_list)) {
                  const imageEntry = pollResult.content_list.find((item: {type: string; text: string}) => item.type === 'image' && item.text);
                  if (imageEntry) {
                    photoBase64 = imageEntry.text.startsWith('data:') ? imageEntry.text : `data:image/jpeg;base64,${imageEntry.text}`;
                  }
                }
                return {
                  success: true,
                  content_md: pollResult.content_md,
                  content_list: pollResult.content_list || [],
                  photoBase64,
                };
              }

              console.log(`[MinerU] Poll ${i + 1}: status=${pollResult.status}, state=${pollResult.state || '?'}`);
            }

            clearTimeout(pollTimeoutId);
            throw new Error('MinerU extraction timed out (120s max for async polling)');
          }
        } catch (proxyErr) {
          clearTimeout(timeoutId);
          console.log('[MinerU] Proxy failed, falling back to client-side parsing:', proxyErr);
        }
      } else {
        // Dev mode: direct MinerU call (token loaded from env)
        const formData = new FormData();
        formData.append('files', file);
        formData.append('model_version', 'vlm');

        const response = await fetch(MINERU_API_URL, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${_apiToken}`,
          },
          body: formData,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (response.ok) {
          const result = await response.json();
          if (result.content_md && result.content_md.length > 50) {
            if (!photoBase64 && result.content_list && Array.isArray(result.content_list)) {
              const imageEntry = result.content_list.find((item: {type: string; text: string}) => item.type === 'image' && item.text);
              if (imageEntry) {
                photoBase64 = imageEntry.text.startsWith('data:') ? imageEntry.text : `data:image/jpeg;base64,${imageEntry.text}`;
              }
            }
            return {
              success: true,
              content_md: result.content_md,
              content_list: result.content_list || [],
              photoBase64,
            };
          }
          console.log('[MinerU] Proxy returned insufficient content, using client-side parsing');
        }
      }

      clearTimeout(timeoutId);
    } catch (fetchError) {
      clearTimeout(timeoutId);
      console.log('Proxy fetch failed, using client-side parsing');
    }

    // For image files, we can't extract text client-side without OCR
    if (isImage) {
      return {success: false, error: 'Image OCR failed — MinerU API unavailable', photoBase64};
    }

    // For PDFs: fall back to client-side PDF parsing
    if (isPdf) {
      console.log('[MinerU] Using client-side PDF parsing for:', file.name);
      const pdfText = await extractTextFromPdfClientSide(file);
      if (!pdfText) {
        return {success: false, error: 'PDF parsing failed (no text extracted)'};
      }
      const markdown = textToMarkdown(pdfText);

      // Try to extract first page as photo
      if (!photoBase64) {
        try {
          photoBase64 = await extractPdfFirstPageImage(arrayBuffer);
        } catch (e) {
          console.warn('Failed to extract PDF first page image:', e);
        }
      }

      return {
        success: true,
        content_md: markdown,
        photoBase64,
      };
    }

    return {success: false, error: 'Unsupported file type'};
  } catch (err) {
    console.error('[parseResumeWithMinerU]', err);
    const errorMsg = err instanceof Error ? err.message : String(err);
    return {success: false, error: `MinerU parse error: ${errorMsg}`};
  }
};

// Extract resume info from markdown or plain text
// Handles multiple formats:
// - "姓名：张三" (inline key-value)
// - "# 姓名\n张三" (markdown header + next-line value)
// - bare values (phone numbers, Chinese names)
// - various label styles
export const extractResumeInfoFromMarkdown = (contentMd: string): ParsedResumeInfo => {
  // Phase 1: consolidate inline field pairs that MinerU outputs as:
  //   "# 姓名\n温长根"       → "姓名：温长根"
  //   "# 电话\n16655810671"  → "电话：16655810671"
  //
  // Section headers (工作经历, 教育背景, etc.) are NOT merged — they mark
  // multi-line content blocks and should not consume the next line as a value.
  //
  // Phase 2: extract structured fields from the consolidated line list.

  const SECTION_HEADERS = new Set([
    '基本信息', '求职意向', '自我评价', '教育背景', '教育经历', '实习经历',
    '工作经历', '项目经历', '项目经验', '专业技能', '技能特长', '相关技能',
    '荣誉证书', '荣誉', '获奖情况', '兴趣爱好', '个人优势', '语言能力',
    '培训经历', '证书资质', '联系方式', '工作职责', '工作内容', '项目描述',
  ]);

  // Lines that are too noisy to keep in output for bare-value fallback matching
  const SKIP_PATTERNS = [
    /^\d{4}[./\-]\d{2}[./\-]\d{2}$/,           // dates like 2021.09-2024.06
    /^[a-zA-Z0-9+/=]{20,}$/,                   // base64/gibberish remnants
    /^(?:a|b|c|d|e|f)\)$/i,                   // list item letters like a) b)
  ];

  const FIELD_HEADER_RE = /^#{1,2}\s*([\u4e00-\u9fa5a-zA-Z0-9]{1,12})\s*$/;
  const IS_INLINE_FIELD = /^[^\n]*[：:][^：:]{2,}$/;

  const lines = contentMd.split('\n');
  let pendingField: string | null = null;
  const out: string[] = [];

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    // Always skip blank lines — they break pending-field chains
    if (!trimmed) { pendingField = null; continue; }

    const fieldMatch = trimmed.match(FIELD_HEADER_RE);
    if (fieldMatch) {
      const label = fieldMatch[1];
      if (SECTION_HEADERS.has(label)) {
        pendingField = null;
        // Don't push section header lines — they're noise for field extraction
      } else {
        // Inline field header (姓名, 电话, etc.) — finalize previous pending
        if (pendingField && out.length > 0) {
          out[out.length - 1] = `${pendingField}：${out[out.length - 1]}`;
        }
        pendingField = label;
      }
      continue;
    }

    // Skip known noise patterns (dates, base64, list markers)
    if (SKIP_PATTERNS.some(r => r.test(trimmed))) continue;

    // Non-blank content line
    if (pendingField) {
      // If this line has its own inline field (has ：or:), keep it standalone
      if (IS_INLINE_FIELD.test(trimmed)) {
        out.push(trimmed);
      } else {
        // No inline field — merge with pending field header
        out.push(`${pendingField}：${trimmed}`);
        pendingField = null;
      }
    } else {
      out.push(trimmed);
    }
  }
  // Finalize any remaining pending field
  if (pendingField && out.length > 0) {
    out[out.length - 1] = `${pendingField}：${out[out.length - 1]}`;
  }

  const rawText = contentMd;

  const info: ParsedResumeInfo = {
    name: '',
    gender: '',
    ageOrBirth: '',
    phone: '',
    email: '',
    location: '',
    education: '',
    highestEducation: '',
    school: '',
    major: '',
    workExperience: [],
    skills: [],
    honors: [],
    expectedSalary: '',
    currentlyEmployed: '',
    availability: '',
    photoBase64: '',
    rawText,
  };

  // Phase 2: field-label-header → value pairs.
  // Only match headers whose label is a known field label (姓名, 电话, etc.).
  // Skip lines that look like values (Chinese text > 4 chars) — those are
  // section content (school names, company names), not field labels.
  const FIELD_LABEL_HEADERS = new Set([
    '姓名', '名字', '电话', '手机', '邮箱', '邮件', '性别', '年龄', '出生',
    '出生年月', '居住地', '所在地', '所在城市', '毕业院校', '学校', 'college',
    'university', '专业', 'major', '研究方向', '学历', '最高学历', '教育',
    '期望薪资', '薪资', '工作地点', '意向岗位',
  ]);

  // Section header regex (different max length for this phase)
  const SECTION_RE = /^#{1,2}\s*([\u4e00-\u9fa5a-zA-Z0-9]{1,15})\s*$/;

  for (let i = 0; i < lines.length - 1; i++) {
    const a = lines[i].trim();
    const b = lines[i + 1].trim();
    if (!a || !b) continue;

    const m = a.match(SECTION_RE);
    if (!m) continue;
    const label = m[1];

    // Only handle known field-label headers — skip section headers (教育背景, 工作经历, etc.)
    if (!FIELD_LABEL_HEADERS.has(label) && !FIELD_LABEL_HEADERS.has(label.toLowerCase())) continue;

    // Skip if b looks like a section header (it's content-as-header, not a value)
    if (SECTION_RE.test(b)) continue;
    // Skip if b is a date line
    if (/^\d{4}[./\-]\d{2}[./\-]\d{2}/.test(b)) continue;
    // Skip if b is pure noise
    if (SKIP_PATTERNS.some(r => r.test(b))) continue;
    // Skip if b is a long Chinese text line (likely a school/company name, not a value)
    if (/^[\u4e00-\u9fa5]{5,}$/.test(b)) continue;

    out.push(`${label}：${b}`);
  }

  // Phase 3: section-aware fallback — for resumes with no field-label headers.
  // Track current section and capture school/company from section content.
  // NOTE: do NOT reset currentSection on non-section headers — they may be
  // content-as-headers (e.g., school name as # 广州岭南职业技术学院).
  const sectionValueMap: Record<string, string> = {};
  let currentSection = '';
  const sectionHeaderRe = /^#{1,2}\s*([\u4e00-\u9fa5a-zA-Z0-9]{1,15})\s*$/;
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed) continue; // blank lines don't change section
    const m = trimmed.match(sectionHeaderRe);
    if (m) {
      const label = m[1];
      if (SECTION_HEADERS.has(label)) {
        currentSection = label; // entering a new section
      }
      // Don't reset currentSection on non-section headers — school/company
      // names often appear as content-as-headers within a section context.
    }
    if (!SECTION_HEADERS.has(currentSection)) continue;

    if ((currentSection === '教育背景' || currentSection === '教育经历') && sectionValueMap['school'] === undefined) {
      // Scan ahead: skip leading date lines, then take the next non-blank non-noise line.
      // This handles "教育背景\n2021.09-2024.06\n# 广州岭南职业技术学院" correctly.
      let schoolValue: string | null = null;
      for (let j = i + 1; j < lines.length; j++) {
        const nl = lines[j].trim();
        if (!nl) continue;
        if (SKIP_PATTERNS.some(r => r.test(nl))) continue;
        // Date line — skip (precedes school)
        if (/^\d{4}[./\-]/.test(nl)) continue;
        // Header line — it's the school name as a header
        const hm = nl.match(/^#{1,2}\s*([^\n]{1,50})\s*$/);
        if (hm) { schoolValue = hm[1]; break; }
        // Any other content — take it as the school value
        schoolValue = nl; break;
      }
      if (schoolValue) sectionValueMap['school'] = schoolValue;
    }
    if ((currentSection === '教育背景' || currentSection === '教育经历') && sectionValueMap['major'] === undefined) {
      // Non-section-header line within education section — check if it's a major name.
      // Only treat it as a major if it contains typical major keywords (not school names).
      const hm = trimmed.match(/^#{1,2}\s*([^\n]{2,20})\s*$/);
      if (hm && !/^\d{4}/.test(hm[1]) && !SECTION_HEADERS.has(hm[1])) {
        const candidate = hm[1];
        // Skip if it looks like a school name (university/college keywords)
        if (!/学院|大学|school|university|college/i.test(candidate)) {
          sectionValueMap['major'] = candidate;
        }
      }
    }
    if (currentSection === '工作经历' || currentSection === '实习经历') {
      if (sectionValueMap['workCompany'] === undefined) {
        // Skip leading date lines, then take the next non-blank non-noise line as company name
        let companyValue: string | null = null;
        for (let j = i + 1; j < lines.length; j++) {
          const nl = lines[j].trim();
          if (!nl) continue;
          if (SKIP_PATTERNS.some(r => r.test(nl))) continue;
          if (/^\d{4}[./\-]/.test(nl)) continue;
          const hm = nl.match(/^#{1,2}\s*([^\n]{1,50})\s*$/);
          if (hm) { companyValue = hm[1]; break; }
          companyValue = nl; break;
        }
        if (companyValue) sectionValueMap['workCompany'] = companyValue;
      }
    }
  }

  for (const line of out) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Name: 姓名：张三, 姓名-张三, 姓名  张三, Name: Zhang San
    // Also handles: "姓 名  朱松豪" (with space between 姓 and 名)
    // Also handles: "姓名：温长根" (after header consolidation merges "# 姓名\n温长根")
    if (/(?:姓\s*名|Name|名字)[：:、\-\s]+(.+)/i.test(trimmed)) {
      const m = trimmed.match(/(?:姓\s*名|Name|名字)[：:、\-\s]+(.+)/i);
      if (m) info.name = m[1].trim();
      continue;
    }
    // Bare Chinese name (2-4 chars, pure Chinese, no label) — fallback if no name yet
    // Skip lines that look like role titles, section names, or single-field headers
    if (!info.name && /^[\u4e00-\u9fa5]{2,4}$/.test(trimmed)) {
      const skipNames = new Set([
        '形体兼职', '全职', '兼职', '实习', '临时', '外包', '派遣',
        '基本信息', '求职意向', '自我评价', '教育背景', '教育经历',
        '实习经历', '工作经历', '项目经历', '专业技能', '技能特长',
        '相关技能', '荣誉证书', '兴趣爱好', '个人优势', '语言能力',
        '培训经历', '证书资质', '联系方式', '项目描述',
      ]);
      if (!skipNames.has(trimmed)) {
        info.name = trimmed;
      }
      continue;
    }
    // Gender
    if (/(?:性别|Gender)[：:、\s]+(.+)/i.test(trimmed)) {
      const m = trimmed.match(/(?:性别|Gender)[：:、\s]+(.+)/i);
      if (m) info.gender = m[1].trim();
      continue;
    }
    // Phone: 电话: 138xxxx, Mobile: 138xxxx, 手机138xxxx, +86-139-xxxx
    if (/(?:电话|Mobile|手机)[：:、\s]*([+\d（）\(\)\-]{7,})/i.test(trimmed)) {
      const m = trimmed.match(/(?:电话|Mobile|手机)[：:、\s]*([+\d（）\(\)\-]{7,})/i);
      if (m) {
        // Normalize: strip hyphens and parens for +86 numbers
        const raw = m[1].trim();
        info.phone = raw.replace(/[\-（）\(\)]/g, '');
      }
      continue;
    }
    // Email
    if (/(?:邮箱|邮件|Email)[：:、\s]+([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/i.test(trimmed)) {
      const m = trimmed.match(/(?:邮箱|邮件|Email)[：:、\s]+([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/i);
      if (m) info.email = m[1].trim();
      continue;
    }
    // Location: 居住地/所在地/所在城市/地点/工作地点
    if (/(?:居住地|所在地|所在城市|地点|工作地点)[：:、\s]+(.+)/i.test(trimmed)) {
      const m = trimmed.match(/(?:居住地|所在地|所在城市|地点|工作地点)[：:、\s]+(.+)/i);
      if (m) info.location = m[1].trim();
      continue;
    }
    // School
    if (/(?:毕业院校|学校|College|University)[：:、\s]+(.+)/i.test(trimmed)) {
      const m = trimmed.match(/(?:毕业院校|学校|College|University)[：:、\s]+(.+)/i);
      if (m) info.school = m[1].trim();
      continue;
    }
    // Major
    if (/(?:专业|Major|研究方向)[：:、\s]+(.+)/i.test(trimmed)) {
      const m = trimmed.match(/(?:专业|Major|研究方向)[：:、\s]+(.+)/i);
      if (m) info.major = m[1].trim();
      continue;
    }
    // Highest education level
    if (/(?:最高学历|学历|Education)[：:、\s]+(.+)/i.test(trimmed)) {
      const m = trimmed.match(/(?:最高学历|学历|Education)[：:、\s]+(.+)/i);
      if (m) info.highestEducation = m[1].trim();
      continue;
    }
    // Skills
    if (/(?:技能|Skill|特长)[：:、\s]+(.+)/i.test(trimmed)) {
      const m = trimmed.match(/(?:技能|Skill|特长)[：:、\s]+(.+)/i);
      if (m) {
        const skills = m[1].trim().split(/[、,，]/).map(s => s.trim()).filter(s => s.length > 0 && s.length < 30);
        if (skills.length > 0) info.skills = skills;
      }
      continue;
    }
    // Age/birth
    if (/(?:年龄|出生年月|Birth|生日)[：:、\s]+(.+)/i.test(trimmed)) {
      const m = trimmed.match(/(?:年龄|出生年月|Birth|生日)[：:、\s]+(.+)/i);
      if (m) info.ageOrBirth = m[1].trim();
      continue;
    }
    // Expected salary
    if (/(?:期望薪资|Salary|期望)[：:、\s]+(.+)/i.test(trimmed)) {
      const m = trimmed.match(/(?:期望薪资|Salary|期望)[：:、\s]+(.+)/i);
      if (m) info.expectedSalary = m[1].trim();
      continue;
    }
    // Current employment
    if (/(?:当前状态|在职状态|Employment)[：:、\s]+(.+)/i.test(trimmed)) {
      const m = trimmed.match(/(?:当前状态|在职状态|Employment)[：:、\s]+(.+)/i);
      if (m) info.currentlyEmployed = m[1].trim();
      continue;
    }
    // Experience sections
    if (/(?:工作经历|实习经历|项目经验|项目经历|经历)[：:：]*/i.test(trimmed)) {
      const content = trimmed.replace(/(?:工作经历|实习经历|项目经验|项目经历|经历)[：:：\s]*/i, '').trim();
      if (content) info.workExperience.push(content);
      continue;
    }
    // Bare date-range work experience line: "2022-01 - 2024-01 ABC科技公司"
    if (/^\d{4}[./\-]\d{2}\s*[-–—]\s*\d{4}[./\-]\d{2}\s+(.+)/.test(trimmed)) {
      const m = trimmed.match(/^(\d{4}[./\-]\d{2}\s*[-–—]\s*\d{4}[./\-]\d{2})\s+(.+)/);
      if (m) info.workExperience.push(`${m[1]} ${m[2]}`);
      continue;
    }
    // Bare education date-range line: "2018-2022 清华大学 计算机科学与技术"
    if (/^\d{4}\s*[-–—]\s*\d{4}\s+(.+)/.test(trimmed) && !info.education) {
      info.education = trimmed;
      // Also try to extract school name (first Chinese segment after date range)
      const schoolMatch = trimmed.match(/^\d{4}\s*[-–—]\s*\d{4}\s+([\u4e00-\u9fa5]+)/);
      if (schoolMatch && !info.school) info.school = schoolMatch[1];
      continue;
    }
  }

  // Apply section-aware extraction results (for resumes with no inline field labels)
  if (!info.school && sectionValueMap['school']) info.school = sectionValueMap['school'];
  if (!info.major && sectionValueMap['major']) info.major = sectionValueMap['major'];
  if (sectionValueMap['workCompany'] && !info.workExperience.length) {
    info.workExperience.push(sectionValueMap['workCompany']);
  }

  return info;
};

export interface ParsedResumeInfo {
  name: string;
  gender: string;
  ageOrBirth: string;
  phone: string;
  email: string;
  location: string;
  education: string;
  highestEducation: string;
  school: string;
  major: string;
  workExperience: string[];
  skills: string[];
  honors: string[];
  expectedSalary: string;
  currentlyEmployed: string;
  availability: string;
  photoBase64: string;
  rawText: string;
}