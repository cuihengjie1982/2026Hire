import { createSupabaseAdmin } from '../_shared/supabaseClient.ts';
import { notifyByRole } from '../notifications/index.ts';

function jsonRes(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

// POST /cross-table-ops/shortlist-interview-invite
export const shortlistInterviewInvite = async (req: Request, _userId: string, _userRole: string): Promise<Response> => {
  try {
    const supabase = createSupabaseAdmin(req);
    const { shortlistEntryId, type, subject, content, candidateEmail } = await req.json() as Record<string, unknown>;
    if (!shortlistEntryId) return jsonRes({ error: { code: 'VALIDATION_ERROR', message: 'shortlistEntryId is required' } }, 400);

    const { data: entry } = await supabase.from('shortlist_entries').select('*').eq('id', String(shortlistEntryId)).single();
    if (!entry) return jsonRes({ error: { code: 'NOT_FOUND', message: `Shortlist entry (${shortlistEntryId}) not found` } }, 404);

    const e = entry as Record<string, unknown>;

    await supabase.from('outreach_records').insert({
      candidate_id: e.candidate_id,
      candidate_name: e.candidate_name,
      candidate_email: candidateEmail ?? null,
      position_id: e.position_id,
      position_name: e.position_name,
      type: (type as string) ?? 'interview_invite',
      subject: subject ?? null,
      content: content ?? null,
      status: 'sent',
    });

    const { data: updated } = await supabase.from('shortlist_entries')
      .update({ next_step: '已发面试邀请' })
      .eq('id', String(shortlistEntryId))
      .select('*').single();

    return jsonRes(updated);
  } catch (e) {
    console.error('[cross-table-ops]', e);
    return jsonRes({ error: { code: 'INTERNAL_ERROR', message: 'An internal error occurred' } }, 500);
  }
};

// POST /cross-table-ops/shortlist-promote
export const shortlistPromote = async (req: Request, _userId: string, _userRole: string): Promise<Response> => {
  try {
    const supabase = createSupabaseAdmin(req);
    const { shortlistEntryId, nextStep } = await req.json() as Record<string, unknown>;
    if (!shortlistEntryId || !nextStep) return jsonRes({ error: { code: 'VALIDATION_ERROR', message: 'shortlistEntryId and nextStep are required' } }, 400);

    const { data } = await supabase.from('shortlist_entries')
      .update({ next_step: String(nextStep) })
      .eq('id', String(shortlistEntryId))
      .select('*').single();

    if (!data) return jsonRes({ error: { code: 'NOT_FOUND', message: `Shortlist entry (${shortlistEntryId}) not found` } }, 404);
    return jsonRes(data);
  } catch (e) {
    console.error('[cross-table-ops]', e);
    return jsonRes({ error: { code: 'INTERNAL_ERROR', message: 'An internal error occurred' } }, 500);
  }
};

// POST /cross-table-ops/approval-decide
export const approvalDecide = async (req: Request, userId: string, _userRole: string): Promise<Response> => {
  try {
    const supabase = createSupabaseAdmin(req);
    const { approvalId, status, comment, approverName } = await req.json() as Record<string, unknown>;
    if (!approvalId || !status || !['approved', 'rejected'].includes(String(status))) {
      return jsonRes({ error: { code: 'VALIDATION_ERROR', message: 'approvalId and status (approved/rejected) are required' } }, 400);
    }

    // Validate UUID format
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(approvalId))) {
      return jsonRes({ error: { code: 'VALIDATION_ERROR', message: 'Invalid approval ID format' } }, 400);
    }

    const { data } = await supabase.from('approval_requests')
      .update({
        status: String(status),
        decided_at: new Date().toISOString(),
        decided_comment: comment ?? null,
        approver_name: approverName ?? null,
      })
      .eq('id', String(approvalId))
      .eq('status', 'pending')
      .select('*').single();

    if (!data) return jsonRes({ error: { code: 'NOT_FOUND', message: `Approval (${approvalId}) not found or not pending` } }, 404);

    // Notify recruiters about the decision
    const d = data as Record<string, unknown>;
    const statusLabel = String(status) === 'approved' ? '通过' : '拒绝';
    await notifyByRole(supabase, 'recruiter', 'approval',
      `审批结果：${d.candidate_name ?? '候选人'} ${statusLabel}`,
      `${d.position_name ? `「${d.position_name}」` : ''}${d.candidate_name} 的审批已${statusLabel}`,
      `/approvals`,
    ).catch(() => {});

    return jsonRes(data);
  } catch (e) {
    console.error('[cross-table-ops]', e);
    return jsonRes({ error: { code: 'INTERNAL_ERROR', message: 'An internal error occurred' } }, 500);
  }
};

// POST /cross-table-ops/hire-candidate
export const hireCandidate = async (req: Request, _userId: string, _userRole: string): Promise<Response> => {
  try {
    const supabase = createSupabaseAdmin(req);
    const { approvalId } = await req.json() as Record<string, unknown>;
    if (!approvalId) return jsonRes({ error: { code: 'VALIDATION_ERROR', message: 'approvalId is required' } }, 400);

    // Update approval status to 'hired'
    const { data: approval } = await supabase.from('approval_requests')
      .update({ status: 'hired' })
      .eq('id', String(approvalId))
      .eq('status', 'approved')
      .select('*')
      .single();

    if (!approval) return jsonRes({ error: { code: 'NOT_FOUND', message: `Approval (${approvalId}) not found or not approved` } }, 404);

    const a = approval as Record<string, unknown>;
    const candidateId = String(a.candidate_id ?? '');

    // Update matching contacts to 'hired'
    if (candidateId) {
      await supabase.from('contacts')
        .update({ status: 'hired', updated_at: new Date().toISOString() })
        .eq('candidate_id', candidateId);
    }

    // Update matching shortlist entries to '已录用'
    if (candidateId) {
      await supabase.from('shortlist_entries')
        .update({ next_step: '已录用' })
        .eq('candidate_id', candidateId);
    }

    return jsonRes(approval);
  } catch (e) {
    console.error('[cross-table-ops]', e);
    return jsonRes({ error: { code: 'INTERNAL_ERROR', message: 'An internal error occurred' } }, 500);
  }
};
