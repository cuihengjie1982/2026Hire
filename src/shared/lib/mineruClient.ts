// MinerU API client for document parsing
// Docs: https://mineru.net

import {API_BASE_URL, getAuthToken, USE_MOCK_API} from './runtime';
import {fetchJson} from './apiClient';

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
          if (startResult.error) {
            throw new Error(startResult.error.message || 'Parse start failed');
          }

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
          console.log('MinerU proxy failed, falling back to client-side parsing:', proxyErr);
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
          console.log('Proxy returned insufficient content, using client-side parsing');
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
      console.log('Using client-side PDF parsing for:', file.name);
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
export const extractResumeInfoFromMarkdown = (contentMd: string): ParsedResumeInfo => {
  const lines = contentMd.split('\n').filter(l => l.trim());
  let rawText = contentMd;

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

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Name
    if (/^姓名[：:：\s]*(.+)/i.test(trimmed)) {
      info.name = trimmed.replace(/^姓名[：:：\s]*/i, '').trim();
      continue;
    }
    // Gender
    if (/(性别|gender)[：:：\s]*(.+)/i.test(trimmed)) {
      info.gender = (trimmed.match(/(?:性别|gender)[：:：\s]*(.+)/i) || [])[1]?.trim() || '';
      continue;
    }
    // Phone
    if (/^电话[：:：\s]*(.+)/i.test(trimmed)) {
      info.phone = (trimmed.match(/^电话[：:：\s]*(.+)/i) || [])[1]?.trim() || '';
      continue;
    }
    // Email
    if (/^(邮箱|电子邮件|email)[：:：\s]*(.+)/i.test(trimmed)) {
      info.email = (trimmed.match(/^(?:邮箱|电子邮件|email)[：:：\s]*(.+)/i) || [])[1]?.trim() || '';
      continue;
    }
    // Location
    if (/^(居住地|所在地|location)[：:：\s]*(.+)/i.test(trimmed)) {
      info.location = (trimmed.match(/^(?:居住地|所在地|location)[：:：\s]*(.+)/i) || [])[1]?.trim() || '';
      continue;
    }
    // Education/school
    if (/^(毕业院校|学校|教育|education)[：:：\s]*(.+)/i.test(trimmed)) {
      info.school = (trimmed.match(/^(?:毕业院校|学校|教育|education)[：:：\s]*(.+)/i) || [])[1]?.trim() || '';
      continue;
    }
    // Skills
    if (/^(技能|skill|特长、技能)[：:：:、\s]*(.+)/i.test(trimmed)) {
      const skillsStr = (trimmed.match(/^(?:技能|skill|特长)[：:：:、\s]*(.+)/i) || [])[1] || '';
      const skills = skillsStr
        .split(/[、,，]/)
        .map(s => s.trim())
        .filter(s => s.length > 0 && s.length < 30);
      if (skills.length > 0) {
        info.skills = skills;
      }
      continue;
    }
    // Experience sections — collect more lines as experience
    if (/^(工作经历|实习经历|项目经验|项目经历|经历)[：:：]*/i.test(trimmed)) {
      // Skip partial section headers without values — collect content below
      const content = trimmed.replace(/^(?:工作经历|实习经历|项目经验|项目经历|经历)[：:：\s]*/i, '').trim();
      if (content) {
        info.workExperience.push(content);
      }
      continue;
    }
    // Age/birth
    if (/^(年龄|出生|生日|birth)[：:：\s]*(.+)/i.test(trimmed)) {
      info.ageOrBirth = (trimmed.match(/^(?:年龄|出生|生日|birth)[：:：\s]*(.+)/i) || [])[1]?.trim() || '';
      continue;
    }
    // Expected salary
    if (/^(期望薪资|salary|期望)[：:：\s]*(.+)/i.test(trimmed)) {
      info.expectedSalary = (trimmed.match(/^(?:期望薪资|salary|期望)[：:：\s]*(.+)/i) || [])[1]?.trim() || '';
      continue;
    }
    // Current employment
    if (/^(当前状态|在职状态|employment)[：:：\s]*(.+)/i.test(trimmed)) {
      info.currentlyEmployed = (trimmed.match(/^(?:当前状态|在职状态|employment)[：:：\s]*(.+)/i) || [])[1]?.trim() || '';
      continue;
    }
    // Highest education level
    if (/^(最高学历|学历|education_level)[：:：\s]*(.+)/i.test(trimmed)) {
      info.highestEducation = (trimmed.match(/^(?:最高学历|学历|education_level)[：:：\s]*(.+)/i) || [])[1]?.trim() || '';
      continue;
    }
    // Major
    if (/^(专业|major)[：:：\s]*(.+)/i.test(trimmed)) {
      info.major = (trimmed.match(/^(?:专业|major)[：:：\s]*(.+)/i) || [])[1]?.trim() || '';
      continue;
    }
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
