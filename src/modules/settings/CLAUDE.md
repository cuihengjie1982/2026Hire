# CLAUDE.md — 系统管理模块（设置 + Agents + 集成 + 分析）

## 模块概述

系统管理是管理员后台，覆盖 5 个子域：用户与团队管理、角色权限配置、通知设置、AI Agent 管理、系统集成状态。前端入口为 SettingsPage（4 Tab）和 AgentsPage（独立页面）。

注意：尽管导航中「系统管理」包含 agents 和 settings，前端的 `src/modules/agents/` 和 `src/modules/settings/` 是两个独立模块目录。

## 目录结构

```
src/modules/settings/
├── types.ts          # User, Permission, RolePermission, NotificationSetting, TeamMemberInvite
├── api.ts            # 全部 settings API 调用（含 mock）
├── fixtures.ts       # 空 mock + currentUser stub + roleLabels
└── pages/
    └── SettingsPage.tsx   # 4 Tab 设置页（983 行）

src/modules/agents/
├── types.ts          # Agent, AgentConfig, AgentStatus, AgentType, AgentStats, AgentRunResult
├── api.ts            # Agent CRUD + pause/resume/run API
├── fixtures.ts       # 空 mock
└── pages/
    └── AgentsPage.tsx     # Agent 仪表盘（792 行）

src/modules/analytics/
├── types.ts          # InsightMetric, FunnelStep, ChannelQuality, AgentEfficiency
├── api.ts            # getInsightsOverview
├── fixtures.ts       # Mock 洞察数据
├── hooks.ts          # useInsightsOverview
└── pages/
    └── InsightsPage.tsx   # 数据分析看板（354 行）

server/src/modules/
├── settings/settings.routes.ts     # 用户 + 权限 + 角色权限 + 通知 + 邀请（391 行）
├── agents/agents.routes.ts         # Agent CRUD + stats + 执行（214 行）
├── agents/agentExecutor.ts         # LLM 解析/评分/排名 + 自动触发（443 行）
├── integrations/integrations.routes.ts  # 系统状态总览（92 行）
└── analytics/analytics.routes.ts        # 漏斗/渠道/Agent 效率（119 行）

supabase/functions/embox-api/
├── settings/index.ts       # 所有 settings handler（277 行）
└── agent-executor/index.ts # Agent CRUD + 三种 Agent 执行 + 自动触发（436 行）
```

## SettingsPage 4 个 Tab

1. **账号设置 (Account)** — 当前用户信息、修改密码
2. **角色权限 (Permissions)** — 24 个权限项 × 4 个角色的矩阵，toggle 开关
3. **通知设置 (Notifications)** — 按渠道（email/in_app）开关通知
4. **团队管理 (Team)** — 用户列表 CRUD + 邀请成员（email + role）

## 核心 API 端点

### 用户管理
| 端点 | 方法 | 权限 | 用途 |
|------|------|------|------|
| `/api/users` | GET | admin | 用户列表 |
| `/api/users/me` | GET | any | 当前用户信息 |
| `/api/users` | POST | admin | 创建用户（name/email/password/role） |
| `/api/users/:id` | PATCH | admin | 更新用户 |
| `/api/users/:id` | DELETE | admin | 删除用户（profile + Auth admin） |
| `/api/users/reset-password` | POST | admin | 管理员重置他人密码 |

### 权限
| `/api/permissions` | GET | any | 24 个静态权限项列表 |
| `/api/role-permissions` | GET | any | 4 个角色的权限映射 |
| `/api/role-permissions/:role` | PUT | admin | 更新角色权限（stub，返回 updated:true） |

### 通知设置
| `/api/notification-settings` | GET | any | 当前用户通知配置 |
| `/api/notification-settings/:id` | PATCH | any | 开关通知渠道（Edge 校验所有权） |

### 邀请
| `/api/invites` | GET | admin | 邀请列表 |
| `/api/invites` | POST | admin | 创建邀请（UPSERT on email+role） |
| `/api/invites/:email?role=` | DELETE | admin | 删除邀请 |

### Agent 管理
| `/api/agents` | GET | any | Agent 列表（?projectId=, ?page=, ?pageSize=） |
| `/api/agents/stats` | GET | any | 聚合统计（总数/运行中/暂停/审批统计/采纳率） |
| `/api/agents` | POST | recruiter+ | 创建 Agent（type: parser/screener/matcher） |
| `/api/agents/:id` | PATCH | recruiter+ | 更新 Agent |
| `/api/agents/:id/pause` | POST | any | 暂停 Agent |
| `/api/agents/:id/resume` | POST | any | 恢复 Agent |
| `/api/agents/:id/run` | POST | any | 执行 Agent（分发到 runParser/runScreener/runMatcher） |
| `/api/agents/:id` | DELETE | recruiter+ | 删除 Agent |
| `/agent-executor/run` | POST | recruiter+ | Edge Function 专用执行端点 |

### 系统集成
| `/api/integrations/overview` | GET | none | 系统健康状态（AI 配置数/Agent 统计/MinerU 状态） |
| `/api/integrations/sync` | GET | none | 最后同步时间戳 |

### 数据分析
| `/api/insights/overview?timeRange=` | GET | none | 洞察数据（4 KPI + 漏斗 + 渠道质量 + Agent 效率） |

## 数据库表

| 表 | 用途 |
|-----|------|
| `users` / `profiles` | 用户账户（Express 用 users，Edge 用 profiles） |
| `notification_settings` | 用户通知偏好 |
| `team_invites` | 团队邀请（复合主键 email + role） |
| `agents` | AI Agent 配置与统计 |
| `ai_model_configs` | Agent 执行时解析 AI 模型配置 |
| `positions` / `position_details` | Agent 评分时读取 scoring_rules/grade_rules |
| `candidates` | Agent 读取/写入 parsed_info/grade/score_total |

## 关键实现细节

### 权限体系（24 项静态权限 × 4 角色）

| 角色 | 权限数 | 关键区分 |
|------|--------|---------|
| admin | 24（全部） | 含 settings:manage, agents:manage, integrations:manage |
| recruiter | 16 | 可管理候选人/面试/短名单/外联/联系人/培训 |
| hiring_manager | 10 | 查看 + 面试管理 + 审批决定 |
| viewer | 11 | 全部只读 |

权限分类：position(4) / candidate(8) / interview(2) / approval(2) / settings(3) / data(1) / training(2)

### 三种 Agent 执行流程

1. **parser（简历解析）**: LLM 从原始简历文本提取结构化字段 → 更新 `candidates.parsed_info`
2. **screener（简历评分）**: 根据岗位 scoring_rules 评分 → 更新 `candidates.grade` + `score_total`
3. **matcher（候选人排序）**: 对已评分候选人排名 → 返回 Top 5 排序

### Agent 自动触发（候选人导入后）
`autoTriggerForCandidate(candidateId, positionId)` 在候选人导入后异步触发：
- 找到所有 status='running' + config.autoRun=true 的 Agent
- Parser: 全局或匹配岗位 → 候选人无 name 时触发
- Screener: 匹配岗位 → 候选人无 grade 时触发
- 错误静默捕获（fire-and-forget）

### AI 模型配置解析
1. Agent 指定的 `config.aiModelConfigId`（如果 active）
2. 系统默认（is_default=true + is_active=true）
3. 最新创建的 active 配置

### Express 与 Edge 的角色名差异
- Express 用 `interviewer`，Edge Function 用 `hiring_manager`（功能等价）

## 关联模块

- **ai**: agentExecutor 导入 callLLM + promptBuilder，AgentsPage 嵌入 AIModelConfigPage
- **positions**: AgentsPage 导入 listPositions，agentExecutor 读取 scoring_rules
- **candidates**: Agent 读写候选人 parsed_info/grade/score_total
- **auth**: 所有路由依赖 req.user 注入
- **notifications**: Edge Function 的 notifyByRole 通知审批状态
