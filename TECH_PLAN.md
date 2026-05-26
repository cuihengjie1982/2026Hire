# EM-BOX — PRD 驱动的技术方案与修复计划

> 基于 PRD v1.1（2026-05-18）+ COMMERCIAL_AUDIT.md（2026-05-26）
> 产出日期：2026-05-26

---

## 第一部分：PRD 理解总结

### 产品定义
EM-BOX 是面向 Embodied AI 行业（Ego/UMI/真机数据/仿真数据四类采集岗位）的 AI 招聘管理平台。通过 AI 简历解析、匹配评分、自动化外联和 AI 面试，为数据采集项目提供高效人才筛选和管理。定位是垂直行业的专业招聘工具，而非通用招聘系统。

### 核心用户
- **招募专员 (Recruiter)**：日常使用者，负责简历导入、AI 评分筛选、外联跟进、面试管理
- **管理员 (Admin)**：系统配置者，负责岗位评分标准、权限管理、审批监督、AI 模型配置
- **候选人 (Candidate)**：面试参与者，需要独立的面试体验入口（目前缺失）
- **访问者 (Viewer)**：数据查看者，查看招聘进度和统计

### 核心业务流程
```
项目创建 → 岗位配置 → 简历导入 → AI评分 → 入围名单 → 外联/推进 → AI面试 → 审批 → 录用
```
当前系统前半段（到入围名单）已完整实现，后半段（外联发送、AI面试体验、候选人端）存在断裂。

### 核心商业目标
- 提升简历筛选效率 80% → AI 评分已实现 ✅
- 降低人工匹配成本 60% → Agent 自动化已实现 ✅
- 提高候选人转化率 40% → 依赖外联和面试体验 ❌
- 招聘流程全数字化 → 外联和面试体验是最后拼图 ❌

### 核心系统模块（PRD 定义 15 个）
| 模块 | 当前实际状态 | 与 PRD 对齐度 |
|------|------------|-------------|
| 5.1 工作台 | UI 完成，部分数据为 mock | 71% |
| 5.2 候选人搜索 | 完整实现 | 95% |
| 5.3 AI 代理 | 后端完整（Parser/Screener/Matcher），前端展示待优化 | 80% |
| 5.4 入围名单 | 基本实现，缺批量操作和历史记录 | 70% |
| 5.5 项目管理 | 完整实现 | 100% |
| 5.6 人才库 | 完整实现 | 100% |
| 5.7 联系人管理 | 完整实现 | 100% |
| 5.8 外联序列 | CRUD 完整，缺真实发送通道 | 67% |
| 5.9 数据洞察 | 后端聚合已有，前端图表部分 mock | 75% |
| 5.10 集成管理 | 健康检查有，缺真实外部系统对接 | 25% |
| 5.11 岗位标准配置 | 完整实现 | 100% |
| 5.12 AI 面试中心 | 模板/会话/评分完整实现 | 100% |
| 5.13 AI 面试体验 | **完全缺失** | 0% |
| 5.14 审批中心 | 完整实现 | 100% |
| 5.15 系统设置 | 完整实现 | 100% |

---

## 第二部分：需求澄清与风险点

### 需要进一步确认的点

| # | 问题 | 影响模块 | 需要谁确认 |
|---|------|---------|-----------|
| Q1 | AI 面试体验是否需要视频录制？还是音频 + 文字即可？ | 5.13 AI面试体验 | 产品 + 技术 |
| Q2 | 候选人端是否需要独立的 H5 页面？还是嵌入微信小程序？ | 5.13 AI面试体验 | 产品 + 设计 |
| Q3 | 外联的邮件/短信发送走哪个服务商？预算多少？ | 5.8 外联序列 | 运营 + 技术 |
| Q4 | 集成管理中的 MIS / OpenClaw 是否有真实 API 文档？ | 5.10 集成管理 | 产品 + 对方团队 |
| Q5 | PRD 定义的 interviewer 角色与代码中的 hiring_manager 是否为同一角色？ | 权限系统 | 产品 |
| Q6 | PRD 要求"支持100个用户同时在线"，是否需要做压力测试验证？ | 非功能需求 | 技术 |
| Q7 | PRD 要求"微服务架构"，当前单体架构是否可接受？何时拆分？ | 架构 | 技术 + 运营 |
| Q8 | PRD 要求"数据分片和读写分离"，当前数据量是否需要？ | 非功能需求 | 技术 |

### 高风险模块

| 风险模块 | 风险描述 | 风险等级 | 影响范围 |
|---------|---------|---------|---------|
| AI 面试体验 | WebRTC 音视频采集 + 实时 ASR + 状态管理，技术复杂度极高 | 🔴 极高 | 核心产品价值 |
| 外联发送通道 | 需要对接第三方邮件/短信 API，涉及费用和合规 | 🟡 高 | 核心业务流程 |
| 前端 AI 迁移 | 当前 AI 调用全部在前端，API Key 暴露，需迁移到后端 | 🟡 高 | 安全 + 成本 |
| Token 竞态 | 前端并发请求时 Token 刷新可能竞态，导致登出 | 🟡 高 | 用户体验 |
| 生产安全 | Fail-Open + Stack Trace 泄露，需立即修复 | 🟡 高 | 安全合规 |

### 跨团队确认点

- **产品确认**：AI 面试体验的具体交互流程（Q1/Q2）
- **运营确认**：外联渠道的服务商选择和预算（Q3）
- **技术确认**：微服务拆分时机、数据分片需求（Q7/Q8）

---

## 第三部分：总体技术方案

### 当前技术栈（已有，不做大规模重构）

```
前端：React 19 + TypeScript + Vite + Tailwind CSS 4
后端：Express 4 + TypeScript + PostgreSQL (pg)
数据库：Supabase Managed PostgreSQL
认证：JWT (access 2h + refresh 7d + blacklist)
部署：Vercel (前端) + Docker (后端)
AI：8 家 LLM Provider + Whisper ASR + MinerU OCR
```

### 需要新增/调整的技术方案

#### 3.1 候选人端架构（新增）

**为什么需要**：PRD 定义了候选人 (Candidate) 角色，需要独立的面试体验页面，不能放在管理后台里。

**方案**：
- 在现有项目中新增 `/interview/:sessionId` 公开路由（无需登录后台）
- 使用 Web Audio API 做音频采集（MVP 先不做视频，降低复杂度）
- 音频实时上传到后端，后端调用 Whisper 转写
- 面试题目通过 WebSocket/SSE 推送（或轮询，MVP 阶段用轮询）
- 候选人通过邮件/短信中的链接直接进入面试

**技术选型**：
- 音频采集：MediaRecorder API（浏览器原生）
- 音频转写：后端 Whisper（已有）
- 面试流程：前端状态机 + 后端 session 管理
- 实时通信：SSE（Server-Sent Events），比 WebSocket 简单，够用

#### 3.2 外联发送架构（新增）

**为什么需要**：当前外联模块只有 CRUD，无真实发送能力。

**方案**：
- 后端新增 Notification Service 模块
- 邮件发送：Resend API（海外）/ 阿里云邮件推送（国内）
- 短信发送：阿里云短信 SDK
- 发送队列：PostgreSQL `NOTIFY/LISTEN`（MVP）/ Redis Bull Queue（生产）
- 发送状态回调：webhook 接收服务商投递状态

**技术选型**：
- 邮件：Resend（推荐，API 友好，免费额度 100 封/天）
- 短信：阿里云短信（国内场景最成熟）
- 模板引擎：后端字符串替换（MVP）/ Handlebars（增强）

#### 3.3 AI 调用后端代理化（调整）

**为什么需要**：当前 AI API Key 全部暴露在前端，任何用户都能获取并滥用。

**方案**：
- 后端已有 `aiProxy.routes.ts` 和 `llmClient.ts`，基础已搭好
- 前端 AI 调用全部迁移到后端代理接口
- 前端只发请求，不持有任何 AI API Key
- 后端添加用量统计和速率限制

#### 3.4 安全加固（修复）

| 修复项 | 当前问题 | 修复方案 |
|--------|---------|---------|
| 认证 Fail-Open | 黑名单查询失败时放行 | 改为 Fail-Close |
| Stack Trace 泄露 | 生产环境返回堆栈信息 | 生产环境隐藏 |
| CSRF Bearer 绕过 | Bearer Token 跳过 CSRF 检查 | 添加设计注释 + Cookie 场景防护 |
| 敏感操作无速率限制 | 密码重置等无独立限制 | 添加独立限流器 |
| Token 竞态 | 并发刷新导致混乱 | 全局刷新锁 |

---

## 第四部分：项目模块拆分（待开发/修复）

### 模块 A：安全加固

- **功能范围**：修复 5 个安全问题（Fail-Open、Stack Trace、CSRF、速率限制、Token 竞态）
- **依赖关系**：无外部依赖，可立即开始
- **输入输出**：修改后端中间件 + 前端 apiClient
- **开发难度**：低（代码改动小）
- **Phase 建议**：Phase 1

### 模块 B：AI 调用后端代理化

- **功能范围**：前端 AI 调用迁移到后端代理，API Key 不再暴露
- **依赖关系**：依赖后端 aiProxy 路由完善
- **输入输出**：前端移除直接 AI 调用 → 后端代理接口 → AI 服务
- **开发难度**：中（需重构前端 AI 调用层）
- **Phase 建议**：Phase 1

### 模块 C：外联发送通道

- **功能范围**：集成邮件/短信发送，实现发送队列和状态追踪
- **依赖关系**：依赖 Q3（服务商确认）
- **输入输出**：外联记录 → 发送队列 → 第三方服务 → 状态回调
- **开发难度**：中（第三方 API 对接，注意模板和合规）
- **Phase 建议**：Phase 1

### 模块 D：候选人 AI 面试体验

- **功能范围**：候选人端独立页面，音频采集、题目展示、实时转写、结果提交
- **依赖关系**：依赖 Q1/Q2（面试形式确认），依赖模块 C（面试邀请发送）
- **输入输出**：候选人通过链接进入 → 完成面试 → 结果回传后台
- **开发难度**：极高（音视频处理 + 实时交互 + 多端兼容）
- **Phase 建议**：Phase 2

### 模块 E：数据洞察接入真实数据

- **功能范围**：前端图表从 mock/fixtures 切换到真实 API
- **依赖关系**：后端 analytics API 已有真实数据（已验证）
- **输入输出**：前端调用真实 analytics API → 展示真实图表
- **开发难度**：低（主要是前端 API 对接）
- **Phase 建议**：Phase 1

### 模块 F：入围名单增强

- **功能范围**：批量操作、智能推荐、历史记录
- **依赖关系**：依赖 AI 评分数据
- **输入输出**：候选人列表 → 批量添加到入围 → 状态追踪
- **开发难度**：中
- **Phase 建议**：Phase 2

### 模块 G：代码质量优化

- **功能范围**：拆分大型组件、消除 any、统一分页规范、修复静默错误
- **依赖关系**：无
- **输入输出**：代码质量提升
- **开发难度**：低-中（工作量主要在遍历修改）
- **Phase 建议**：Phase 2

### 模块 H：缓存层引入

- **功能范围**：引入 Redis 缓存读多写少的数据
- **依赖关系**：需要 Redis 服务
- **输入输出**：数据库查询 → Redis 缓存 → 响应加速
- **开发难度**：中
- **Phase 建议**：Phase 2

### 模块 I：外部系统集成

- **功能范围**：MIS / OpenClaw 等外部系统真实 API 对接
- **依赖关系**：依赖 Q4（对方 API 文档）
- **输入输出**：EM-BOX ↔ 外部系统数据同步
- **开发难度**：高（依赖第三方文档和协作）
- **Phase 建议**：Phase 3

### 模块 J：CI/CD 与监控

- **功能范围**：GitHub Actions CI/CD、应用监控、错误追踪、日志收集
- **依赖关系**：需要确定部署环境
- **输入输出**：自动化测试 + 部署 + 告警
- **开发难度**：中
- **Phase 建议**：Phase 2

---

## 第五部分：数据库与核心数据模型调整

### 当前数据库状态
系统已有 25 个迁移文件，数据模型基本完善。以下仅列出需要新增或调整的表。

### 新增表

#### outreach_messages（外联消息发送记录）
```sql
CREATE TABLE outreach_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outreach_record_id UUID NOT NULL REFERENCES outreach_records(id),
  channel VARCHAR(20) NOT NULL,        -- 'email' | 'sms'
  recipient VARCHAR(255) NOT NULL,
  subject VARCHAR(500),                -- 邮件主题（仅邮件）
  content TEXT NOT NULL,
  provider_id VARCHAR(100),            -- 服务商消息 ID
  status VARCHAR(20) NOT NULL DEFAULT 'pending',  -- pending | sent | delivered | failed | bounced
  error_message TEXT,
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_outreach_messages_outreach ON outreach_messages(outreach_record_id);
CREATE INDEX idx_outreach_messages_status ON outreach_messages(status);
```

#### interview_audio_segments（面试音频片段）
```sql
CREATE TABLE interview_audio_segments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES interview_sessions(id),
  question_index INT NOT NULL,
  audio_url TEXT NOT NULL,              -- 音频文件 URL
  duration_seconds INT,
  transcription TEXT,                   -- Whisper 转写结果
  transcription_status VARCHAR(20) DEFAULT 'pending', -- pending | processing | completed | failed
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audio_segments_session ON interview_audio_segments(session_id);
```

#### notification_templates（通知模板）
```sql
CREATE TABLE notification_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL UNIQUE,
  channel VARCHAR(20) NOT NULL,         -- 'email' | 'sms'
  subject VARCHAR(500),
  body_template TEXT NOT NULL,          -- 支持 {{变量}} 占位符
  variables JSONB DEFAULT '[]',         -- 可用变量列表
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 需要调整的表

#### interview_sessions 添加候选人访问令牌
```sql
ALTER TABLE interview_sessions ADD COLUMN candidate_token UUID DEFAULT gen_random_uuid();
ALTER TABLE interview_sessions ADD COLUMN token_expires_at TIMESTAMPTZ;
CREATE INDEX idx_sessions_candidate_token ON interview_sessions(candidate_token) WHERE candidate_token IS NOT NULL;
```

#### outreach_records 添加关联字段
```sql
ALTER TABLE outreach_records ADD COLUMN last_message_at TIMESTAMPTZ;
```

---

## 第六部分：接口设计草案（新增接口）

### 6.1 外联发送接口

#### 发送外联消息
```
POST /api/outreach-messages
```
**请求参数**：
```json
{
  "outreach_record_id": "uuid",
  "channel": "email",           // email | sms
  "template_id": "uuid",        // 可选，使用模板
  "content": "自定义内容",       // 不用模板时必填
  "subject": "邮件主题"          // 邮件必填
}
```
**返回结构**：
```json
{
  "code": 200,
  "message": "消息已加入发送队列",
  "data": {
    "id": "uuid",
    "status": "pending",
    "channel": "email"
  }
}
```
**权限**：recruiter, admin

#### 查询发送状态
```
GET /api/outreach-messages?outreach_record_id=uuid&status=sent
```
**权限**：recruiter, admin

#### 通知模板 CRUD
```
GET    /api/notification-templates
POST   /api/notification-templates
PUT    /api/notification-templates/:id
DELETE /api/notification-templates/:id
```
**权限**：admin

### 6.2 候选人面试体验接口（公开，无需后台登录）

#### 通过 Token 获取面试信息
```
GET /api/public/interview/:token
```
**请求参数**：token 在 URL 路径中
**返回结构**：
```json
{
  "code": 200,
  "data": {
    "session_id": "uuid",
    "position_name": "Ego数据采集员",
    "candidate_name": "张三",
    "total_questions": 8,
    "duration_minutes": 30,
    "status": "pending"
  }
}
```
**权限**：公开（Token 验证）

#### 提交面试音频
```
POST /api/public/interview/:token/audio
```
**请求参数**：`multipart/form-data`
- `question_index`: number
- `audio`: audio file (webm/mp4/wav)
**权限**：公开（Token 验证）

#### 完成面试
```
POST /api/public/interview/:token/complete
```
**权限**：公开（Token 验证）

#### 获取面试题目
```
GET /api/public/interview/:token/questions
```
**权限**：公开（Token 验证）

### 6.3 AI 代理接口（增强已有）

#### 触发 Agent 执行任务
```
POST /api/agents/:agentId/execute
```
**请求参数**：
```json
{
  "target_type": "candidate",    // candidate | position | project
  "target_id": "uuid",
  "parameters": {}               // 可选参数
}
```
**返回结构**：
```json
{
  "code": 200,
  "data": {
    "execution_id": "uuid",
    "status": "running",
    "agent_id": "uuid"
  }
}
```
**权限**：recruiter, admin

#### 查询执行结果
```
GET /api/agents/executions/:executionId
```
**权限**：recruiter, admin

---

## 第七部分：开发排期建议

### Phase 1：安全加固 + 关键补全（3-4 周）

| 周次 | 任务 | 交付物 |
|------|------|--------|
| W1 | 模块 A：安全加固（5个问题） | 中间件修复 + 测试 |
| W1 | 模块 E：数据洞察接入真实 API | 前端切换到真实后端 |
| W2 | 模块 B：AI 调用后端代理化 | 后端代理完善 + 前端迁移 |
| W2-3 | 模块 C：外联发送通道 | 邮件/短信集成 + 发送队列 |
| W3-4 | 候选人面试体验接口（后端） | 公开 API + Token 验证 + 音频处理 |
| W4 | 集成测试 + 灰度环境部署 | 可灰度测试的版本 |

**前置依赖**：
- Q3 外联服务商确认（W2 前需确定）
- 灰度测试环境准备

**风险点**：
- 外联服务商审核可能需要时间（企业认证）
- AI 代理化可能影响前端现有功能，需要充分回归测试

**MVP 取舍说明**：
- 外联 MVP 只做邮件，短信可 Phase 2 补充
- 数据洞察 MVP 使用已有后端 API，不做新的复杂图表

---

### Phase 2：AI 面试体验 + 代码质量（5-6 周）

| 周次 | 任务 | 交付物 |
|------|------|--------|
| W5-8 | 模块 D：候选人 AI 面试体验 | 候选人端完整面试流程 |
| W8-9 | 模块 G：代码质量优化 | 组件拆分 + 类型修复 |
| W9-10 | 模块 H：Redis 缓存层 | 缓存策略实现 |
| W10 | 模块 J：CI/CD 配置 | 自动化流水线 |
| W10 | 模块 F：入围名单增强 | 批量操作 + 历史记录 |

**前置依赖**：
- Q1/Q2 面试体验设计确认（W5 前需确定）
- Phase 1 的面试后端接口完成
- Redis 服务准备

**风险点**：
- AI 面试体验是全系统技术难度最高的模块
- 浏览器音频采集在不同设备上兼容性差异大
- 如果做视频录制，复杂度翻倍

**MVP 取舍说明**：
- 面试体验 MVP 先做音频采集 + 文字题目，不做视频
- 候选人端 MVP 用 H5 页面，不做独立小程序

---

### Phase 3：外部集成 + 运营增强（4-5 周）

| 周次 | 任务 | 交付物 |
|------|------|--------|
| W11-13 | 模块 I：外部系统集成 | MIS/OpenClaw 真实对接 |
| W13-14 | 短信通道补充 | 短信发送能力 |
| W14-15 | 高级报表 + 自动化洞察 | 自定义报表 |

**前置依赖**：
- Q4 外部系统 API 文档
- Phase 2 完成后的稳定版本

**风险点**：
- 外部系统 API 文档可能不完善
- 集成调试需要对方团队配合

---

### Phase 4：商业化优化（持续迭代）

- 移动端适配 / 小程序
- AI 面试视频录制增强
- 高级权限（SSO、数据权限隔离）
- 性能压力测试与优化
- 国际化（如有出海需求）
- 付费体系与计费模块

---

## 第八部分：项目目录结构（建议调整）

### 前端新增文件
```
src/
├── modules/
│   ├── outreach/
│   │   ├── components/
│   │   │   └── SendMessageBox.tsx       # 新增：发送消息组件
│   │   └── api.ts                       # 新增发送接口调用
│   ├── interview-experience/            # 新增模块：候选人面试体验
│   │   ├── pages/
│   │   │   └── InterviewExperiencePage.tsx
│   │   ├── components/
│   │   │   ├── AudioRecorder.tsx
│   │   │   ├── QuestionCard.tsx
│   │   │   ├── InterviewTimer.tsx
│   │   │   └── InterviewComplete.tsx
│   │   ├── hooks/
│   │   │   ├── useAudioRecorder.ts
│   │   │   └── useInterviewState.ts
│   │   ├── api.ts
│   │   └── types.ts
│   └── analytics/
│       └── api.ts                       # 修改：切换到真实 API
├── app/
│   └── router/
│       └── AppRouter.tsx                # 新增 /interview/:token 公开路由
└── shared/
    └── lib/
        └── aiClient.ts                  # 新增：替代直接 AI 调用的后端代理客户端
```

### 后端新增文件
```
server/src/
├── modules/
│   ├── outreach/
│   │   ├── outreach.routes.ts           # 修改：添加发送端点
│   │   ├── outreach.service.ts          # 新增：发送逻辑
│   │   ├── channels/
│   │   │   ├── emailChannel.ts          # 新增：邮件发送
│   │   │   └── smsChannel.ts            # 新增：短信发送
│   │   └── templates/
│   │       └── templateEngine.ts        # 新增：模板引擎
│   ├── interview-experience/            # 新增模块
│   │   ├── experience.routes.ts         # 新增：公开面试路由
│   │   ├── experience.service.ts        # 新增：面试流程管理
│   │   └── audioProcessor.ts            # 新增：音频处理 + Whisper 转写
│   └── notifications/                   # 新增模块
│       ├── notifications.routes.ts
│       ├── notifications.service.ts
│       └── queue.ts                     # 发送队列
├── middleware/
│   ├── auth.ts                          # 修改：Fail-Close
│   ├── errorHandler.ts                  # 修改：生产环境隐藏 Stack
│   └── csrf.ts                          # 修改：添加注释 + 防护
└── config/
    └── redis.ts                         # 新增：Redis 配置（Phase 2）
```

### 数据库新增迁移
```
server/src/db/migrations/
├── 026_create_outreach_messages.sql
├── 027_create_interview_audio_segments.sql
├── 028_create_notification_templates.sql
└── 029_add_candidate_token_to_sessions.sql
```

---

## 第九部分：开发执行规则

后续编码阶段严格遵守以下规则：

1. **先列任务再改代码** — 每次开发前用 TodoWrite 列出具体任务
2. **一次只处理一个明确目标** — 不交叉处理多个不相关功能
3. **改动前先说明** — 说明会改哪些文件、为什么改、预期效果
4. **改动后要确认** — 说明完成了什么、还有什么没完成
5. **不伪造已完成** — 未完成功能不能标记为已完成
6. **标注外部依赖** — 第三方 API 或外部服务必须明确标注
7. **增量交付** — 每完成一个模块确认后再进入下一个
8. **保持可运行** — 随时确保项目可编译运行，不积累未完成代码
9. **代码注释中文** — 变量名和函数名英文，注释用中文
10. **配置不硬编码** — 所有配置通过环境变量或配置文件管理

---

## 第十部分：第一步行动建议

**现在最合理的第一步**：修复安全漏洞（模块 A）。

理由：
- 工作量最小（约 2 小时），风险为零
- 立即提升系统安全等级
- 不依赖任何外部确认或团队协作
- 修复后系统可以更安全地进行后续开发和测试

具体步骤：
1. `server/src/middleware/auth.ts` — Fail-Open 改 Fail-Close
2. `server/src/middleware/errorHandler.ts` — 生产环境隐藏 Stack Trace
3. `server/src/middleware/csrf.ts` — 添加设计注释
4. `server/src/middleware/security.ts` — 添加敏感操作速率限制
5. `src/shared/lib/apiClient.ts` — 修复 Token 刷新竞态
6. 运行现有测试确认没有回归
7. Git commit 并标记 tag

---

*本方案由 prd-engineer 技能生成 | 2026-05-26*
