import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';
import pool from '../config/database.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(__dirname, 'migrations');

async function runMigrations() {
  console.log('Running migrations...');

  // Create migrations tracking table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id SERIAL PRIMARY KEY,
      filename VARCHAR(200) UNIQUE NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  const applied = new Set(
    (await pool.query('SELECT filename FROM _migrations')).rows.map((r: {filename: string}) => r.filename),
  );

  const files = fs.readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    if (applied.has(file)) {
      console.log(`  SKIP: ${file}`);
      continue;
    }
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    console.log(`  RUN:  ${file}`);
    await pool.query(sql);
    await pool.query('INSERT INTO _migrations (filename) VALUES ($1)', [file]);
  }

  console.log('Migrations complete.');
  await pool.end();
}

runMigrations().catch((e) => {
  console.error('Migration failed:', e);
  process.exit(1);
});
