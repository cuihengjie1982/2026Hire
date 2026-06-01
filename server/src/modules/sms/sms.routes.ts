import {Router} from 'express';
import {query, queryOne} from '../../config/database.js';

const router = Router();

// POST /send — send SMS to a candidate
router.post('/send', async (req, res, next) => {
  try {
    const {candidateId, templateId, templateParamSet, positionId, positionName} = req.body;

    if (!candidateId) {
      res.status(400).json({error: {code: 'VALIDATION_ERROR', message: 'candidateId is required'}});
      return;
    }
    if (!templateId) {
      res.status(400).json({error: {code: 'VALIDATION_ERROR', message: 'templateId is required'}});
      return;
    }

    // Look up candidate
    const candidate = await queryOne<Record<string, unknown>>(
      'SELECT id, name, phone FROM candidates WHERE id = $1',
      [candidateId],
    );
    if (!candidate) {
      res.status(404).json({error: {code: 'NOT_FOUND', message: 'Candidate not found'}});
      return;
    }
    const phone = String(candidate.phone ?? '');
    if (!phone || phone.length < 11) {
      res.status(400).json({error: {code: 'VALIDATION_ERROR', message: '该候选人未填写有效的手机号码'}});
      return;
    }

    // Look up SMS template
    const tpl = await queryOne<Record<string, unknown>>(
      'SELECT * FROM sms_templates WHERE id = $1 AND is_active = true',
      [templateId],
    );
    if (!tpl) {
      res.status(404).json({error: {code: 'NOT_FOUND', message: '短信模板不存在或已停用'}});
      return;
    }

    // Render content preview
    const paramSet: string[] = Array.isArray(templateParamSet) ? templateParamSet : [];
    const content = String(tpl.content ?? '')
      .replace(/\{(\d+)\}/g, (_m, idx: string) => paramSet[parseInt(idx, 10)] ?? '');

    // In dev mode, simulate SMS sending (no real SMS provider)
    const smsStatus = 'sent';
    const providerRef = `dev-${Date.now()}`;

    // Create outreach record
    const record = await queryOne<Record<string, unknown>>(
      `INSERT INTO outreach_records (candidate_id, candidate_name, position_id, position_name, channel, status, content, sms_provider_ref, sms_status)
       VALUES ($1, $2, $3, $4, 'sms', 'contacted', $5, $6, $7)
       RETURNING *`,
      [
        candidateId,
        String(candidate.name ?? ''),
        positionId ?? null,
        positionName ?? null,
        content,
        providerRef,
        smsStatus,
      ],
    );

    res.status(201).json(record);
  } catch (e) {
    next(e);
  }
});

// GET /templates — list active SMS templates
router.get('/templates', async (_req, res, next) => {
  try {
    const rows = await query(
      'SELECT * FROM sms_templates WHERE is_active = true ORDER BY created_at DESC',
    );
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

// POST /templates — create SMS template (admin only)
router.post('/templates', async (req, res, next) => {
  try {
    const {name, templateId, signName, content, parameters} = req.body;

    if (!name || !templateId) {
      res.status(400).json({error: {code: 'VALIDATION_ERROR', message: 'name and templateId are required'}});
      return;
    }

    const row = await queryOne<Record<string, unknown>>(
      `INSERT INTO sms_templates (name, template_id, sign_name, content, parameters)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [String(name), String(templateId), signName ?? null, content ?? null, JSON.stringify(parameters ?? [])],
    );

    res.status(201).json(row);
  } catch (e) {
    next(e);
  }
});

export default router;
