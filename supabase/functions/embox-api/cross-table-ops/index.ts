import { createSupabaseAdmin } from '../_shared/supabaseClient.ts';
import { notifyByRole } from '../notifications/index.ts';

function jsonRes(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

// POST /cross-table-ops/shortlist-interview-invite
export const shortlistInterviewInvite = async (req: Request, _userId: string, _userRole: string): Promise<Response> => {
  try {
    const supabase = createSupabaseAdmin(req);
    const { shortlistEntryId, type, subject, content, candidateEmail, templateId } = await req.json() as Record<string, unknown>;
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

    // Auto-create interview session when candidate and position are available
    let sessionCreated: Record<string, unknown> | null = null;
    const candidateId = e.candidate_id ? String(e.candidate_id) : null;
    const positionId = e.position_id ? String(e.position_id) : null;

    if (candidateId && positionId) {
      // Use specified template or auto-select the most recent active template for this position
      let resolvedTemplateId = templateId ? String(templateId) : null;
      if (!resolvedTemplateId) {
        const { data: tpl } = await supabase.from('interview_templates')
          .select('id')
          .eq('position_id', positionId)
          .eq('status', 'active')
          .eq('interview_mode', 'text_chat_conversational')
          .order('created_at', { ascending: false })
          .limit(1)
          .single();
        resolvedTemplateId = tpl ? String((tpl as Record<string, unknown>).id) : null;
      }
      // Fall back to any active template for this position
      if (!resolvedTemplateId) {
        const { data: tpl } = await supabase.from('interview_templates')
          .select('id')
          .eq('position_id', positionId)
          .eq('status', 'active')
          .order('created_at', { ascending: false })
          .limit(1)
          .single();
        resolvedTemplateId = tpl ? String((tpl as Record<string, unknown>).id) : null;
      }

      if (resolvedTemplateId) {
        const accessToken = crypto.randomUUID();
        const { data: session } = await supabase.from('interview_sessions').insert({
          candidate_id: candidateId,
          template_id: resolvedTemplateId,
          status: 'created',
          access_token: accessToken,
        }).select('*').single();

        if (session) {
          sessionCreated = {
            sessionId: (session as Record<string, unknown>).id,
            accessToken,
            interviewUrl: `/interview/${accessToken}`,
          };
        }
      }
    }

    return jsonRes({ ...updated, interviewSession: sessionCreated });
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

    // Create employee profile if not already exists (closes Approval→Hire loop)
    if (candidateId) {
      const { data: existingEmp } = await supabase.from('employee_profiles')
        .select('id').eq('candidate_id', candidateId).maybeSingle();
      if (!existingEmp) {
        // Fetch full candidate details
        const { data: candidate } = await supabase.from('candidates')
          .select('*').eq('id', candidateId).single();
        const c = candidate as Record<string, unknown> | null;
        await supabase.from('employee_profiles').insert({
          candidate_id: candidateId,
          name: String(c?.name ?? a.candidate_name ?? ''),
          email: c?.email ?? a.candidate_email ?? null,
          phone: c?.phone ?? null,
          status: 'onboarding',
          hire_date: new Date().toISOString().slice(0, 10),
          position_id: a.position_id ?? null,
          project_id: a.project_id ?? null,
          interview_score: a.interview_score != null ? Number(a.interview_score) : null,
          interview_grade: a.interview_grade ?? null,
        });
      }
    }

    return jsonRes(approval);
  } catch (e) {
    console.error('[cross-table-ops]', e);
    return jsonRes({ error: { code: 'INTERNAL_ERROR', message: 'An internal error occurred' } }, 500);
  }
};
