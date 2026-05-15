import { query } from '../config/database.js';

async function check() {
  const candidates = await query('SELECT id, name, source, created_at FROM candidates ORDER BY created_at DESC LIMIT 10');
  console.log('Candidates in DB:', JSON.stringify(candidates, null, 2));
  process.exit(0);
}

check();