import { createSupabaseAdmin } from '../_shared/supabaseClient.ts';

function jsonRes(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

/**
 * MinerU document parsing proxy — async two-phase design.
 *
 * Phase 1: POST /mineru-proxy/parse  → start extraction, return {task_id, api_type}
 * Phase 2: POST /mineru-proxy/poll   → check status, return markdown when done
 *
 * Each Edge Function call is short-lived (one HTTP round-trip to MinerU),
 * avoiding the Supabase 150s worker timeout from long-polling.
 */

// ─── Phase 1: Start extraction ─────────────────────────────────────────────

export const parseFile = async (req: Request, _userId: string, _userRole: string): Promise<Response> => {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) {
      return jsonRes({ error: { code: 'VALIDATION_ERROR', message: 'file is required' } }, 400);
    }

    if (file.size > 50 * 1024 * 1024) {
      return jsonRes({ error: { code: 'VALIDATION_ERROR', message: 'File too large (max 50MB)' } }, 400);
    }

    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    const validExts = ['pdf', 'png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'doc', 'docx'];
    if (!validExts.includes(ext)) {
      return jsonRes({ error: { code: 'VALIDATION_ERROR', message: 'Unsupported file type' } }, 400);
    }

    // Resolve MinerU API token from ai_model_configs
    const supabase = createSupabaseAdmin(req);
    const { data: configRow } = await supabase
      .from('ai_model_configs')
      .select('api_key')
      .eq('provider', 'mineru')
      .eq('is_active', true)
      .limit(1)
      .single();

    const mineruToken = configRow
      ? String((configRow as Record<string, unknown>).api_key)
      : Deno.env.get('MINERU_API_TOKEN') ?? '';

    // Try Precision API first (Token-based, higher limits)
    if (mineruToken) {
      try {
        console.log('[mineru-proxy] Trying Precision API (file-urls/batch)');
        const result = await startPrecisionExtraction(file, mineruToken);
        return jsonRes(result);
      } catch (precisionErr) {
        console.warn('[mineru-proxy] Precision API failed, falling back to Agent API:', precisionErr instanceof Error ? precisionErr.message : precisionErr);
      }
    }

    // Fallback: Agent API (no Token, IP rate-limited, 10MB/20 pages)
    console.log('[mineru-proxy] Using Agent API (file upload)');
    return await startAgentExtraction(file);
  } catch (e) {
    console.error('[mineru-proxy]', e);
    return jsonRes({ error: { code: 'INTERNAL_ERROR', message: 'An internal error occurred' } }, 500);
  }
};

/**
 * Start Precision API extraction — returns batch_id for polling.
 */
async function startPrecisionExtraction(file: File, token: string): Promise<Record<string, unknown>> {
  const batchRes = await fetch('https://mineru.net/api/v4/file-urls/batch', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      files: [{ name: file.name, data_id: `embox-${Date.now()}` }],
      model_version: 'vlm',
      language: 'ch',
    }),
  });

  if (!batchRes.ok) {
    const errText = await batchRes.text();
    throw new Error(`file-urls/batch HTTP ${batchRes.status}: ${errText.slice(0, 300)}`);
  }

  const batchData = await batchRes.json();
  if (batchData.code !== 0) {
    throw new Error(`file-urls/batch code ${batchData.code}: ${batchData.msg}`);
  }

  const batchId = batchData.data.batch_id as string;
  const uploadUrl = batchData.data.file_urls[0] as string;
  console.log(`[mineru-proxy] Precision: batch_id=${batchId}, uploading file...`);

  const uploadRes = await fetch(uploadUrl, {
    method: 'PUT',
    body: await file.arrayBuffer(),
  });
  if (!uploadRes.ok) {
    const errDetail = await uploadRes.text().catch(() => '');
    throw new Error(`File upload failed: HTTP ${uploadRes.status} ${errDetail.slice(0, 200)}`);
  }

  console.log('[mineru-proxy] Precision: file uploaded, ready for polling');
  return {
    status: 'processing',
    api_type: 'precision',
    task_id: batchId,
    message: 'File uploaded. Poll /mineru-proxy/poll for results.',
  };
}

/**
 * Start Agent API extraction — returns task_id for polling.
 */
async function startAgentExtraction(file: File): Promise<Response> {
  const createRes = await fetch('https://mineru.net/api/v1/agent/parse/file', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      file_name: file.name,
      language: 'ch',
      enable_table: true,
      is_ocr: false,
      enable_formula: false,
    }),
  });

  if (!createRes.ok) {
    const errText = await createRes.text();
    return jsonRes({ error: { code: 'MINERU_ERROR', message: `Agent API error ${createRes.status}: ${errText.slice(0, 200)}` } }, 502);
  }

  const createData = await createRes.json();
  if (createData.code !== 0) {
    return jsonRes({ error: { code: 'MINERU_ERROR', message: createData.msg || 'Agent task creation failed' } }, 502);
  }

  const taskId = createData.data.task_id as string;
  const fileUrl = createData.data.file_url as string;
  console.log(`[mineru-proxy] Agent: task_id=${taskId}, uploading file...`);

  const uploadRes = await fetch(fileUrl, {
    method: 'PUT',
    body: await file.arrayBuffer(),
  });
  if (!uploadRes.ok) {
    return jsonRes({ error: { code: 'MINERU_ERROR', message: `File upload failed: HTTP ${uploadRes.status}` } }, 502);
  }

  console.log('[mineru-proxy] Agent: file uploaded, ready for polling');
  return jsonRes({
    status: 'processing',
    api_type: 'agent',
    task_id: taskId,
    message: 'File uploaded. Poll /mineru-proxy/poll for results.',
  });
}

// ─── Phase 2: Poll for results ─────────────────────────────────────────────

export const pollResult = async (req: Request, _userId: string, _userRole: string): Promise<Response> => {
  try {
    const body = await req.json() as Record<string, unknown>;
    const taskId = String(body.task_id ?? '');
    const apiType = String(body.api_type ?? 'agent');

    if (!taskId) {
      return jsonRes({ error: { code: 'VALIDATION_ERROR', message: 'task_id is required' } }, 400);
    }

    if (apiType === 'precision') {
      return await pollPrecision(req, taskId);
    }
    return await pollAgent(taskId);
  } catch (e) {
    console.error('[mineru-proxy] poll error:', e);
    return jsonRes({ error: { code: 'INTERNAL_ERROR', message: 'An internal error occurred' } }, 500);
  }
};

async function pollPrecision(req: Request, batchId: string): Promise<Response> {
  // Resolve token for Precision API auth
  const supabase = createSupabaseAdmin(req);
  const { data: configRow } = await supabase
    .from('ai_model_configs')
    .select('api_key')
    .eq('provider', 'mineru')
    .eq('is_active', true)
    .limit(1)
    .single();

  const token = configRow
    ? String((configRow as Record<string, unknown>).api_key)
    : Deno.env.get('MINERU_API_TOKEN') ?? '';

  if (!token) {
    return jsonRes({ error: { code: 'MINERU_ERROR', message: 'No MinerU token for Precision API poll' } }, 500);
  }

  const pollUrl = `https://mineru.net/api/v4/extract-results/batch/${batchId}`;
  const statusRes = await fetch(pollUrl, { headers: { 'Authorization': `Bearer ${token}` } });
  if (!statusRes.ok) {
    return jsonRes({ error: { code: 'MINERU_ERROR', message: `Poll failed: HTTP ${statusRes.status}` } }, 502);
  }

  const statusData = await statusRes.json();
  const results = statusData.data?.extract_result as Array<Record<string, unknown>> | undefined;

  if (!results || results.length === 0) {
    return jsonRes({ status: 'processing', state: 'pending' });
  }

  const result = results[0];
  const state = result.state as string;

  if (state === 'done' && result.full_zip_url) {
    console.log('[mineru-proxy] Precision: extraction done, downloading zip...');
    try {
      const zipResult = await extractMarkdownFromZip(result.full_zip_url as string);
      return jsonRes({ status: 'done', ...zipResult });
    } catch (zipErr) {
      return jsonRes({ error: { code: 'MINERU_ERROR', message: `ZIP extraction failed: ${zipErr instanceof Error ? zipErr.message : zipErr}` } }, 502);
    }
  }

  if (state === 'failed') {
    return jsonRes({ error: { code: 'MINERU_ERROR', message: `Extraction failed: ${(result.err_msg as string) || 'Unknown error'}` } }, 502);
  }

  const progress = result.extract_progress as Record<string, unknown> | undefined;
  return jsonRes({
    status: 'processing',
    state,
    extracted_pages: progress?.extracted_pages ?? '?',
    total_pages: progress?.total_pages ?? '?',
  });
}

async function pollAgent(taskId: string): Promise<Response> {
  console.log(`[mineru-proxy] Agent poll: task_id=${taskId}`);
  const statusRes = await fetch(`https://mineru.net/api/v1/agent/parse/${taskId}`);
  if (!statusRes.ok) {
    return jsonRes({ error: { code: 'MINERU_ERROR', message: `Poll failed: HTTP ${statusRes.status}` } }, 502);
  }

  const statusData = await statusRes.json();
  const state = statusData.data?.state as string;

  if (state === 'done' && statusData.data.markdown_url) {
    console.log('[mineru-proxy] Agent: extraction done, fetching markdown...');
    const mdRes = await fetch(statusData.data.markdown_url);
    const content_md = await mdRes.text();
    return jsonRes({ status: 'done', content_md, content_list: [] });
  }

  if (state === 'failed') {
    const errMsg = statusData.data?.err_msg || 'Agent extraction failed';
    return jsonRes({ error: { code: 'MINERU_ERROR', message: errMsg } }, 502);
  }

  // Still processing
  return jsonRes({ status: 'processing', state });
}

/**
 * Download the result zip from Precision API and extract full.md + content_list.json.
 * Uses a minimal ZIP parser (ZIP local file headers) instead of a heavy library.
 */
async function extractMarkdownFromZip(zipUrl: string): Promise<{ content_md: string; content_list: unknown[] }> {
  const zipRes = await fetch(zipUrl);
  if (!zipRes.ok) {
    throw new Error(`Failed to download zip: HTTP ${zipRes.status}`);
  }

  const zipBuffer = new Uint8Array(await zipRes.arrayBuffer());

  // Minimal ZIP parsing: find local file headers (signature 0x504b0304)
  const SIG = 0x04034b50;
  let contentMd = '';
  let contentList: unknown[] = [];

  let offset = 0;
  while (offset < zipBuffer.length - 30) {
    const sig = zipBuffer[offset] | (zipBuffer[offset + 1] << 8) | (zipBuffer[offset + 2] << 16) | (zipBuffer[offset + 3] << 24);
    if (sig !== SIG) break;

    const compressionMethod = zipBuffer[offset + 8] | (zipBuffer[offset + 9] << 8);
    const compressedSize = zipBuffer[offset + 18] | (zipBuffer[offset + 19] << 8) | (zipBuffer[offset + 20] << 16) | (zipBuffer[offset + 21] << 24);
    const fileNameLen = zipBuffer[offset + 26] | (zipBuffer[offset + 27] << 8);
    const extraLen = zipBuffer[offset + 28] | (zipBuffer[offset + 29] << 8);

    const fileNameStart = offset + 30;
    const fileName = new TextDecoder().decode(zipBuffer.slice(fileNameStart, fileNameStart + fileNameLen));
    const dataStart = fileNameStart + fileNameLen + extraLen;
    const dataEnd = dataStart + compressedSize;

    if (fileName === 'full.md' || fileName.endsWith('/full.md')) {
      contentMd = await decompressEntry(zipBuffer, dataStart, dataEnd, compressionMethod);
    }

    if (fileName.includes('content_list') && fileName.endsWith('.json')) {
      try {
        const jsonText = await decompressEntry(zipBuffer, dataStart, dataEnd, compressionMethod);
        if (jsonText) {
          const parsed = JSON.parse(jsonText);
          contentList = Array.isArray(parsed) ? parsed : [];
        }
      } catch {
        // Non-critical — content_list is optional
      }
    }

    offset = dataEnd;
    // Skip data descriptor if present (bit 3 of general purpose bit flag)
    const bitFlag = zipBuffer[offset - compressedSize - fileNameLen - extraLen - 30 + 6] | (zipBuffer[offset - compressedSize - fileNameLen - extraLen - 30 + 7] << 8);
    if (bitFlag & 0x08) {
      while (offset < zipBuffer.length - 4) {
        const nextSig = zipBuffer[offset] | (zipBuffer[offset + 1] << 8) | (zipBuffer[offset + 2] << 16) | (zipBuffer[offset + 3] << 24);
        if (nextSig === SIG || nextSig === 0x02014b50 || nextSig === 0x06054b50) break;
        offset++;
      }
    }
  }

  if (!contentMd) {
    throw new Error('full.md not found in MinerU result zip');
  }

  return { content_md: contentMd, content_list: contentList };
}

async function decompressEntry(buf: Uint8Array, start: number, end: number, method: number): Promise<string> {
  if (method === 0) {
    return new TextDecoder().decode(buf.slice(start, end));
  }
  if (method === 8) {
    const deflated = buf.slice(start, end);
    const ds = new DecompressionStream('deflate-raw');
    const writer = ds.writable.getWriter();
    writer.write(deflated);
    writer.close();
    const reader = ds.readable.getReader();
    const chunks: Uint8Array[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    const totalLen = chunks.reduce((s, c) => s + c.length, 0);
    const inflated = new Uint8Array(totalLen);
    let pos = 0;
    for (const chunk of chunks) {
      inflated.set(chunk, pos);
      pos += chunk.length;
    }
    return new TextDecoder().decode(inflated);
  }
  return '';
}
