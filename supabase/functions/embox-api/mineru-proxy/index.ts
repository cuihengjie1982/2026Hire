import { createSupabaseAdmin } from '../_shared/supabaseClient.ts';

function jsonRes(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const MINERU_API_URL = 'https://mineru.net/api/v4/extract/task';

// POST /mineru-proxy/parse — proxy MinerU API call to avoid exposing token in frontend
export const parseFile = async (req: Request, _userId: string, _userRole: string): Promise<Response> => {
  try {
    const supabase = createSupabaseAdmin(req);

    // Resolve MinerU API token from ai_model_configs (look for provider 'mineru')
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

    if (!mineruToken) {
      return jsonRes({ error: { code: 'CONFIG_ERROR', message: 'MinerU API token not configured' } }, 500);
    }

    // Forward the file to MinerU
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) {
      return jsonRes({ error: { code: 'VALIDATION_ERROR', message: 'file is required' } }, 400);
    }

    // Validate file size (max 50MB)
    if (file.size > 50 * 1024 * 1024) {
      return jsonRes({ error: { code: 'VALIDATION_ERROR', message: 'File too large (max 50MB)' } }, 400);
    }

    // Validate file type
    const validTypes = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/bmp', 'image/webp'];
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    const validExts = ['pdf', 'png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp'];
    if (!validTypes.includes(file.type) && !validExts.includes(ext)) {
      return jsonRes({ error: { code: 'VALIDATION_ERROR', message: 'Unsupported file type' } }, 400);
    }

    const mineruForm = new FormData();
    mineruForm.append('files', file);
    mineruForm.append('model_version', 'vlm');

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120000); // 2 min timeout for large files

    const response = await fetch(MINERU_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${mineruToken}`,
      },
      body: mineruForm,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[mineru-proxy] MinerU API error', response.status, errorText.slice(0, 500));
      return jsonRes({ error: { code: 'MINERU_ERROR', message: `MinerU API error ${response.status}: ${errorText.slice(0, 200)}` } }, 502);
    }

    const result = await response.json();
    return jsonRes(result);
  } catch (e) {
    console.error('[mineru-proxy]', e);
    return jsonRes({ error: { code: 'INTERNAL_ERROR', message: 'An internal error occurred' } }, 500);
  }
};
