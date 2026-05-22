import { createSupabaseAdmin } from '../_shared/supabaseClient.ts';
import { sendSms } from '../_shared/smsClient.ts';

function jsonRes(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

// POST /sms-gateway/send — send SMS to a candidate
export const sendSmsHandler = async (req: Request, _userId: string, _userRole: string): Promise<Response> => {
  try {
    const supabase = createSupabaseAdmin(req);
    const body = await req.json() as Record<string, unknown>;
    const candidateId = String(body.candidateId ?? '');
    const templateId = String(body.templateId ?? '');
    const templateParamSet = body.templateParamSet as string[] ?? [];

    if (!candidateId) return jsonRes({ error: { code: 'VALIDATION_ERROR', message: 'candidateId is required' } }, 400);
    if (!templateId) return jsonRes({ error: { code: 'VALIDATION_ERROR', message: 'templateId is required' } }, 400);

    // Look up candidate phone
    const { data: candidate } = await supabase.from('candidates').select('id, name, phone').eq('id', candidateId).single();
    if (!candidate) return jsonRes({ error: { code: 'NOT_FOUND', message: 'Candidate not found' } }, 404);
    const c = candidate as Record<string, unknown>;
    const phone = String(c.phone ?? '');
    if (!phone || phone.length < 11) {
      return jsonRes({ error: { code: 'VALIDATION_ERROR', message: '该候选人未填写有效的手机号码' } }, 400);
    }

    // Look up SMS template
    const { data: templateRow } = await supabase.from('sms_templates').select('*').eq('id', templateId).eq('is_active', true).single();
    if (!templateRow) return jsonRes({ error: { code: 'NOT_FOUND', message: '短信模板不存在或已停用' } }, 404);

    const tpl = templateRow as Record<string, unknown>;
    const tencentTemplateId = String(tpl.template_id ?? '');
    const signName = tpl.sign_name ? String(tpl.sign_name) : undefined;

    // Send SMS
    let smsResult: { result: number; errmsg: string; ext: string; sid?: string };
    let sendSuccess = false;
    let smsStatus = '';
    let providerRef = '';

    try {
      smsResult = await sendSms({
        phoneNumber: phone,
        templateId: tencentTemplateId,
        templateParams: templateParamSet,
        signName,
      });
      sendSuccess = true;
      smsStatus = 'sent';
      providerRef = smsResult.sid ?? '';
    } catch (err) {
      smsStatus = 'failed';
      providerRef = String(err);
    }

    // Render content preview
    const content = String(tpl.content ?? '')
      .replace(/\{(\d+)\}/g, (_m, idx: string) => templateParamSet[parseInt(idx, 10)] ?? '');

    // Create outreach record
    const { data: record } = await supabase.from('outreach_records').insert({
      candidate_id: candidateId,
      candidate_name: String(c.name ?? ''),
      position_id: body.positionId ? String(body.positionId) : null,
      position_name: body.positionName ? String(body.positionName) : null,
      channel: 'sms',
      status: sendSuccess ? 'contacted' : 'failed',
      content,
      sms_provider_ref: providerRef,
      sms_status: smsStatus,
    }).select('*').single();

    if (!sendSuccess) {
      return jsonRes({
        error: { code: 'SMS_ERROR', message: `短信发送失败: ${providerRef}` },
        record,
      }, 200);
    }

    return jsonRes(record, 201);
  } catch {
    return jsonRes({ error: { code: 'INTERNAL_ERROR', message: 'An internal error occurred' } }, 500);
  }
};

// GET /sms-gateway/templates — list active SMS templates
export const listTemplates = async (req: Request, _userId: string, _userRole: string): Promise<Response> => {
  try {
    const supabase = createSupabaseAdmin(req);
    const { data } = await supabase.from('sms_templates').select('*').eq('is_active', true).order('created_at', { ascending: false });
    return jsonRes(data ?? []);
  } catch {
    return jsonRes({ error: { code: 'INTERNAL_ERROR', message: 'An internal error occurred' } }, 500);
  }
};

// POST /sms-gateway/templates — create SMS template (admin only)
export const createTemplate = async (req: Request, _userId: string, _userRole: string): Promise<Response> => {
  try {
    const supabase = createSupabaseAdmin(req);
    const body = await req.json() as Record<string, unknown>;
    const { name, templateId, signName, content, parameters } = body;

    if (!name || !templateId) {
      return jsonRes({ error: { code: 'VALIDATION_ERROR', message: 'name and templateId are required' } }, 400);
    }

    const { data, error } = await supabase.from('sms_templates').insert({
      name: String(name),
      template_id: String(templateId),
      sign_name: signName ? String(signName) : null,
      content: content ? String(content) : null,
      parameters: parameters ?? [],
    }).select('*').single();

    if (error) return jsonRes({ error: { code: 'DB_ERROR', message: error.message } }, 400);
    return jsonRes(data, 201);
  } catch {
    return jsonRes({ error: { code: 'INTERNAL_ERROR', message: 'An internal error occurred' } }, 500);
  }
};
