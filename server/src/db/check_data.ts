import { query } from '../config/database.js';

async function check() {
  const projects = await query('SELECT id, name, created_at FROM projects ORDER BY created_at DESC LIMIT 10');
  const positions = await query('SELECT id, name, created_at FROM positions ORDER BY created_at DESC LIMIT 10');
  const candidates = await query('SELECT id, name, created_at FROM candidates ORDER BY created_at DESC LIMIT 5');
  console.log('Projects:', JSON.stringify(projects, null, 2));
  console.log('Positions:', JSON.stringify(positions, null, 2));
  console.log('Candidates:', JSON.stringify(candidates, null, 2));
  process.exit(0);
}

check();