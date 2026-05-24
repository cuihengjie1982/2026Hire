import {Router} from 'express';
import {exec} from 'child_process';
import path from 'path';
import fs from 'fs';
import FormData from 'form-data';
import {env} from '../config/env.js';
import {queryOne} from '../config/database.js';
import {callVisionLLM, ContentPart} from '../modules/ai/llmClient.js';
import {buildResumeVisionSystemPrompt, buildResumeVisionUserMessage} from '../modules/ai/promptBuilder.js';

const router = Router();

const SHELL_TIMEOUT_MS = 30_000; // 30s timeout for pdftotext / pdftoppm / tesseract
const MINERU_TIMEOUT_MS = 60_000; // 60s timeout for MinerU API

function extractTextWithTextutil(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    exec(`pdftotext -enc UTF-8 "${filePath}" -`, {maxBuffer: 50 * 1024 * 1024, timeout: SHELL_TIMEOUT_MS}, (error, stdout) => {
      if (error) { reject(error); return; }
      resolve(stdout);
    });
  });
}

async function extractTextWithOCR(filePath: string): Promise<string> {
  const tmpDir = '/tmp/mineru';
  const ocrId = `ocr_${Date.now()}`;
  const imgPrefix = path.join(tmpDir, ocrId);

  // Step 1: Convert PDF pages to PNG images
  await new Promise<void>((resolve, reject) => {
    exec(`pdftoppm -png -r 300 ${JSON.stringify(filePath)} ${JSON.stringify(imgPrefix)}`, {maxBuffer: 50 * 1024 * 1024, timeout: SHELL_TIMEOUT_MS}, (err) => {
      if (err) reject(err); else resolve();
    });
  });

  // Step 2: OCR each image
  let images: string[];
  try {
    images = fs.readdirSync(tmpDir).filter(f => f.startsWith(ocrId) && f.endsWith('.png'));
  } catch {
    console.log('[OCR] tmpDir does not exist, skipping OCR');
    return '';
  }

  let fullText = '';
  for (const img of images) {
    const imgPath = path.join(tmpDir, img);
    const text = await new Promise<string>((resolve, reject) => {
      exec(`tesseract ${JSON.stringify(imgPath)} stdout -l chi_sim+eng`, {maxBuffer: 50 * 1024 * 1024, timeout: SHELL_TIMEOUT_MS}, (err, stdout) => {
        if (err) reject(err); else resolve(stdout);
      });
    });
    fullText += text + '\n';
    try { fs.unlinkSync(imgPath); } catch {}
  }

  return fullText;
}

/**
 * Tier 4: LLM Vision fallback for image-based PDFs.
 * Converts PDF pages to images and sends them to a vision-capable LLM for text extraction.
 */
async function extractTextWithVisionLLM(filePath: string, fileName: string): Promise<string | null> {
  const tmpDir = '/tmp/mineru';
  const imgPrefix = path.join(tmpDir, `vision_${Date.now()}`);

  // Step 1: Convert PDF pages to PNG images (max 5 pages, 150 DPI for LLM)
  try {
    await new Promise<void>((resolve, reject) => {
      exec(
        `pdftoppm -png -r 150 -f 1 -l 5 ${JSON.stringify(filePath)} ${JSON.stringify(imgPrefix)}`,
        {maxBuffer: 50 * 1024 * 1024, timeout: SHELL_TIMEOUT_MS},
        (err) => { if (err) reject(err); else resolve(); },
      );
    });
  } catch {
    console.log('[VisionLLM] pdftoppm image generation failed');
    return null;
  }

  // Step 2: Read images as base64
  let images: string[];
  try {
    images = fs.readdirSync(tmpDir)
      .filter(f => f.startsWith(path.basename(imgPrefix)) && f.endsWith('.png'))
      .sort()
      .slice(0, 5);
  } catch {
    console.log('[VisionLLM] tmpDir does not exist');
    return null;
  }

  if (images.length === 0) {
    console.log('[VisionLLM] No page images generated');
    return null;
  }

  const imageParts: ContentPart[] = [];
  for (const img of images) {
    const imgPath = path.join(tmpDir, img);
    try {
      const data = fs.readFileSync(imgPath).toString('base64');
      imageParts.push({type: 'image', image: {media_type: 'image/png', data}});
    } catch {
      console.log(`[VisionLLM] Failed to read image: ${img}`);
    }
    try { fs.unlinkSync(imgPath); } catch { /* cleanup */ }
  }

  // Step 3: Resolve AI model config from DB
  let row: Record<string, unknown> | null = await queryOne(
    `SELECT * FROM ai_model_configs WHERE is_default = true AND is_active = true LIMIT 1`,
  );
  if (!row) {
    row = await queryOne(
      `SELECT * FROM ai_model_configs WHERE is_active = true ORDER BY created_at DESC LIMIT 1`,
    );
  }
  if (!row) {
    console.log('[VisionLLM] No active AI model config found');
    return null;
  }

  const config = {
    id: row.id as string,
    provider: row.provider as string,
    model_name: row.model_name as string,
    api_key: row.api_key as string,
    base_url: row.base_url as string | null,
    temperature: 0.1,
    max_tokens: 4096,
  };

  // Step 4: Call vision LLM
  const systemPrompt = buildResumeVisionSystemPrompt();
  const userMessage = buildResumeVisionUserMessage(fileName);

  const allParts: ContentPart[] = [
    {type: 'text', text: userMessage},
    ...imageParts,
  ];

  console.log(`[VisionLLM] Sending ${images.length} page(s) to ${config.provider}/${config.model_name}`);
  const text = await callVisionLLM(config, systemPrompt, allParts);
  return text;
}

async function handleFileParse(req: any, res: any) {
  const {fileBase64, fileName} = req.body;
  if (!fileBase64) {
    res.status(400).json({error: 'Missing file data'});
    return;
  }

  try {
    const fileBuffer = Buffer.from(fileBase64, 'base64');
    const tempDir = '/tmp/mineru';
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, {recursive: true});
    const tempFilePath = path.join(tempDir, `mineru_${Date.now()}.pdf`);
    fs.writeFileSync(tempFilePath, fileBuffer);

    // Try textutil first
    try {
      const text = await extractTextWithTextutil(tempFilePath);
      if (text && text.trim().length > 50) {
        try { fs.unlinkSync(tempFilePath); } catch {}
        res.json({success: true, content_md: `# ${fileName}\n\n${text}`, content_list: []});
        return;
      }
      console.log('pdftotext returned insufficient content, trying OCR');
    } catch {
      console.log('pdftotext failed, trying OCR');
    }

    // Try OCR (for image-based / scanned PDFs)
    try {
      const text = await extractTextWithOCR(tempFilePath);
      if (text && text.trim().length > 50) {
        try { fs.unlinkSync(tempFilePath); } catch {}
        res.json({success: true, content_md: `# ${fileName}\n\n${text}`, content_list: []});
        return;
      }
      console.log('OCR returned insufficient content, trying MinerU API');
    } catch (e) {
      console.log('OCR failed, trying MinerU API:', (e as Error).message);
    }

    // Tier 3: MinerU API
    if (env.MINERU_API_TOKEN) {
      try {
        const form = new FormData();
        form.append('files', fs.createReadStream(tempFilePath), fileName || 'resume.pdf');
        form.append('model_version', 'vlm');

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), MINERU_TIMEOUT_MS);
        const response = await fetch(env.MINERU_API_URL, {
          method: 'POST',
          headers: {Authorization: `Bearer ${env.MINERU_API_TOKEN}`, ...form.getHeaders()},
          body: form as any,
          signal: controller.signal,
        });
        clearTimeout(timer);

        if (response.ok) {
          const result = await response.json();
          try { fs.unlinkSync(tempFilePath); } catch {}
          res.json(result);
          return;
        }
        console.log('MinerU API failed, trying LLM Vision');
      } catch (e) {
        console.log('MinerU API error, trying LLM Vision:', (e as Error).message);
      }
    } else {
      console.log('MinerU API token not configured, trying LLM Vision');
    }

    // Tier 4: LLM Vision for image-based PDFs
    try {
      const text = await extractTextWithVisionLLM(tempFilePath, fileName || 'resume.pdf');
      if (text && text.trim().length > 50) {
        try { fs.unlinkSync(tempFilePath); } catch {}
        res.json({success: true, content_md: `# ${fileName}\n\n${text}`, content_list: []});
        return;
      }
      console.log('LLM Vision returned insufficient content');
    } catch (e) {
      console.log('LLM Vision failed:', (e as Error).message);
    }

    try { fs.unlinkSync(tempFilePath); } catch {}
    res.status(500).json({error: 'No PDF parsing method available'});
  } catch (e) {
    res.status(500).json({error: (e as Error).message || 'Unknown error'});
  }
}

router.post('/api/mineru/file_parse', handleFileParse);
router.post('/api/v1/mineru/file_parse', handleFileParse);

export default router;
