# 09 — 系统管理（设置 / Agents / 集成 / 洞察 / 短信模板）

> 导航：系统管理 `/admin` | `AppPageId: admin`  
> 关联总览：[00-product-overview.md](./00-product-overview.md) · 短信亦服务 [04-pipeline.md](./04-pipeline.md)

## 模块目标与成功指标

| 目标 | 成功指标 |
|------|----------|
| 管控用户与权限 | 四角色 + 24 项权限矩阵可由 admin 查看与调整 |
| AI 可运营 | Agent 的 CRUD 与 Parser/Screener/Matcher 执行；模型配置可用 |
| 可观测 | 洞察漏斗/渠道/Agent 效率；集成健康检查 |
| 短信可配置 | 模板管理对接腾讯云 |

## 用户故事

1. **作为管理员**，我在「系统设置」管理用户、邀请成员、改密/重置密、通知偏好、角色权限。
2. **作为管理员/招募专员**，我在「AI 代理」创建 Parser/Screener/Matcher，暂停/恢复/执行。
3. **作为管理员**，我在「数据洞察」查看招聘漏斗与 Agent 效率。
4. **作为管理员**，我在「集成管理」查看 AI/MinerU/Agent 健康状态；外部 MIS 仍为规划。
5. **作为管理员**，我在「短信模板」维护腾讯云模板 ID 与参数。

## 功能范围

### 页面 / Tab — SystemAdminPage

| Tab | `?tab=` | UI 文案 |
|-----|---------|---------|
| agents | `agents` | AI 代理 |
| insights | `insights` | 数据洞察 |
| integrations | `integrations` | 集成管理 |
| settings | `settings` | 系统设置 |
| sms-templates | `sms-templates` | 短信模板 |

Settings 内再分账号、角色权限、通知、团队，详见 settings CLAUDE。Agents 页可嵌入 AI 模型配置。

Legacy：`agents`/`insights`/`integrations`/`settings` → `admin`。

### Agent 类型

| type | 行为 |
|------|------|
| parser | 简历文本 → parsed_info |
| screener | 按岗位规则评分 → grade/score_total |
| matcher | 已评分候选人排序 Top N |

导入候选人后异步触发 `autoTriggerForCandidate`，fire-and-forget。

### 边界与错误态

- AI Config：admin only；base_url 须 HTTPS、禁内网 IP
- Agent run 无模型配置 → 明确错误
- 集成页同步按钮对 MIS/OpenClaw：**非真实对接**
- 角色名：Express 历史 `interviewer` ≈ Edge `hiring_manager`

## 验收标准

| # | 标准 | 状态 |
|---|------|------|
| AC-1 | 用户 CRUD + 邀请 + 重置密码，限 admin | **已实现** |
| AC-2 | 权限项列表 + 角色映射可展示；PUT 持久化 | **部分**：GET 为静态映射；Express `PUT /api/role-permissions/:role` 为 stub，仅回 `updated: true`，不落库 |
| AC-3 | 通知设置按渠道开关 | **已实现**；投递通道仍部分可用 |
| AC-4 | Agent CRUD + pause/resume/run 真实调 LLM | **已实现** |
| AC-5 | AI 多 Provider 模型配置 | **已实现** |
| AC-6 | Insights 后端聚合 + 前端图表 | **已实现**：`USE_MOCK_API=false` 走 `/api/insights/overview`；Mock 模式才用 fixtures |
| AC-7 | 集成 overview 健康检查 | **已实现** |
| AC-8 | MIS/OpenClaw 真实同步 | **缺失** |
| AC-9 | 短信模板 CRUD + 发送可用 | **已实现**；可用性依赖云侧配置 |
| AC-10 | SSO | **缺失** |

## 数据实体

| 表 | 用途 |
|----|------|
| `users` / `profiles` | Express vs Edge 用户模型差异注意 |
| `notification_settings` | 通知偏好 |
| `team_invites` | 邀请 |
| `agents` | Agent 配置与统计 |
| `ai_model_configs` | LLM Provider |
| `sms_templates` | 短信 |

权限 24 项为静态定义，非全表驱动。

## API 面（关键）

| 域 | Express / Edge |
|----|----------------|
| Users / permissions / invites / notification-settings | `/api/users`…；Edge `settings/` |
| Agents | `/api/agents`；Edge `agent-executor/` |
| Insights | `/api/insights/overview`；Edge `analytics/` |
| Integrations | `/api/integrations/overview`、`/sync` |
| SMS | `sms-gateway` |

前端 settings 常用 `efetch` → `/functions/v1/embox-api/...`，见 settings api。

## 代码入口

| 层 | 路径 |
|----|------|
| 前端 | `src/modules/admin/pages/SystemAdminPage.tsx`、`settings/`、`agents/`、`analytics/`、`integrations/` |
| Express | `settings.routes.ts`、`agents/`、`integrations/`、`analytics/` |
| Edge | `settings/`、`agent-executor/`、`analytics/`、`sms-gateway/` |
| 指南 | `src/modules/settings/CLAUDE.md` |

## 依赖与跨模块

- **candidates / positions**：Agent 读写
- **ai**：llmClient / promptBuilder
- **pipeline**：短信发送
- **全站**：RBAC、通知

## 实现状态汇总

| 能力 | 状态 |
|------|------|
| 设置四 Tab + 用户/邀请 | **已实现** |
| Agents 真实执行 | **已实现**；旧缺口「假 Run」已过时 |
| 模型配置多 Provider | **已实现** |
| Insights 真实聚合 | **已实现**；趋势预测等增强仍 **缺失** |
| 外部系统集成 | **缺失**，现为占位 |
| 短信模板 | **已实现** |
| SSO / 实时推送 | **缺失** |

## Open questions

1. 角色权限矩阵 UI 可改，但 **PUT 不落库**——产品若要「可配置 RBAC」需补持久化表与 Edge 对齐。
2. users vs profiles 双表：改用户删除逻辑时两边都要清。
3. 旧缺口文档 P0「Agent 假数据」已过时——以当前 agentExecutor 为准重新验收。
4. 视频分享从 admin 可跳转 `/video-sharing/manage`，详见 [07-training.md](./07-training.md)，勿与 sms-templates 混淆。
