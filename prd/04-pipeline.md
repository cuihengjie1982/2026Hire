# 04 — 招聘推进（短名单 + 外联）

> 导航：招聘推进 `/pipeline` | `AppPageId: pipeline`  
> 关联：[03-candidates.md](./03-candidates.md) · [05-interviews.md](./05-interviews.md) · [06-approvals.md](./06-approvals.md)

## 模块目标与成功指标

| 目标 | 成功指标 |
|------|----------|
| 管理高优先级管道 | 短名单阶段清晰，可批量改状态 |
| 触达候选人 | 可记录外联；可发短信；可发面试邀请生成公开链接 |
| 推进到联系人 | 「推进」创建 contact 并更新 `next_step` |

## 用户故事

1. **作为招募专员**，我在「入围名单」查看 Fit Score / 等级，批量添加或移除候选人。
2. **作为招募专员**，我点击「推进」，选择渠道与原因，把候选人推入联系人漏斗。
3. **作为招募专员**，我发送「面试邀请」，系统创建外联记录 + 面试场次 + `access_token`，并得到面试 URL。
4. **作为招募专员**，我在「沟通记录」登记电话/微信/邮件/短信互动，或选用短信模板发送。

## 功能范围

### 页面 / Tab

| Tab | `?tab=` | UI 文案 |
|-----|---------|---------|
| 入围名单 | `shortlist` | 入围名单 |
| 沟通记录 | `outreach` | 沟通记录 |

容器：`PipelinePage.tsx`。联系人主列表也在候选人中心 Tab，详见 [03](./03-candidates.md)。

### 短名单阶段 — `next_step`

`待处理` → `安排面试` → `发起外联` → `已发面试邀请` → `已录用`

每次变更追加 `status_log` JSONB：`[{status, at}]`。

### 边界与错误态

- 面试邀请：无 active 模板时需失败提示；优先选用 conversational 模板，否则取任意 active 模板
- 短信：无手机号、无 active 模板或网关失败时，记录 failed outreach；HTTP 可能仍返回 200 并在响应体中带错误
- 邮件：可记 `channel=email`，但**无真实发送通道**

## 验收标准

| # | 标准 | 状态 |
|---|------|------|
| AC-1 | 短名单 CRUD + 批量添加/删除/改状态 | **已实现** |
| AC-2 | `status_log` 追加可查历史 | **已实现** |
| AC-3 | 推进创建 contact + 更新 next_step | **已实现** |
| AC-4 | 面试邀请返回可用 `/interview/{token}` 路径 | **已实现** |
| AC-5 | 外联记录 CRUD，按候选人筛选 | **已实现** |
| AC-6 | 腾讯云短信发送，配置齐全时可用 | **已实现** |
| AC-7 | 真实邮件发送，例如 SendGrid | **缺失** |
| AC-8 | 按 Fit Score 自动推荐入围 | **部分**，能力弱，多为手动 |
| AC-9 | 外联打开率/转化率分析看板 | **缺失** |

## 数据实体

| 表 | 用途 |
|----|------|
| `shortlist_entries` | 管道；`status_log` JSONB |
| `outreach_records` | 沟通；channel / status / sms_* |
| `contacts` | 漏斗状态 |
| `sms_templates` | 腾讯云模板映射 |

类型：`src/modules/shortlist/types.ts`、`outreach/types.ts`、`contacts/types.ts`。

## API 面（关键）

| Express | Edge | 说明 |
|---------|------|------|
| `GET/POST /api/shortlist`、`/batch` | `shortlist` | 列表/批量 |
| `POST /api/shortlist/:id/promote` | cross-table / shortlist | 推进 |
| `POST /api/shortlist/:id/interview-invite` | 同左 | 面试邀请 |
| `GET/POST/PATCH/DELETE /api/outreach` | `outreach` | 沟通记录 |
| `POST` sms-gateway `/send` | `sms-gateway` | 发短信 |
| `GET/POST` sms templates | 同左 | 模板；管理端亦有对应 Tab |

注意：Edge 部分 outreach 更新可能用扁平 body；Express 用 RESTful `/:id`。列名以 migration 025 `channel` 为准，旧 `type` 字段风险详见 pipeline 模块 CLAUDE.md。

## 代码入口

| 层 | 路径 |
|----|------|
| 前端 | `src/modules/pipeline/`、`shortlist/`、`outreach/`、`contacts/` |
| Express | `shortlist.routes.ts`、`outreach.routes.ts`、`contacts.routes.ts` |
| Edge | `shortlist/`、`outreach/`、`sms-gateway/`、`cross-table-ops/` |
| 指南 | `src/modules/pipeline/CLAUDE.md` |

## 依赖与跨模块

- **interviews**：invite 创建 `interview_sessions`
- **approvals / employees**：录用时 `hireCandidate` 更新 shortlist/contacts 并建员工档案
- **admin 短信模板**：`/admin?tab=sms-templates`

## 实现状态汇总

| 能力 | 状态 |
|------|------|
| 短名单管道 + 历史 | **已实现** |
| 面试邀请闭环 | **已实现** |
| 沟通记录 + 短信 | **已实现**，可用性依赖云侧配置 |
| 邮件真实发送 | **缺失** |
| 外联效果分析 | **缺失** |

## Open questions

1. 生产短信密钥与签名是否已在 Supabase secrets 配置？未配置时 UX 应明确失败原因。
2. Edge interview-invite 是否仍引用旧列名——接手时用一次真实 invite 验证 PostgREST 写入。
3. 批量「一键发面试邀请」产品是否需要？当前多为单条操作。
