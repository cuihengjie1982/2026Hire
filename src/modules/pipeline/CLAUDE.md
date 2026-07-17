# CLAUDE.md — 招聘推进模块（短名单 + 外联 + 联系人）

## 模块概述

招聘推进是候选人从「筛选」到「录用」的推进管道，包含三个子模块：

- **短名单 (Shortlist)**: 高优先级候选人的管道管理，跟踪 pipeline 阶段（待处理 → 安排面试 → 发起外联 → 已发面试邀请 → 已录用）
- **外联 (Outreach)**: 候选人沟通记录日志（电话/微信/邮件/短信/面试邀请）
- **联系人 (Contacts)**: 从短名单推进后的中间漏斗（pending → contacted → responded → interview_scheduled → hired/rejected）

前端入口 `/pipeline` 是一个 Tabbed 页面（短名单 | 沟通记录），联系人页独立路由。

**完整招聘推进流程**：
```
候选人 → 加入短名单 → 推进（创建联系人 + 更新 pipeline 阶段）
  → 发送面试邀请（创建外联记录 + 面试场次 + access_token）
  → 候选人参加 AI 面试 → 评分 → 审批 → 确认录用
  → cross-table-ops: 更新联系人/短名单 → 创建员工档案
```

## 目录结构

```
src/modules/pipeline/
└── pages/PipelinePage.tsx          # Tabbed 包装（短名单 | 沟通记录）

src/modules/shortlist/
├── types.ts                        # ShortlistEntry, CreateShortlistEntryInput
├── api.ts                          # CRUD + batch + promote + interview-invite
├── fixtures.ts                     # 空 mock
└── pages/ShortlistPage.tsx         # 短名单主页面（含候选人详情 Modal、面试邀请弹窗）

src/modules/outreach/
├── types.ts                        # OutreachRecord, CommChannel, CommStatus, SmsTemplate, SendSmsInput
├── api.ts                          # CRUD + sendSms + templates
├── fixtures.ts                     # 空 mock
├── hooks.ts                        # useOutreach() hook
└── pages/OutreachPage.tsx          # 沟通记录页面（含 SMS 模板选择）

src/modules/contacts/
├── types.ts                        # Contact, ContactChannel, ContactStatus
├── api.ts                          # CRUD
├── fixtures.ts                     # 空 mock
└── pages/ContactsPage.tsx          # 联系人管理页面

server/src/modules/
├── shortlist/shortlist.routes.ts   # Express 路由（含 interview-invite）
├── outreach/outreach.routes.ts     # Express 路由
└── contacts/contacts.routes.ts     # Express 路由

supabase/functions/embox-api/
├── shortlist/index.ts              # 短名单 handler（含 interview-invite）
├── outreach/index.ts               # 外联 handler
├── contacts/index.ts               # 联系人 handler
├── sms-gateway/index.ts            # 腾讯云短信发送
├── _shared/smsClient.ts            # 腾讯云 SMS API 客户端
└── cross-table-ops/index.ts        # shortlistInterviewInvite, shortlistPromote, hireCandidate
```

## 数据库表

| 表 | 用途 | 关键字段 |
|-----|------|---------|
| `shortlist_entries` | 短名单管道 | candidate_id, position_id, project_id, fit_score, grade, next_step, status_log (JSONB) |
| `outreach_records` | 沟通记录 | candidate_id, channel (wechat/email/phone/interview/other/sms), status, content, sms_provider_ref, sms_status |
| `contacts` | 联系人漏斗 | candidate_id, outreach_person, channel, reason, status (pending→contacted→responded→interview_scheduled→hired/rejected) |
| `sms_templates` | 短信模板 | name, template_id (腾讯云), sign_name, content, parameters (JSONB), is_active |

## 核心 API 端点

### 短名单
| 端点 | 方法 | 用途 |
|------|------|------|
| `GET /api/shortlist?projectId=&positionId=` | GET | 短名单列表（分页） |
| `POST /api/shortlist` | POST | 添加单个候选人 |
| `POST /api/shortlist/batch` | POST | 批量添加（`{entries: [...]}`） |
| `DELETE /api/shortlist/batch` | DELETE | 批量移除（`{ids: [...]}`） |
| `PATCH /api/shortlist/batch/status` | PATCH | 批量更新阶段（带 history） |
| `GET /api/shortlist/:id/history` | GET | 状态变更历史 |
| `POST /api/shortlist/:id/promote` | POST | 推进 pipeline 阶段；含 outreach 字段时原子创建联系人 |
| `POST /api/shortlist/:id/interview-invite` | POST | 发送面试邀请（创建外联+面试场次+access_token） |

### 外联
| `GET /api/outreach?candidate_id=` | GET | 沟通记录列表 |
| `POST /api/outreach` | POST | 创建沟通记录 |
| `PATCH /api/outreach/:id` | PATCH | 更新记录（channel/content/status） |
| `DELETE /api/outreach/:id` | DELETE | 删除记录 |

### 短信
| `POST /sms-gateway/send` | POST | 发送短信（腾讯云） |
| `GET /sms-gateway/templates` | GET | 短信模板列表 |
| `POST /sms-gateway/templates` | POST | 创建模板（admin） |

### 联系人
| `GET /api/contacts?project_id=&candidate_id=` | GET | 联系人列表 |
| `POST /api/contacts` | POST | 创建联系人（应用层查重） |
| `PATCH /api/contacts` | PATCH | 更新联系人字段（outreachPerson/channel/reason/status） |
| `DELETE /api/contacts/:id` | DELETE | 删除联系人 |

路由别名：短名单 `/api/shortlist` + `/api/v1/shortlist`；外联 `/api/outreach-records` + `/api/outreach` 双前缀

## 关键类型

```typescript
// 短名单
ShortlistEntry = {
  id, candidateId, candidateName, role,
  positionId, positionName, projectId, projectName,
  fitScore, grade: 'A'|'B',
  nextStep: '待处理'|'安排面试'|'发起外联'|'已发面试邀请'|'已录用'
};

// 外联
CommChannel = 'wechat' | 'email' | 'phone' | 'interview' | 'other' | 'sms';
CommStatus = 'pending' | 'contacted' | 'responded' | 'failed';

// 联系人
ContactChannel = 'wechat' | 'email' | 'phone';
ContactStatus = 'pending' | 'contacted' | 'responded' | 'interview_scheduled' | 'hired' | 'rejected';
```

## 关键实现细节

### status_log 追加审计（JSONB）
`shortlist_entries.status_log` 是仅追加的审计轨迹。每次 `next_step` 变更时追加 `{status, at: ISO timestamp}`：

**Express（SQL）：**
```sql
status_log = COALESCE(status_log, '[]'::jsonb) || $2::jsonb
```

**Edge Function：** 使用 `_shared/shortlistStatusLog.ts` 的 `createInitialLog()` / `appendToLog()`。**禁止**对 JSONB 列 insert 时使用 `JSON.stringify([...])` 字符串；应传 JS 数组。`appendToLog()` 会规范化 legacy 字符串数据。

### 面试邀请自动创建流程
1. 获取短名单条目 → 创建 outreach_records（type=interview_invite）
2. 更新 shortlist next_step = '已发面试邀请' + 追加 status_log
3. 自动选择面试模板（优先 conversational → 任意 active 模板）
4. 创建 interview_sessions（access_token = crypto.randomUUID()）
5. 返回 `{interviewUrl: '/interview/{token}'}` → 前端跳转

### 推进到联系人
点击「推进」→ 弹窗收集 channel + reason → 单次 `promoteShortlistEntry(id, { nextStep: '发起外联', outreachPerson, channel, reason })` → 后端原子创建 contact + 更新 shortlist → 成功横幅（含联系人页链接）。

详见 [docs/PIPELINE_OUTREACH_FIX.md](../../../docs/PIPELINE_OUTREACH_FIX.md)。

### 短信发送（腾讯云）
1. 校验候选人手机号 → 获取模板（is_active=true）
2. 调用腾讯云 SMS API（`yun.tim.qq.com`，SHA-256 签名）
3. 成功：创建 outreach record（channel=sms, sms_status='sent', sms_provider_ref=sid）
4. 失败：创建 outreach record（status='failed', sms_status='failed'），返回 HTTP 200 含错误

### Express vs Edge Function 路径差异
- Express: `PATCH /:id/status`（RESTful 路径参数）
- Edge Function: `PATCH /outreach` with `{id, status}` in body（扁平 body 路由）

### 注意：outreach schema 可能不一致
Edge Function 的 interview-invite handler 引用旧列名（`type`, `subject`, `candidate_email`），而 migration 025 已将列改为 `channel`。PostgREST 可能静默丢弃未知列。

## 关联模块

- **candidates**: 候选人数据源，shortlist_entries 通过 candidate_id 引用
- **positions**: 岗位数据源，shortlist_entries 通过 position_id 引用
- **projects**: 组织分组，联系人和短名单均可按 project_id 筛选
- **interviews**: interview-invite 创建 interview_sessions，auto-resolve interview_templates
- **approvals**: cross-table-ops hire-candidate 更新审批状态并级联到联系人/短名单
- **employees**: hire-candidate 创建 employee_profiles，关闭录用循环
- **sms-gateway**: 腾讯云短信发送子模块
- **cross-table-ops**: 多表原子操作（shortlistInterviewInvite, ~~shortlistPromote 已废弃~~, hireCandidate）
- **navigation**: navigateToPage() 用于面试邀请和推进后的页面跳转
