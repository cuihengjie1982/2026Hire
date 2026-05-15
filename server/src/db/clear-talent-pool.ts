import { query } from '../config/database.js';
import pool from '../config/database.js';

async function clearTalentPool() {
  // Count before
  const rows = await query<{cnt: string}>(
    "SELECT COUNT(*) as cnt FROM candidates WHERE original_file_name IS NOT NULL"
  );
  const count = parseInt(rows[0].cnt, 10);

  if (count === 0) {
    console.log('人才库中没有导入的简历，无需清理。');
    await pool.end();
    process.exit(0);
  }

  console.log(`找到 ${count} 条导入的简历，正在清理...`);

  // Delete dependent records first, then candidates
  // Order: shortlist_entries -> approval_requests -> interview_results -> interview_sessions -> candidate_tags -> candidates
  const importedIds = await query<{id: string}>(
    "SELECT id FROM candidates WHERE original_file_name IS NOT NULL"
  );
  const ids = importedIds.map(r => r.id);

  if (ids.length > 0) {
    // Delete from all dependent tables first (FKs without CASCADE):
    // candidate_tags has ON DELETE CASCADE, so it's auto-cleaned
    await query("DELETE FROM contacts WHERE candidate_id IN (SELECT id FROM candidates WHERE original_file_name IS NOT NULL)");
    await query("DELETE FROM outreach_records WHERE candidate_id IN (SELECT id FROM candidates WHERE original_file_name IS NOT NULL)");
    await query("DELETE FROM shortlist_entries WHERE candidate_id IN (SELECT id FROM candidates WHERE original_file_name IS NOT NULL)");
    await query("DELETE FROM approval_requests WHERE candidate_id IN (SELECT id FROM candidates WHERE original_file_name IS NOT NULL)");
    await query("DELETE FROM interview_results WHERE candidate_id IN (SELECT id FROM candidates WHERE original_file_name IS NOT NULL)");
    await query("DELETE FROM interview_sessions WHERE candidate_id IN (SELECT id FROM candidates WHERE original_file_name IS NOT NULL)");
    // Finally delete the candidates (candidate_tags cascade-deleted automatically)
    await query("DELETE FROM candidates WHERE original_file_name IS NOT NULL");
  }

  console.log(`已删除 ${count} 条简历及其关联数据。人才库已清空。`);

  await pool.end();
  process.exit(0);
}

clearTalentPool().catch((err) => {
  console.error('清理失败:', err);
  process.exit(1);
});
