import bcrypt from 'bcryptjs';
import {query} from '../config/database.js';

async function seed() {
  console.log('Seeding database...');

  // ── Clean slate ──
  await query('TRUNCATE TABLE contacts, notification_settings, agents, outreach_records, shortlist_entries, approval_requests, interview_results, interview_sessions, interview_questions, interview_templates, candidate_tags, candidates, position_details, positions, projects, users CASCADE');
  console.log('  Tables cleared');

  // ── Users ──
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || 'admin123';
  const userPassword = process.env.SEED_USER_PASSWORD || 'password123';
  const adminHash = await bcrypt.hash(adminPassword, 12);
  const userHash = await bcrypt.hash(userPassword, 12);

  await query(
    `INSERT INTO users (name, email, password_hash, role, status) VALUES
    ('系统管理员', 'admin@em-box.com', $1, 'admin', 'active'),
    ('张招募', 'zhang@em-box.com', $2, 'recruiter', 'active'),
    ('李经理', 'li@em-box.com', $2, 'hiring_manager', 'active'),
    ('王观察', 'wang@em-box.com', $2, 'viewer', 'active')
    ON CONFLICT (email) DO UPDATE SET name=EXCLUDED.name`,
    [adminHash, userHash],
  );
  const [adminRow] = await query<{id: string}>("SELECT id FROM users WHERE email='admin@em-box.com'");
  const adminId = adminRow.id;
  console.log('  Users: 4 created');

  // ── Projects ──
  await query(
    `INSERT INTO projects (name, city, manager, progress, start_date, end_date, description, status) VALUES
    ('动作采集项目-2026Q2', '北京', '李经理', 75, '2026-01-01', '2026-06-30', '全身动作捕捉数据采集项目', '进行中'),
    ('全身动捕-上海站', '上海', '张招募', 45, '2026-02-01', '2026-07-31', '上海地区全身动捕演员招募', '进行中'),
    ('ITW户外项目-深圳', '深圳', '李经理', 20, '2026-03-01', '2026-08-31', '户外动作数据采集', '筹备中'),
    ('实验室数据采集-V3', '北京', '王观察', 90, '2025-10-01', '2026-03-31', '实验室环境数据采集', '进行中'),
    ('特技演员选拔', '上海', '张招募', 0, '2026-04-01', '2026-09-30', '特技演员面试选拔', '筹备中'),
    ('通用素质评估-2025Q4', '北京', '李经理', 100, '2025-10-01', '2025-12-31', '通用素质评估项目', '已关闭')`,
  );
  const allProjects = await query<{id: string; name: string}>('SELECT id, name FROM projects ORDER BY created_at');
  const pId = (name: string) => allProjects.find(p => p.name === name)!.id;
  console.log(`  Projects: ${allProjects.length} created`);

  // ── Positions ──
  await query(
    `INSERT INTO positions (code, name, category, project_id, status, description, created_by) VALUES
    ('MWV-001', '全身动捕演员', 'MWV', $1, 'active', '负责全身动作捕捉数据采集', $6),
    ('ITF-001', '实验室采集', 'ITF', $4, 'active', '负责实验室环境数据采集', $6),
    ('ITW-001', '户外动作采集', 'ITW', $3, 'active', '负责户外动作数据采集', $6),
    ('MWV-002', '特技演员', 'MWV', $5, 'active', '负责高难度特技动作采集', $6),
    ('GENERAL-001', '通用基础素质', 'GENERAL', $2, 'active', '通用基础素质评估', $6)`,
    [pId('动作采集项目-2026Q2'), pId('全身动捕-上海站'), pId('ITW户外项目-深圳'), pId('实验室数据采集-V3'), pId('特技演员选拔'), adminId],
  );
  const allPositions = await query<{id: string; name: string}>('SELECT id, name FROM positions ORDER BY created_at');
  const posId = (name: string) => allPositions.find(p => p.name === name)!.id;
  console.log(`  Positions: ${allPositions.length} created`);

  // ── Position Details ──
  const mwv = posId('全身动捕演员');
  const itf = posId('实验室采集');
  const itw = posId('户外动作采集');
  const mwv2 = posId('特技演员');
  const gen = posId('通用基础素质');

  await query(
    `INSERT INTO position_details (position_id, profile, scoring_rules, grade_rules, keyword_rules, ai_prompt) VALUES
    ($1, '{"mustHave":["20-35岁","身体健康"],"niceToHave":["舞蹈基础","武术基础"],"bonus":["动捕经验"]}',
     '[{"dimension":"基础匹配度","weight":30,"criteria":"年龄身体条件","source":"简历"},{"dimension":"专业契合度","weight":30,"criteria":"专业技能经验","source":"简历"},{"dimension":"动作协调","weight":20,"criteria":"协调性","source":"面试"},{"dimension":"应变能力","weight":20,"criteria":"临场反应","source":"面试"}]',
     '[{"grade":"A级","minScore":90,"maxScore":100,"label":"强烈推荐","action":"优先推动"},{"grade":"B+级","minScore":80,"maxScore":89,"label":"推荐","action":"正常推动"},{"grade":"B级","minScore":70,"maxScore":79,"label":"可以考虑","action":"观察"},{"grade":"C级","minScore":0,"maxScore":69,"label":"不推荐","action":"淘汰"}]',
     '动捕,动作捕捉,舞蹈,武术,运动', '请评估候选人是否适合全身动捕演员岗位'),
    ($2, '{"mustHave":["实验操作经验","数据记录能力"],"niceToHave":["实验室背景"],"bonus":["科研经验"]}',
     '[{"dimension":"实验能力","weight":40,"criteria":"实验室操作","source":"简历"},{"dimension":"数据能力","weight":30,"criteria":"数据采集分析","source":"简历"},{"dimension":"态度","weight":30,"criteria":"工作态度","source":"面试"}]',
     '[{"grade":"A级","minScore":90,"maxScore":100,"label":"强烈推荐","action":"优先推动"},{"grade":"B+级","minScore":80,"maxScore":89,"label":"推荐","action":"正常推动"},{"grade":"B级","minScore":70,"maxScore":79,"label":"可以考虑","action":"观察"},{"grade":"C级","minScore":0,"maxScore":69,"label":"不推荐","action":"淘汰"}]',
     '实验室,数据,采集,仪器', '请评估候选人是否适合实验室采集岗位'),
    ($3, '{"mustHave":["体力好","户外适应能力"],"niceToHave":["户外工作经验"],"bonus":["航拍经验"]}',
     '[{"dimension":"身体素质","weight":35,"criteria":"体力耐力","source":"简历"},{"dimension":"专业能力","weight":30,"criteria":"户外采集技能","source":"简历"},{"dimension":"应变能力","weight":20,"criteria":"突发情况处理","source":"面试"},{"dimension":"团队协作","weight":15,"criteria":"团队配合","source":"面试"}]',
     '[{"grade":"A级","minScore":90,"maxScore":100,"label":"强烈推荐","action":"优先推动"},{"grade":"B+级","minScore":80,"maxScore":89,"label":"推荐","action":"正常推动"},{"grade":"B级","minScore":70,"maxScore":79,"label":"可以考虑","action":"观察"},{"grade":"C级","minScore":0,"maxScore":69,"label":"不推荐","action":"淘汰"}]',
     '户外,采集,体能,摄影', '请评估候选人是否适合户外采集岗位'),
    ($4, '{"mustHave":["特技经验","身体素质极佳"],"niceToHave":["武术背景"],"bonus":["影视经验"]}',
     '[{"dimension":"特技能力","weight":40,"criteria":"特技动作执行","source":"简历"},{"dimension":"身体素质","weight":30,"criteria":"体能条件","source":"简历"},{"dimension":"安全意识","weight":30,"criteria":"安全防护","source":"面试"}]',
     '[{"grade":"A级","minScore":90,"maxScore":100,"label":"强烈推荐","action":"优先推动"},{"grade":"B+级","minScore":80,"maxScore":89,"label":"推荐","action":"正常推动"},{"grade":"B级","minScore":70,"maxScore":79,"label":"可以考虑","action":"观察"},{"grade":"C级","minScore":0,"maxScore":69,"label":"不推荐","action":"淘汰"}]',
     '特技,武术,极限,影视', '请评估候选人是否适合特技演员岗位'),
    ($5, '{"mustHave":["责任心","团队意识"],"niceToHave":["沟通能力"],"bonus":["管理经验"]}',
     '[{"dimension":"基础素质","weight":40,"criteria":"基本素质态度","source":"简历"},{"dimension":"综合能力","weight":30,"criteria":"沟通学习","source":"面试"},{"dimension":"潜力","weight":30,"criteria":"发展潜力","source":"面试"}]',
     '[{"grade":"A级","minScore":90,"maxScore":100,"label":"强烈推荐","action":"优先推动"},{"grade":"B+级","minScore":80,"maxScore":89,"label":"推荐","action":"正常推动"},{"grade":"B级","minScore":70,"maxScore":79,"label":"可以考虑","action":"观察"},{"grade":"C级","minScore":0,"maxScore":69,"label":"不推荐","action":"淘汰"}]',
     '沟通,团队,责任心,学习', '请评估候选人通用素质')`,
    [mwv, itf, itw, mwv2, gen],
  );
  console.log('  Position details: 5 created');

  // ── Candidates ──
  await query(
    `INSERT INTO candidates (name, email, phone, location, source, project_id, position_id, score_total, grade, parsed_info) VALUES
    ('张伟', 'zhangw@example.com', '13800001111', '北京', '上传简历', $1, $2, 82, 'B+', '{"name":"张伟","email":"zhangw@example.com","skills":["动捕","舞蹈"],"workExperience":["某影视公司动捕演员"],"education":["北京体育大学"]}'),
    ('陈静', 'chenj@example.com', '13800002222', '上海', '上传简历', $1, $2, 88, 'A', '{"name":"陈静","email":"chenj@example.com","skills":["武术","体操"],"workExperience":["上海体育学院助教"]}'),
    ('李明', 'liming@example.com', '13800003333', '深圳', '招聘网站', $3, $4, 65, 'C', '{"name":"李明","email":"liming@example.com","skills":["户外","摄影"],"workExperience":["自由摄影师"]}'),
    ('王芳', 'wangf@example.com', '13800004444', '北京', '上传简历', $5, $6, 75, 'B', '{"name":"王芳","email":"wangf@example.com","skills":["实验","数据分析"],"workExperience":["中科院实验室助理"]}'),
    ('吴刚', 'wugang@example.com', '13800005555', '上海', '上传简历', $7, $8, 91, 'A', '{"name":"吴刚","email":"wugang@example.com","skills":["特技","武术","极限运动"],"workExperience":["某影视公司特技演员"]}'),
    ('周丽', 'zhouli@example.com', '13800006666', '北京', '招聘网站', $1, $2, 58, 'C', '{"name":"周丽","email":"zhouli@example.com","skills":["舞蹈"],"workExperience":["舞蹈老师"]}'),
    ('赵磊', 'zhaolei@example.com', '13800007777', '深圳', '上传简历', $3, $4, 72, 'B', '{"name":"赵磊","email":"zhaolei@example.com","skills":["航拍","户外"],"workExperience":["航拍摄影师"]}'),
    ('孙燕', 'sunyan@example.com', '13800008888', '北京', '上传简历', $5, $6, 85, 'A', '{"name":"孙燕","email":"sunyan@example.com","skills":["实验","仪器操作"],"workExperience":["某大学实验室主管"]}'),
    ('刘强', 'liuqiang@example.com', '13800009999', '上海', '招聘网站', $7, $8, 78, 'B', '{"name":"刘强","email":"liuqiang@example.com","skills":["武术","特技"],"workExperience":["武术教练"]}'),
    ('黄婷', 'huangting@example.com', '13800010000', '北京', '上传简历', $1, $9, 80, 'B+', '{"name":"黄婷","email":"huangting@example.com","skills":["沟通","团队协作"],"workExperience":["某公司项目经理"]}')`,
    [pId('动作采集项目-2026Q2'), mwv, pId('ITW户外项目-深圳'), itw, pId('实验室数据采集-V3'), itf, pId('特技演员选拔'), mwv2, gen],
  );
  const allCandidates = await query<{id: string; name: string}>('SELECT id, name FROM candidates ORDER BY created_at');
  const cId = (name: string) => allCandidates.find(c => c.name === name)!.id;
  console.log(`  Candidates: ${allCandidates.length} created`);

  // ── Candidate Tags ──
  const tagPairs: [string, string[]][] = [
    ['张伟', ['动捕', '舞蹈', 'B+']],
    ['陈静', ['武术', '体操', 'A级']],
    ['李明', ['户外', '摄影', 'C级']],
    ['王芳', ['实验', '数据分析', 'B级']],
    ['吴刚', ['特技', '武术', 'A级']],
    ['周丽', ['舞蹈', 'C级']],
    ['赵磊', ['航拍', '户外', 'B级']],
    ['孙燕', ['实验', 'A级']],
    ['刘强', ['武术', 'B级']],
    ['黄婷', ['沟通', 'B+级']],
  ];
  for (const [name, tags] of tagPairs) {
    const cid = cId(name);
    await query(
      `INSERT INTO candidate_tags (candidate_id, tag) VALUES ${tags.map((_, i) => `($1, $${i + 2})`).join(', ')}`,
      [cid, ...tags],
    );
  }
  console.log('  Candidate tags created');

  // ── Interview Templates ──
  await query(
    `INSERT INTO interview_templates (position_id, name, version, status, duration_minutes, question_count, created_by) VALUES
    ($1, '全身动捕演员面试 V1', 1, 'active', 30, 4, $4),
    ($2, '实验室采集面试 V1', 1, 'active', 25, 3, $4),
    ($3, '户外动作采集面试 V2', 2, 'active', 35, 5, $4)`,
    [mwv, itf, itw, adminId],
  );
  const allTemplates = await query<{id: string; name: string}>('SELECT id, name FROM interview_templates ORDER BY created_at');
  const tId = (name: string) => allTemplates.find(t => t.name === name)!.id;
  console.log(`  Templates: ${allTemplates.length} created`);

  // ── Interview Questions ──
  const t1 = tId('全身动捕演员面试 V1');
  const t2 = tId('实验室采集面试 V1');
  const t3 = tId('户外动作采集面试 V2');
  await query(
    `INSERT INTO interview_questions (template_id, sort_order, title, prompt, time_limit_seconds) VALUES
    ($1, 1, '自我介绍', '请用2分钟时间简要介绍自己的背景和经历', 120),
    ($1, 2, '动作经验', '请描述你最有代表性的动作表演或运动经历', 180),
    ($1, 3, '体能测试', '请展示以下基础动作：深蹲、跳跃、转身', 120),
    ($1, 4, '情景模拟', '假设你需要完成一个复杂的动作序列，你会如何准备？', 150),
    ($2, 1, '自我介绍', '请介绍你的实验操作经验和技能', 120),
    ($2, 2, '实验设计', '请描述一个你设计或参与的实验', 180),
    ($2, 3, '数据处理', '你如何确保数据采集的准确性和完整性？', 150),
    ($3, 1, '自我介绍', '请介绍你的户外工作经验', 120),
    ($3, 2, '户外经验', '请描述一次具有挑战性的户外拍摄或采集经历', 180),
    ($3, 3, '设备操作', '你对哪些户外采集设备比较熟悉？', 120),
    ($3, 4, '安全意识', '在户外采集过程中，你如何保证安全？', 150),
    ($3, 5, '团队协作', '请分享一次团队合作完成户外任务的经历', 150)`,
    [t1, t2, t3],
  );
  console.log('  Questions created');

  // ── Interview Results ──
  const now = new Date().toISOString();
  const d1 = new Date(Date.now() - 86400000).toISOString();
  const d2 = new Date(Date.now() - 2 * 86400000).toISOString();
  const d3 = new Date(Date.now() - 3 * 86400000).toISOString();
  const d4 = new Date(Date.now() - 4 * 86400000).toISOString();
  const d5 = new Date(Date.now() - 5 * 86400000).toISOString();

  const dims1 = '[{"name":"身体素质","score":85,"weight":30},{"name":"动作协调","score":80,"weight":30},{"name":"应变能力","score":78,"weight":20},{"name":"专业认知","score":88,"weight":20}]';
  const dims2 = '[{"name":"身体素质","score":95,"weight":30},{"name":"动作协调","score":90,"weight":30},{"name":"应变能力","score":88,"weight":20},{"name":"专业认知","score":92,"weight":20}]';
  const dims3 = '[{"name":"身体素质","score":70,"weight":35},{"name":"专业能力","score":60,"weight":30},{"name":"应变能力","score":65,"weight":20},{"name":"团队协作","score":62,"weight":15}]';
  const dims4 = '[{"name":"实验能力","score":78,"weight":40},{"name":"数据能力","score":72,"weight":30},{"name":"态度","score":76,"weight":30}]';
  const dims5 = '[{"name":"身体素质","score":92,"weight":30},{"name":"动作协调","score":90,"weight":30},{"name":"应变能力","score":82,"weight":20},{"name":"专业认知","score":85,"weight":20}]';
  const dims6 = '[{"name":"身体素质","score":55,"weight":30},{"name":"动作协调","score":60,"weight":30},{"name":"应变能力","score":58,"weight":20},{"name":"专业认知","score":56,"weight":20}]';

  await query(
    `INSERT INTO interview_results (candidate_id, candidate_name, candidate_email, position, template_name, interview_date, total_score, grade, grade_label, dimensions, duration, status) VALUES
    ($1, '张伟', 'zhangw@example.com', '全身动捕演员', '全身动捕演员面试 V1', $7, 82, 'good', '表现良好，建议进入下一轮', $13, 25, 'completed'),
    ($2, '陈静', 'chenj@example.com', '全身动捕演员', '全身动捕演员面试 V1', $8, 91, 'excellent', '表现优秀，强烈推荐录用', $14, 28, 'completed'),
    ($3, '李明', 'liming@example.com', '户外动作采集', '户外动作采集面试 V2', $9, 65, 'rejected', '基本素质不足，暂不推荐', $15, 20, 'completed'),
    ($4, '王芳', 'wangf@example.com', '实验室采集', '实验室采集面试 V1', $10, 75, 'qualified', '基本合格，可以考虑', $16, 22, 'completed'),
    ($5, '吴刚', 'wugang@example.com', '特技演员', '全身动捕演员面试 V1', $11, 88, 'good', '特技能力突出，建议录用', $17, 26, 'reviewed'),
    ($6, '周丽', 'zhouli@example.com', '全身动捕演员', '全身动捕演员面试 V1', $12, 58, 'rejected', '体能和协调性不足', $18, 18, 'completed')`,
    [cId('张伟'), cId('陈静'), cId('李明'), cId('王芳'), cId('吴刚'), cId('周丽'),
     now, d1, d2, d3, d4, d5,
     dims1, dims2, dims3, dims4, dims5, dims6],
  );
  console.log('  Interview results: 6 created');

  // ── Approval Requests ──
  await query(
    `INSERT INTO approval_requests (type, candidate_id, candidate_name, candidate_email, position_id, position_name, interview_score, interview_grade, interview_grade_label, interview_date, interview_duration, dimension_scores, status, requester_name) VALUES
    ('interview_result', $1, '张伟', 'zhangw@example.com', $4, '全身动捕演员', 82, 'good', '表现良好', $5, 25, $6, 'pending', '张招募'),
    ('interview_result', $2, '陈静', 'chenj@example.com', $4, '全身动捕演员', 91, 'excellent', '表现优秀', $7, 28, $8, 'pending', '张招募'),
    ('interview_result', $3, '李明', 'liming@example.com', $9, '户外动作采集', 65, 'rejected', '基本素质不足', $10, 20, $11, 'pending', '张招募')`,
    [cId('张伟'), cId('陈静'), cId('李明'), mwv, now, dims1, d1, dims2, itw, d2, dims3],
  );
  await query(
    `INSERT INTO approval_requests (type, candidate_id, candidate_name, candidate_email, position_id, position_name, interview_score, interview_grade, interview_grade_label, interview_date, interview_duration, dimension_scores, status, requester_name) VALUES
    ('interview_result', $1, '吴刚', 'wugang@example.com', $2, '特技演员', 88, 'good', '特技能力突出', $3, 26, $4, 'approved', '张招募')`,
    [cId('吴刚'), mwv2, d4, dims5],
  );
  await query(
    `INSERT INTO approval_requests (type, candidate_id, candidate_name, candidate_email, position_id, position_name, interview_score, interview_grade, interview_grade_label, interview_date, interview_duration, dimension_scores, status, requester_name) VALUES
    ('interview_result', $1, '周丽', 'zhouli@example.com', $2, '全身动捕演员', 58, 'rejected', '体能不足', $3, 18, $4, 'rejected', '张招募')`,
    [cId('周丽'), mwv, d5, dims6],
  );
  // Update approved with info
  await query(
    `UPDATE approval_requests SET approver_name='李经理', decided_at=now(), decided_comment='特技能力突出，同意录用' WHERE candidate_id=$1 AND status='approved'`,
    [cId('吴刚')],
  );
  await query(
    `UPDATE approval_requests SET approver_name='李经理', decided_at=now(), decided_comment='体能不足，暂不通过' WHERE candidate_id=$1 AND status='rejected'`,
    [cId('周丽')],
  );
  console.log('  Approval requests: 5 created');

  // ── Shortlist ──
  await query(
    `INSERT INTO shortlist_entries (candidate_id, candidate_name, position_id, position_name, project_id, project_name, fit_score, grade, next_step) VALUES
    ($1, '张伟', $3, '全身动捕演员', $4, '动作采集项目-2026Q2', 82, 'B+', '等待面试'),
    ($2, '陈静', $3, '全身动捕演员', $4, '动作采集项目-2026Q2', 91, 'A', '待推进')`,
    [cId('张伟'), cId('陈静'), mwv, pId('动作采集项目-2026Q2')],
  );
  await query(
    `INSERT INTO shortlist_entries (candidate_id, candidate_name, position_id, position_name, project_id, project_name, fit_score, grade, next_step) VALUES
    ($1, '王芳', $2, '实验室采集', $3, '实验室数据采集-V3', 75, 'B', '待推进')`,
    [cId('王芳'), itf, pId('实验室数据采集-V3')],
  );
  await query(
    `INSERT INTO shortlist_entries (candidate_id, candidate_name, position_id, position_name, project_id, project_name, fit_score, grade, next_step) VALUES
    ($1, '吴刚', $2, '特技演员', $3, '特技演员选拔', 91, 'A', '已发面试邀请')`,
    [cId('吴刚'), mwv2, pId('特技演员选拔')],
  );
  console.log('  Shortlist entries: 4 created');

  // ── Outreach (沟通记录) ──
  await query(
    `INSERT INTO outreach_records (candidate_id, candidate_name, position_id, position_name, channel, status, content) VALUES
    ($1, '张伟', $3, '全身动捕演员', 'interview', 'contacted', '面试邀请：请于本周五参加AI面试'),
    ($2, '陈静', $3, '全身动捕演员', 'interview', 'responded', '面试邀请：已确认参加')`,
    [cId('张伟'), cId('陈静'), mwv],
  );
  await query(
    `INSERT INTO outreach_records (candidate_id, candidate_name, position_id, position_name, channel, status, content) VALUES
    ($1, '李明', $2, '户外动作采集', 'wechat', 'pending', '跟进：对户外采集岗位感兴趣吗？')`,
    [cId('李明'), itw],
  );
  await query(
    `INSERT INTO outreach_records (candidate_id, candidate_name, position_id, position_name, channel, status, content) VALUES
    ($1, '王芳', $2, '实验室采集', 'phone', 'contacted', '电话确认面试时间')`,
    [cId('王芳'), itf],
  );
  console.log('  Outreach data created');

  // ── Agents ──
  await query(
    `INSERT INTO agents (name, description, project_id, project_name, role_type, type, status, pushed_today, approved, rejected, pending_count, adoption_rate) VALUES
    ('简历筛选代理-MWV', '自动筛选全身动捕演员简历', $1, '动作采集项目-2026Q2', '简历筛选', 'screener', 'running', 12, 8, 2, 2, 80.00),
    ('面试调度代理', '自动安排面试时间和发送邀请', $2, '全身动捕-上海站', '面试调度', 'scheduler', 'running', 5, 4, 0, 1, 80.00),
    ('数据同步代理', '定期同步MIS系统数据', $3, 'ITW户外项目-深圳', '数据同步', 'syncer', 'paused', 0, 0, 0, 0, 0.00)`,
    [pId('动作采集项目-2026Q2'), pId('全身动捕-上海站'), pId('ITW户外项目-深圳')],
  );
  console.log('  Agents: 3 created');

  // ── Notification Settings ──
  await query(
    `INSERT INTO notification_settings (user_id, type, category, enabled) VALUES
    ($1, 'email', 'new_application', true),
    ($1, 'in_app', 'interview_reminder', true),
    ($1, 'email', 'approval_result', true),
    ($1, 'in_app', 'system_update', true)`,
    [adminId],
  );

  // ── Contacts ──
  await query(
    `INSERT INTO contacts (candidate_id, candidate_name, position_id, position_name, project_id, project_name, outreach_person, channel, reason, status) VALUES
    ($1, '张伟', $3, '全身动捕演员', $4, '动作采集项目-2026Q2', '张招募', 'wechat', '面试邀请已发送', 'interview_scheduled'),
    ($2, '陈静', $3, '全身动捕演员', $4, '动作采集项目-2026Q2', '张招募', 'email', '候选人已回复确认', 'responded')`,
    [cId('张伟'), cId('陈静'), mwv, pId('动作采集项目-2026Q2')],
  );
  await query(
    `INSERT INTO contacts (candidate_id, candidate_name, position_id, position_name, project_id, project_name, outreach_person, channel, reason, status) VALUES
    ($1, '王芳', $2, '实验室采集', $3, '实验室数据采集-V3', '李经理', 'phone', '待跟进面试安排', 'pending')`,
    [cId('王芳'), itf, pId('实验室数据采集-V3')],
  );
  console.log('  Contacts: 3 created');

  console.log('\nSeed complete!');
  console.log(`  Login: admin@em-box.com / ${adminPassword}`);
  process.exit(0);
}

seed().catch((e) => {
  console.error('Seed failed:', e);
  process.exit(1);
});
