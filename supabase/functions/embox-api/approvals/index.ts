import { createSupabaseAdmin } from '../_shared/supabaseClient.ts';

function jsonRes(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

export const handleApprovals = async (req: Request, _userId: string, _userRole: string): Promise<Response> => {
  const supabase = createSupabaseAdmin(req);
  const method = req.method;

  try {
    if (method === 'GET') {
      const url = new URL(req.url);
      const status = url.searchParams.get('status');
      let query = supabase.from('approval_requests').select('*').order('created_at', { ascending: false });
      if (status) query = query.eq('status', status);
      const { data } = await query;
      return jsonRes(data ?? []);
    }

    if (method === 'POST') {
      const body = await req.json() as Record<string, unknown>;

      const insertData: Record<string, unknown> = {
        type: 'interview_result',
        candidate_id: body.candidateId,
        candidate_name: body.candidateName,
        candidate_email: body.candidateEmail,
        position_id: body.positionId,
        position_name: body.positionName,
        interview_score: body.interviewScore,
        interview_grade: body.interviewGrade,
        interview_grade_label: body.interviewGradeLabel,
        interview_date: body.interviewDate,
        interview_duration: body.interviewDuration,
        dimension_scores: body.dimensionScores ? JSON.stringify(body.dimensionScores) : null,
        status: 'pending',
        requester_name: 'AI面试系统',
        reason: null,
      };

      const { data, error } = await supabase.from('approval_requests').insert(insertData).select('*').single();
      if (error) return jsonRes({ error: { code: 'DB_ERROR', message: error.message } }, 500);
      return jsonRes(data, 201);
    }

    return jsonRes({ error: { code: 'METHOD_NOT_ALLOWED', message: `Method ${method} not allowed` } }, 405);
  } catch (e) {
    console.error('[approvals] CRUD:', e);
    return jsonRes({ error: { code: 'INTERNAL_ERROR', message: 'An internal error occurred' } }, 500);
  }
};
