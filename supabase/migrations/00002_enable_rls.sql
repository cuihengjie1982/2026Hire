-- ============================================================
-- RLS Policies for EM-BOX Recruitment Management System
-- ============================================================

-- ── Helper functions ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin');
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION is_recruiter_or_above()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role IN ('admin', 'recruiter')
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION is_hiring_manager_or_above()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role IN ('admin', 'recruiter', 'hiring_manager')
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ── Profiles ─────────────────────────────────────────────────
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view profiles"
  ON profiles FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

CREATE POLICY "Admins can update any profile"
  ON profiles FOR UPDATE TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY "Admins can insert profiles"
  ON profiles FOR INSERT TO authenticated
  WITH CHECK (is_admin());

CREATE POLICY "Admins can delete profiles"
  ON profiles FOR DELETE TO authenticated
  USING (is_admin());

-- ── Projects ─────────────────────────────────────────────────
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view projects"
  ON projects FOR SELECT TO authenticated USING (true);

CREATE POLICY "Recruiters and admins can create projects"
  ON projects FOR INSERT TO authenticated
  WITH CHECK (is_recruiter_or_above());

CREATE POLICY "Recruiters and admins can update projects"
  ON projects FOR UPDATE TO authenticated
  USING (is_recruiter_or_above())
  WITH CHECK (is_recruiter_or_above());

CREATE POLICY "Recruiters and admins can delete projects"
  ON projects FOR DELETE TO authenticated
  USING (is_recruiter_or_above());

-- ── Positions ────────────────────────────────────────────────
ALTER TABLE positions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view positions"
  ON positions FOR SELECT TO authenticated USING (true);

CREATE POLICY "Recruiters and admins can create positions"
  ON positions FOR INSERT TO authenticated
  WITH CHECK (is_recruiter_or_above());

CREATE POLICY "Recruiters and admins can update positions"
  ON positions FOR UPDATE TO authenticated
  USING (is_recruiter_or_above())
  WITH CHECK (is_recruiter_or_above());

CREATE POLICY "Recruiters and admins can delete positions"
  ON positions FOR DELETE TO authenticated
  USING (is_recruiter_or_above());

-- ── Position Details ─────────────────────────────────────────
ALTER TABLE position_details ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view position details"
  ON position_details FOR SELECT TO authenticated USING (true);

CREATE POLICY "Recruiters and admins can insert position details"
  ON position_details FOR INSERT TO authenticated
  WITH CHECK (is_recruiter_or_above());

CREATE POLICY "Recruiters and admins can update position details"
  ON position_details FOR UPDATE TO authenticated
  USING (is_recruiter_or_above())
  WITH CHECK (is_recruiter_or_above());

-- ── Candidates ───────────────────────────────────────────────
ALTER TABLE candidates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view candidates"
  ON candidates FOR SELECT TO authenticated USING (true);

CREATE POLICY "Recruiters and admins can create candidates"
  ON candidates FOR INSERT TO authenticated
  WITH CHECK (is_recruiter_or_above());

CREATE POLICY "Recruiters and admins can update candidates"
  ON candidates FOR UPDATE TO authenticated
  USING (is_recruiter_or_above())
  WITH CHECK (is_recruiter_or_above());

CREATE POLICY "Recruiters and admins can delete candidates"
  ON candidates FOR DELETE TO authenticated
  USING (is_recruiter_or_above());

-- ── Candidate Tags ───────────────────────────────────────────
ALTER TABLE candidate_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view candidate tags"
  ON candidate_tags FOR SELECT TO authenticated USING (true);

CREATE POLICY "Recruiters and admins can manage candidate tags"
  ON candidate_tags FOR ALL TO authenticated
  USING (is_recruiter_or_above())
  WITH CHECK (is_recruiter_or_above());

-- ── Interview Templates ──────────────────────────────────────
ALTER TABLE interview_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view templates"
  ON interview_templates FOR SELECT TO authenticated USING (true);

CREATE POLICY "Recruiters and admins can create templates"
  ON interview_templates FOR INSERT TO authenticated
  WITH CHECK (is_recruiter_or_above());

CREATE POLICY "Recruiters and admins can update templates"
  ON interview_templates FOR UPDATE TO authenticated
  USING (is_recruiter_or_above())
  WITH CHECK (is_recruiter_or_above());

CREATE POLICY "Recruiters and admins can delete templates"
  ON interview_templates FOR DELETE TO authenticated
  USING (is_recruiter_or_above());

-- ── Interview Questions ──────────────────────────────────────
ALTER TABLE interview_questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view questions"
  ON interview_questions FOR SELECT TO authenticated USING (true);

CREATE POLICY "Recruiters and admins can manage questions"
  ON interview_questions FOR ALL TO authenticated
  USING (is_recruiter_or_above())
  WITH CHECK (is_recruiter_or_above());

-- ── Interview Sessions ───────────────────────────────────────
ALTER TABLE interview_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view sessions"
  ON interview_sessions FOR SELECT TO authenticated USING (true);

CREATE POLICY "Recruiters and admins can create sessions"
  ON interview_sessions FOR INSERT TO authenticated
  WITH CHECK (is_recruiter_or_above());

CREATE POLICY "Recruiters and admins can update sessions"
  ON interview_sessions FOR UPDATE TO authenticated
  USING (is_recruiter_or_above())
  WITH CHECK (is_recruiter_or_above());

CREATE POLICY "Recruiters and admins can delete sessions"
  ON interview_sessions FOR DELETE TO authenticated
  USING (is_recruiter_or_above());

-- ── Interview Results ────────────────────────────────────────
ALTER TABLE interview_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view results"
  ON interview_results FOR SELECT TO authenticated USING (true);

CREATE POLICY "Recruiters and admins can create results"
  ON interview_results FOR INSERT TO authenticated
  WITH CHECK (is_recruiter_or_above());

CREATE POLICY "Recruiters and admins can update results"
  ON interview_results FOR UPDATE TO authenticated
  USING (is_recruiter_or_above())
  WITH CHECK (is_recruiter_or_above());

-- ── Interview Answer Scores ──────────────────────────────────
ALTER TABLE interview_answer_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view answer scores"
  ON interview_answer_scores FOR SELECT TO authenticated USING (true);

CREATE POLICY "Recruiters and admins can create answer scores"
  ON interview_answer_scores FOR INSERT TO authenticated
  WITH CHECK (is_recruiter_or_above());

CREATE POLICY "Recruiters and admins can update answer scores"
  ON interview_answer_scores FOR UPDATE TO authenticated
  USING (is_recruiter_or_above())
  WITH CHECK (is_recruiter_or_above());

-- ── Approval Requests ────────────────────────────────────────
ALTER TABLE approval_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view approvals"
  ON approval_requests FOR SELECT TO authenticated USING (true);

CREATE POLICY "Recruiters and admins can create approvals"
  ON approval_requests FOR INSERT TO authenticated
  WITH CHECK (is_recruiter_or_above());

CREATE POLICY "Hiring managers and above can decide approvals"
  ON approval_requests FOR UPDATE TO authenticated
  USING (is_hiring_manager_or_above())
  WITH CHECK (is_hiring_manager_or_above());

-- ── Shortlist Entries ────────────────────────────────────────
ALTER TABLE shortlist_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view shortlist"
  ON shortlist_entries FOR SELECT TO authenticated USING (true);

CREATE POLICY "Recruiters and admins can manage shortlist"
  ON shortlist_entries FOR ALL TO authenticated
  USING (is_recruiter_or_above())
  WITH CHECK (is_recruiter_or_above());

-- ── Outreach Records ─────────────────────────────────────────
ALTER TABLE outreach_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view outreach"
  ON outreach_records FOR SELECT TO authenticated USING (true);

CREATE POLICY "Recruiters and admins can manage outreach"
  ON outreach_records FOR ALL TO authenticated
  USING (is_recruiter_or_above())
  WITH CHECK (is_recruiter_or_above());

-- ── Agents ───────────────────────────────────────────────────
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view agents"
  ON agents FOR SELECT TO authenticated USING (true);

CREATE POLICY "Recruiters and admins can manage agents"
  ON agents FOR ALL TO authenticated
  USING (is_recruiter_or_above())
  WITH CHECK (is_recruiter_or_above());

-- ── Contacts ─────────────────────────────────────────────────
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view contacts"
  ON contacts FOR SELECT TO authenticated USING (true);

CREATE POLICY "Recruiters and admins can manage contacts"
  ON contacts FOR ALL TO authenticated
  USING (is_recruiter_or_above())
  WITH CHECK (is_recruiter_or_above());

-- ── AI Model Configs (admin only — contains API keys) ────────
ALTER TABLE ai_model_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view AI configs"
  ON ai_model_configs FOR SELECT TO authenticated
  USING (is_admin());

CREATE POLICY "Admins can manage AI configs"
  ON ai_model_configs FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- ── Notification Settings (user-scoped) ──────────────────────
ALTER TABLE notification_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own notification settings"
  ON notification_settings FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can manage own notification settings"
  ON notification_settings FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ── Team Invites (admin only) ────────────────────────────────
ALTER TABLE team_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view invites"
  ON team_invites FOR SELECT TO authenticated
  USING (is_admin());

CREATE POLICY "Admins can manage invites"
  ON team_invites FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- ── Audit Logs (admin only read, service-role write) ─────────
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view audit logs"
  ON audit_logs FOR SELECT TO authenticated
  USING (is_admin());

-- No INSERT/UPDATE/DELETE policies — only service-role can write
