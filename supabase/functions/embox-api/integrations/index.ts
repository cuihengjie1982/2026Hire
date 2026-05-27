import { createSupabaseAdmin } from '../_shared/supabaseClient.ts';

function jsonRes(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

export const handleIntegrations = async (req: Request, _userId: string, _userRole: string): Promise<Response> => {
  const supabase = createSupabaseAdmin(req);
  const method = req.method;

  try {
    if (method === 'GET') {
      const { data, error } = await supabase.from('integrations_overview').select('*').single();
      if (error) return jsonRes({ error: { code: 'DB_ERROR', message: error.message } }, 500);
      return jsonRes(data ?? {});
    }

    return jsonRes({ error: { code: 'METHOD_NOT_ALLOWED', message: `Method ${method} not allowed` } }, 405);
  } catch (e) {
    console.error('[integrations]', e);
    return jsonRes({ error: { code: 'INTERNAL_ERROR', message: 'An internal error occurred' } }, 500);
  }
};
