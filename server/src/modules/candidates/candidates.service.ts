import {queryOne} from '../../config/database.js';
import {autoTriggerForCandidate} from '../agents/agentExecutor.js';

export interface UpsertCandidateInput {
  name: string;
  email?: string | null;
  phone?: string | null;
  location?: string | null;
  source?: string | null;
  projectId?: string | null;
  positionId?: string | null;
  parsed_info?: unknown;
  grade?: string | null;
  score_total?: number | null;
  original_file_base64?: string | null;
  original_file_name?: string | null;
}

export interface UpsertCandidateResult {
  row: Record<string, unknown>;
  duplicate: boolean;
  replaced: boolean;
}

/**
 * Import or update a candidate with deduplication.
 *
 * Deduplication strategy:
 * 1. Match by email first (exact match)
 * 2. Match by name + phone combination
 *
 * If a duplicate is found, the existing record is updated with the latest data.
 * Otherwise, a new record is inserted.
 */
export async function upsertCandidate(input: UpsertCandidateInput): Promise<UpsertCandidateResult> {
  const {name, email, phone, location, source, projectId, positionId, parsed_info, grade, score_total, original_file_base64, original_file_name} = input;

  // Check for duplicate: match by email first, then by name+phone
  let existing: Record<string, unknown> | null = null;
  if (email) {
    existing = await queryOne(
      `SELECT * FROM candidates WHERE email = $1 LIMIT 1`,
      [email],
    );
  }
  if (!existing && phone) {
    existing = await queryOne(
      `SELECT * FROM candidates WHERE name = $1 AND phone = $2 LIMIT 1`,
      [name, phone],
    );
  }

  if (existing) {
    // Duplicate found — update the existing record with latest data
    const updated = await queryOne(
      `UPDATE candidates
       SET name = $1, email = $2, phone = $3, location = $4, source = $5,
           project_id = $6, position_id = $7, parsed_info = $8,
           grade = $9, score_total = $10,
           original_file_base64 = COALESCE($11, original_file_base64),
           original_file_name = COALESCE($12, original_file_name)
       WHERE id = $13
       RETURNING *`,
      [
        name,
        email ?? null,
        phone ?? null,
        location ?? null,
        source ?? null,
        projectId ?? null,
        positionId ?? null,
        parsed_info ? JSON.stringify(parsed_info) : null,
        grade ?? null,
        score_total ?? null,
        original_file_base64 ?? null,
        original_file_name ?? null,
        existing.id,
      ],
    );
    // Fire-and-forget: auto-trigger agents for updated candidate
    autoTriggerForCandidate(String(existing.id), positionId ?? null).catch(() => {});

    return {row: updated!, duplicate: true, replaced: true};
  }

  // No duplicate — insert new
  const row = await queryOne(
    `INSERT INTO candidates (name, email, phone, location, source, project_id, position_id, parsed_info, grade, score_total, original_file_base64, original_file_name)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING *`,
    [
      name,
      email ?? null,
      phone ?? null,
      location ?? null,
      source ?? null,
      projectId ?? null,
      positionId ?? null,
      parsed_info ? JSON.stringify(parsed_info) : null,
      grade ?? null,
      score_total ?? null,
      original_file_base64 ?? null,
      original_file_name ?? null,
    ],
  );

  // Fire-and-forget: auto-trigger agents for new candidate
  autoTriggerForCandidate(String(row!.id), positionId ?? null).catch(() => {});

  return {row: row!, duplicate: false, replaced: false};
}
