import { queryOne, query } from '../config/database.js';

async function check() {
  const pos = await queryOne(`
    SELECT p.name, pd.profile, pd.scoring_rules, pd.grade_rules
    FROM positions p
    LEFT JOIN position_details pd ON pd.position_id = p.id
    WHERE p.name = 'MWV-全身动捕演员'
  `);
  console.log('Position:', JSON.stringify(pos, null, 2));

  const cand = await query('SELECT name, score_total, grade FROM candidates ORDER BY created_at DESC LIMIT 3');
  console.log('Candidates:', JSON.stringify(cand, null, 2));

  process.exit(0);
}

check();