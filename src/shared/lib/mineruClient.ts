// MinerU API client for document parsing
// Docs: https://mineru.net

import {API_BASE_URL, AUTH_TOKEN_KEY} from './runtime';
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

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), isImage ? 60000 : 30000); // longer for direct API call

    try {
      // Use server-side proxy in production to avoid exposing MinerU token in browser
      // Falls back to direct MinerU API call only if proxy is unavailable
      const isProduction = API_BASE_URL.includes('supabase.co');

      if (isProduction) {
        // Server-side proxy: token stays on the server
        const proxyFormData = new FormData();
        proxyFormData.append('file', file);

        const token = localStorage.getItem(AUTH_TOKEN_KEY);
        const response = await fetch(`${API_BASE_URL}/functions/v1/mineru-proxy/parse`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
          },
          body: proxyFormData,
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
        }
        // Proxy failed, fall through to client-side parsing
        console.log('MinerU proxy failed, using client-side parsing');
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

    // For Word docs that couldn't be parsed by textutil
    return {success: false, error: 'Document parsing failed'};
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to parse document',
    };
  }
};

/**
 * Render the first page of a PDF as a data URL image.
 * Uses pdfjs-dist (bundled with pdf-parse) for rendering.
 */
const extractPdfFirstPageImage = async (arrayBuffer: ArrayBuffer): Promise<string> => {
  // Dynamic import of pdfjs-dist from the pdf-parse bundle
  const pdfjsLib = await import('pdfjs-dist');
  const pdf = await pdfjsLib.getDocument({data: arrayBuffer}).promise;
  const page = await pdf.getPage(1);
  const viewport = page.getViewport({scale: 0.5}); // half resolution for thumbnail

  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas context not available');

  await page.render({canvas, viewport}).promise;
  const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
  canvas.remove();
  return dataUrl;
};

export interface ParsedResumeInfo {
  name: string;
  email: string;
  phone: string;
  location: string;
  education: string;
  workExperience: string[];
  skills: string[];
  expectedSalary: string;
  currentlyEmployed: string;
  photoBase64: string;
  gender: string;
  ageOrBirth: string;
  highestEducation: string;
  school: string;
  major: string;
  educationTime: string;
  honors: string[];
  availability: string;
  rawText: string;
}

export const extractResumeInfoFromMarkdown = (
  markdown: string,
  externalPhotoBase64?: string,
): ParsedResumeInfo => {
  // Pre-clean: remove binary garbage lines (short alphanumeric gibberish)
  const rawLines = markdown.split('\n').filter((line) => {
    const t = line.trim();
    if (!t) return false;
    // Remove short lines that are pure alphanumeric gibberish (2-6 chars, mixed case/digits)
    if (t.length <= 6 && /^[a-zA-Z0-9_~+\-=]+$/.test(t) && /[a-z]/.test(t) && /[A-Z0-9]/.test(t)) return false;
    // Remove longer base64-like fragments
    if (t.length >= 8 && t.length <= 50 && /^[a-zA-Z0-9+/=_~\-]+$/.test(t) && !/[@.]/.test(t)) return false;
    return true;
  });
  const lines = rawLines;
  const fullText = lines.join('\n');

  // Extract email with regex
  const emailMatch = fullText.match(/[\w.-]+@[\w.-]+\.\w+/);
  const email = emailMatch ? emailMatch[0] : '';

  // Extract phone with regex (various formats)
  const phoneMatch = fullText.match(
    /(?:\+?86)?[-.\s\t]?1[3-9]\d[-.\s\t]?\d{4}[-.\s\t]?\d{4}/,
  );
  const phone = phoneMatch ? phoneMatch[0].replace(/[^\d+]/g, '') : '';

  // Extract name - look for patterns like "姓名：范妙苑" or "姓名 范妙苑"
  let name = '';

  // Section headers and common non-name words to skip
  const skipWords = ['基本信息', '教育背景', '姓名', '个人简历', '工作经历', '简历', '个人信息',
    '求职意向', '自我评价', '项目经验', '实习经历', '校园经历', '技能特长', '语言能力',
    '职业技能', '联系方式', '出生年月', '政治面貌', '婚姻状况', '籍贯',
    '个人优势', '专业技能', '工作内容', '业绩', '内容', '荣誉', '证书', '项目',
    '华夏航遥', '数据采集', '数据标注', '新媒体', '机器人'];

  // Skip if it looks like a company name (contains company suffixes)
  const isCompanyName = (s: string) => /(?:公司|集团|科技|有限|股份|研究院|事务所)/.test(s);

  // First, try to find name from labeled fields
  const namePatterns = [
    /姓名[：:\s]+([^\s\n，,。.]{2,10})/,   // 姓名：张三
    /名字[：:\s]+([^\s\n，,。.]{2,10})/,   // 名字：李四
    /候选人[：:\s]+([^\s\n，,。.]{2,10})/,  // 候选人：王五
    /姓\s*名[：:\s]+([^\s\n，,。.]{2,10})/, // 姓 名：张三 (with space)
  ];
  for (const pattern of namePatterns) {
    const match = fullText.match(pattern);
    if (match && match[1] && match[1].length >= 2 && match[1].length <= 10) {
      const candidate = match[1].trim();
      if (!skipWords.includes(candidate) && !/^[\d]+$/.test(candidate) && !isCompanyName(candidate)) {
        name = candidate;
        break;
      }
    }
  }

  // Pipe-separated name near top of resume
  // Match cases like: "蔡洋 | 女 | 22岁" or "蔡洋 | 22岁" or "蔡洋｜男｜22岁"
  if (!name) {
    const topLines = lines.slice(0, 15).join('\n');
    // Try pipe format: Chinese name followed by separator, then gender OR age OR both
    const pipeMatch = topLines.match(/^\s*([\u4e00-\u9fa5]{2,4})\s*[|｜\t]/m);
    if (pipeMatch && pipeMatch[1] && !isCompanyName(pipeMatch[1]) && !skipWords.includes(pipeMatch[1])) {
      name = pipeMatch[1].trim();
    }
  }

  // Check for "张三" style name at start of first non-empty line (after optional whitespace + punctuation)
  if (!name && lines.length > 0) {
    for (const line of lines.slice(0, 5)) {
      const trimmed = line.trim();
      // Skip section headers, short lines, lines with colons (labeled fields)
      if (trimmed.length < 3 || trimmed.includes('：') || trimmed.includes(':')) continue;
      const firstChar = trimmed.charAt(0);
      // Chinese names at start of line (2-4 chars, no numbers, not skip words)
      if (/^[\u4e00-\u9fa5]{2,4}$/.test(trimmed) && !skipWords.includes(trimmed) && !isCompanyName(trimmed)) {
        name = trimmed;
        break;
      }
    }
  }

  // Try extracting name from the heading line (generated from filename)
  // Format: "# 机器人数采操作员_双休_五险一金_深圳6-7K蔡洋3年_1766997125428.pdf"
  if (!name) {
    const headingMatch = fullText.match(/^#\s+(.+\.pdf)/m);
    if (headingMatch) {
      const filename = headingMatch[1];
      // Look for a Chinese name (2-3 chars) surrounded by non-Chinese chars or delimiters
      const nameFromFile = filename.match(/(?:\d[Kk万亿年]|[_.\-]|期望|深圳|北京|上海|广州|成都|武汉|杭州|南京)([\u4e00-\u9fa5]{2,3})(?:\d|[_.\-]|年|岁|经验|工作|期望|$)/);
      if (nameFromFile && !skipWords.includes(nameFromFile[1])) {
        name = nameFromFile[1];
      }
      // Fallback: last 2-3 Chinese char segment before a digit or delimiter
      if (!name) {
        const segments = filename.split(/[_\-.]/);
        for (const seg of segments) {
          const cn = seg.match(/^([\u4e00-\u9fa5]{2,4})$/);
          if (cn && !skipWords.includes(cn[1])) {
            name = cn[1];
          }
        }
      }
    }
  }

  // Fallback: look for first standalone 2-4 Chinese char line after heading
  if (!name) {
    const afterHeading = fullText.replace(/^#\s+.*\n+/m, '');
    const nameLines = afterHeading.split('\n').filter(l => {
      const t = l.trim();
      return t.length >= 2 && t.length <= 6 && /^[\u4e00-\u9fa5]{2,4}$/.test(t) && !skipWords.includes(t);
    });
    if (nameLines.length > 0) {
      name = nameLines[0].trim();
    }
  }

  // Last resort: extract name from a line that looks like "姓名  某某" at the very beginning
  if (!name) {
    const firstLineWithSpaces = lines.find(l => /^[^\u4e00-\u9fa5]*[\u4e00-\u9fa5]{2,4}[^\u4e00-\u9fa5]*$/.test(l.trim()));
    if (firstLineWithSpaces) {
      const cnMatch = firstLineWithSpaces.trim().match(/^[\u4e00-\u9fa5]{2,4}/);
      if (cnMatch && !skipWords.includes(cnMatch[0]) && !isCompanyName(cnMatch[0])) {
        name = cnMatch[0];
      }
    }
  }

  // Extract skills - look for bullet points or comma-separated items
  const skills: string[] = [];
  // Look for lines containing skills keywords or bullet points
  for (const line of lines) {
    // Skip if too long or contains special characters
    if (line.length > 100 || line.includes('@') || line.includes('：')) continue;

    // Extract bullet points (1. xxx, 2. xxx, or just lines with short items)
    if (line.match(/^\d+[.、]/)) {
      const items = line.split(/\d+[.、]/).filter(s => s.trim().length > 1 && s.trim().length < 30);
      skills.push(...items.map(s => s.trim()));
    }
  }

  // Look for explicit skills section
  const skillsMatch = fullText.match(/(?:职业技能证书|技能特⻓)[:\s]*([\s\S]*?)(?=语言|$)/i);
  if (skillsMatch) {
    const skillsText = skillsMatch[1];
    const items = skillsText.split(/[,，、\n]/).filter(s => s.trim().length > 1 && s.trim().length < 50);
    skills.push(...items.map(s => s.trim()).filter(Boolean));
  }

  // Extract work experience - look for date ranges with descriptions
  const workExperience: string[] = [];
  // Match: 2025.09-2025.12, 2024.09-2025.03, 2024.09-至今, 2025.09 ~ 至今
  const expPattern = /(\d{4})[.\-](\d{2})\s*[—~～\-至]+\s*(?:(\d{4})[.\-](\d{2})|(至今|现在|present))/g;
  let match;
  while ((match = expPattern.exec(fullText)) !== null) {
    const [, startYear, startMon, endYear, endMon, present] = match;
    const start = `${startYear}-${startMon}`;
    const end = present ? '至今' : (endYear && endMon ? `${endYear}-${endMon}` : '');
    if (!end) continue;
    // Grab text after the date range on the same line or next few lines
    const afterIdx = match.index + match[0].length;
    const afterText = fullText.substring(afterIdx, afterIdx + 300);
    // Get the company/role from the remaining text on the same line and next lines
    const afterLines = afterText.split('\n').filter(l => l.trim().length > 0);
    const companyLine = afterLines[0] || '';
    const companyClean = companyLine.replace(/^[.\s——\-]+/, '').trim();
    const descLines = afterLines.slice(1).filter(l => l.trim().length > 10).slice(0, 2);
    const desc = descLines.length > 0 ? '\n' + descLines.join(' ') : '';
    workExperience.push(`${start} ~ ${end} ${companyClean}${desc}`);
  }

  // Extract education - look for date range + school + major in various formats
  // Format: "2020-2024 某某大学 某某专业" or "2020.09-2024.06 学校 专业"
  let education = '';
  const eduPatterns = [
    /(\d{4}[.\-]\d{2}\s*[-—~至]\s*\d{4}[.\-]\d{2})\s+([^\t\n,，]{2,15})\s+([^\t\n,，]{2,15})/,
    /(\d{4}-\d{4})\s+([^\t\n,，]{2,15}(?:大学|学院|学校))\s+([^\t\n,，]{2,15})/,
    /([^\t\n]{2,20}(?:大学|学院|学校))\s+([^\t\n,，]{2,10}(?:专业|学))/,
  ];
  for (const pattern of eduPatterns) {
    const m = fullText.match(pattern);
    if (m) {
      education = `${m[1]} ${m[2]} ${m[3]}`;
      break;
    }
  }

  // Extract location - try various patterns
  let location = '';
  const locationPatterns = [
    /(?:期望城市|期望地点|现居城市|地点|地址|现居|所在城市)[：:\s]*([^\t\n,，]{2,20})/,
    /([^\t\n]{2,8}?(?:市|区|县|省))[^\t\n]*/,
  ];
  for (const pattern of locationPatterns) {
    const locMatch = fullText.match(pattern);
    if (locMatch && locMatch[1]) {
      location = locMatch[1].trim();
      break;
    }
  }

  // Extract expected salary
  let expectedSalary = '';
  const salaryPatterns = [
    /(?:期望薪[资酬]|薪资要求|薪酬要求|期望月薪|期望年薪|期望薪资)[：:\s]*([^\t\n,，]{2,30})/,
    /(?:月薪|年薪|薪资)[：:\s]*([^\t\n,，]{2,30})/,
    /(\d{1,5}[kK]?\s*[-~—至]\s*\d{1,5}[kK]?)/,  // 15K-20K or 8000-12000
    /(\d+[,.]?\d*\s*[-~—至]\s*\d+[,.]?\d*\s*(?:元|万|k|K)(?:\/[月年])?)/, // 8000-12000元/月
  ];
  for (const pattern of salaryPatterns) {
    const salaryMatch = fullText.match(pattern);
    if (salaryMatch && salaryMatch[1]) {
      const val = salaryMatch[1].trim();
      // Skip false positives that look like dates (e.g. "09-2025")
      if (/^\d{2}-\d{4}$/.test(val)) continue;
      expectedSalary = val;
      break;
    }
  }

  // Determine employment status from most recent work experience
  let currentlyEmployed = determineEmploymentStatus(workExperience);
  // Also check text patterns like "在职" or "离职" in the resume
  if (!currentlyEmployed) {
    if (/在职[找求]/.test(fullText) || /目前.*在职/.test(fullText)) {
      currentlyEmployed = '在职';
    } else if (/离职|待业/.test(fullText)) {
      currentlyEmployed = '离职';
    }
  }

  // Extract availability / 到岗时间
  let availability = '';
  const availabilityPatterns = [
    /(?:到岗时间|可到岗|入职时间|可入职|期望到岗)[：:\s]*([^\n,，]{2,20})/,
    /(随时到岗|立即到岗|即时到岗)/,
    /(一周内到岗|1周内到岗|两周内到岗|2周内到岗|一个月内到岗|1个月内到岗)/,
    /(目前[在职]*.*?可?\s*(\d{4}-\d{2}-\d{2}))/,
  ];
  for (const pattern of availabilityPatterns) {
    const am = fullText.match(pattern);
    if (am) {
      availability = (am[1] || am[0]).trim();
      break;
    }
  }

  // Extract gender
  let gender = '';
  const genderPatterns = [
    /性别[：:\s]*(男|女)/,
    /\b(男|女)\s*[|｜\s]*\d{1,3}\s*岁/,
    /\b(男|女)\b/,
  ];
  for (const pattern of genderPatterns) {
    const gm = fullText.match(pattern);
    if (gm) {
      gender = gm[1] || gm[0].charAt(0);
      break;
    }
  }

  // Extract age or birth year
  let ageOrBirth = '';
  const agePatterns = [
    /年龄[：:\s]*(\d{1,2})\s*(?:岁)?/,
    /(\d{1,2})\s*岁/,                           // standalone "23岁"
    /(\d{4})\s*年(?:\s*出生)?/,
    /出生[：:\s]*(\d{4})/,
    /出生年月[：:\s]*(\d{4})/,
  ];
  for (const pattern of agePatterns) {
    const am = fullText.match(pattern);
    if (am) {
      ageOrBirth = am[1];
      break;
    }
  }
  // If we have birth year, show age
  if (ageOrBirth.length === 4) {
    const currentYear = new Date().getFullYear();
    const age = currentYear - parseInt(ageOrBirth, 10);
    ageOrBirth = `${age}岁`;
  } else if (ageOrBirth && !ageOrBirth.includes('岁')) {
    ageOrBirth = `${ageOrBirth}岁`;
  }

  // Extract highest education level
  let highestEducation = '';
  const eduLevelPatterns = [
    /(?:最高学历|学历)[：:\s]*(博士|硕士|本科|大专|中专|高中|初中)/,
    /(博士|硕士|本科|大专|中专|高中|初中)/,
  ];
  for (const pattern of eduLevelPatterns) {
    const em = fullText.match(pattern);
    if (em && em[1]) {
      highestEducation = em[1].trim();
      break;
    }
  }

  // Extract school name from education string
  let school = '';
  const schoolPatterns = [
    /(?:毕业院校|学校|学院)[：:\s]*([^\t\n,，]{3,20})/,
    /(?:大学|学院|学校)\s+([^\t\n,，]{2,10})\s+(?:专业|学历)/,
    /([^\t\n,，]{2,10}(?:大学|学院|学校))/,
  ];
  for (const pattern of schoolPatterns) {
    const sm = fullText.match(pattern);
    if (sm && sm[1]) {
      school = sm[1].trim();
      break;
    }
  }
  // If no explicit school found but education has a school-like name, extract it
  if (!school && education) {
    const schoolMatch = education.match(/([^\s\d]{2,10}(?:大学|学院|学校))/);
    if (schoolMatch) school = schoolMatch[1].trim();
  }

  // Extract major (专业)
  let major = '';
  const majorPatterns = [
    /(?:专业|所学专业|主修专业)[：:\s]*([^\t\n,，]{2,20})/,
    /(?:^|\s)([^\t\n,，]{2,12}专业)\s/,
    /([\u4e00-\u9fa5]{2,10}专业)\s/,
  ];
  for (const pattern of majorPatterns) {
    const mm = fullText.match(pattern);
    if (mm && mm[1]) {
      major = mm[1].trim();
      break;
    }
  }
  // Broad fallback: look for "XXX专业" near school/education context
  if (!major) {
    const broadMajor = fullText.match(/([\u4e00-\u9fa5]{2,10}专业)/);
    if (broadMajor && broadMajor[1]) {
      major = broadMajor[1].replace(/专业$/, '').trim();
    }
  }

  // Extract education time (教育时间) — look for date ranges in education section
  let educationTime = '';
  const eduTimePatterns = [
    /(?:教育时间|就读时间|在校时间)[：:\s]*([^\n]{2,30})/,
  ];
  for (const pattern of eduTimePatterns) {
    const etm = fullText.match(pattern);
    if (etm && etm[1]) {
      educationTime = etm[1].trim();
      break;
    }
  }
  // If no explicit label, look for date range near education section
  if (!educationTime) {
    // Find education section and extract date range
    const eduSection = fullText.match(/(?:教育背景|教育经历|教育信息|学历背景)[：:\s]*([\s\S]*?)(?=(?:工作经历|实习经历|项目经验|技能|自我评价|语言|求职意向|$))/i);
    if (eduSection) {
      const eduText = eduSection[1];
      const dateRangeMatch = eduText.match(/(\d{4})[.\-\/年](\d{1,2})[.\-\/月]?\s*[—~～\-至]+\s*(\d{4})[.\-\/年](\d{1,2})[.\-\/月]?/);
      if (dateRangeMatch) {
        educationTime = `${dateRangeMatch[1]}.${dateRangeMatch[2]} - ${dateRangeMatch[3]}.${dateRangeMatch[4]}`;
      }
    }
  }
  // Fallback: first education-like date range in the whole text
  if (!educationTime && education) {
    const dateInEdu = education.match(/(\d{4})[.\-\/年](\d{1,2})[.\-\/月]?\s*[—~～\-至]+\s*(\d{4})[.\-\/年](\d{1,2})[.\-\/月]?/);
    if (dateInEdu) {
      educationTime = `${dateInEdu[1]}.${dateInEdu[2]} - ${dateInEdu[3]}.${dateInEdu[4]}`;
    }
  }

  // Extract honors / certificates
  const honors: string[] = [];
  const honorSectionRegex = /(?:荣誉证书|所获荣誉|获奖情况|证书)[：:\s]*([\s\S]*?)(?=\n\s*(?:语言|技能|自我评价|工作经历|教育背景|求职意向|$))/i;
  const honorMatch = fullText.match(honorSectionRegex);
  if (honorMatch) {
    const honorText = honorMatch[1];
    const items = honorText.split(/[,，、\n]/).filter(s => s.trim().length > 1 && s.trim().length < 60);
    honors.push(...items.map(s => s.trim()).filter(Boolean));
  }
  // Also look for individual certificate lines
  const certRegex = /(?:证书|资格证)[：:\s]*([^\n,，]{2,30})/g;
  let certMatch;
  while ((certMatch = certRegex.exec(fullText)) !== null) {
    honors.push(certMatch[1].trim());
  }

  // Photo - use externally provided photo (from MinerU OCR or image file)
  const photoBase64 = externalPhotoBase64 || '';

  return {
    name,
    email,
    phone,
    location,
    education,
    workExperience,
    skills: [...new Set(skills)].slice(0, 10),
    expectedSalary,
    currentlyEmployed,
    photoBase64,
    gender,
    ageOrBirth,
    highestEducation,
    school,
    major,
    educationTime,
    honors: [...new Set(honors)].slice(0, 8),
    availability,
    rawText: markdown,
  };
};

/**
 * Determine employment status from work experience data.
 * Checks the most recent job's end date:
 * - "至今" / "现在" → 在职
 * - End date within 1 month → 刚离职
 * - End date > 1 month ago → 离职
 * - No work experience → ""
 */
const determineEmploymentStatus = (workExperience: string[]): string => {
  if (workExperience.length === 0) return '';

  // First entry is the most recent
  const latest = workExperience[0];

  // Check if currently employed (end date is "至今" or "present")
  if (/至今|现在|present|current|至今[^\n]*$/i.test(latest)) {
    return '在职';
  }

  // Try to parse end date from format: YYYY-MM 〜 YYYY-MM Company
  const endDateMatch = latest.match(/(\d{4})-(\d{2})\s*(?:〜|~|-)\s*(?:至今|现在|(\d{4})-(\d{2}))/);
  if (endDateMatch) {
    const endYear = endDateMatch[3] ? parseInt(endDateMatch[3], 10) : 0;
    const endMonth = endDateMatch[4] ? parseInt(endDateMatch[4], 10) : 0;
    if (endYear > 0 && endMonth > 0) {
      const now = new Date();
      const endDate = new Date(endYear, endMonth - 1);
      const diffMonths = (now.getFullYear() - endYear) * 12 + (now.getMonth() - endMonth + 1);
      if (diffMonths <= 1) return '刚离职';
      return '离职';
    }
  }

  return '';
};