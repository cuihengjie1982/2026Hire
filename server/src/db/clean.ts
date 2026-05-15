import { query } from '../config/database.js';

async function clean() {
  // Keep users table - only clean projects, positions, candidates
  await query('TRUNCATE TABLE shortlist_entries, contacts, approval_requests, interview_results, interview_sessions, interview_templates, candidates, candidate_tags, positions, position_details, projects CASCADE');
  console.log('Projects, positions, candidates tables truncated - users preserved');
  process.exit(0);
}

clean();