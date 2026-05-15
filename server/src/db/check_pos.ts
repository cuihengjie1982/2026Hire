import { queryOne } from '../config/database.js';

async function check() {
  const positions = await queryOne('SELECT id, name, category FROM positions');
  console.log('Position:', JSON.stringify(positions));
  const detail = await queryOne('SELECT position_id, scoring_rules, grade_rules, ai_prompt FROM position_details WHERE position_id = (SELECT id FROM positions LIMIT 1)');
  console.log('Detail:', JSON.stringify(detail));
  process.exit(0);
}

check();