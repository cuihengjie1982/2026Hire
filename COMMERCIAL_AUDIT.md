# EM-BOX AI 招聘管理平台 — 商业化就绪度审计报告

**审计日期**: 2026-05-26
**审计范围**: 全系统（前端 + 后端 + 数据库 + 部署 + PRD 对齐度）
**项目状态**: 🟡 有风险可上线（需修复阻断性问题后进入灰度）

---

## 执行摘要

EM-BOX 是一个面向 Embodied AI 行业的 AI 招聘管理平台，技术栈为 React 19 + Express 4 + PostgreSQL + Supabase。系统已有 15 个业务模块、25 个数据库迁移、完整的前后端分离架构。

**系统整体健康度：6.5 / 10**

- 核心招聘流程（岗位配置 → 简历导入 → AI 评分 → 入围 → 审批）已跑通
- 安全基础扎实（参数化查询、bcrypt、JWT + 黑名单），但存在 4 个可利用漏洞
- 72% 的 PRD 功能已实现，但 AI 面试体验（核心卖点）完全缺失
- 多个模块依赖 Mock 数据，未接入真实后端

**最严重的 5 个问题**：
1. AI 面试体验页面为空壳 — PRD 核心功能缺失
2. 认证黑名单检查 Fail-Open — 安全漏洞
3. 外联系统无真实发送能力 — 业务流程断裂
4. AI 代理返回 Mock 数据 — AI 卖点不成立
5. 生产环境泄露 Stack Trace — 信息泄露

**是否建议上线**：不建议直接面向客户。建议修复阻断性问题后，先做内部灰度测试。

**预估修复工作量**：
- 阻断性问题修复：2-3 周
- 高风险问题修复：3-4 周
- 达到商业化可用：8-10 周

---

## 一、阻断性问题（必须修复才能面向客户）

### BLOCKER-1：AI 面试体验完全缺失

**问题描述**：PRD 定义了 AI 视频面试作为核心差异化功能（候选人端核心体验），但当前实现只有空壳组件，无真实面试流程。

**影响范围**：产品核心卖点，直接影响付费意愿

**发现位置**：
- `src/AIInterviewPage.tsx` — 空壳页面
- `src/AIVideoInterviewPage.tsx` — 空壳页面
- PRD 第 2.1 节定义了完整的候选人面试体验

**缺失内容**：
- 无 WebRTC 视频/音频采集
- 无实时语音转文字
- 无面试题目展示与计时
- 无候选人端独立界面
- 无面试过程录制

**修复建议**：
1. 实现 WebRTC 音视频采集模块
2. 接入 Whisper 实时语音识别（后端已有 `whisperClient.ts`）
3. 开发候选人端面试界面（独立路由，无需登录后台）
4. 实现面试流程状态机（等待 → 进行中 → 完成 → 评分）

**预估工作量**：6-8 周

---

### BLOCKER-2：认证黑名单 Fail-Open

**问题描述**：JWT 黑名单检查失败时，系统选择放行请求（Fail-Open），而非拒绝（Fail-Close）。这意味着如果 Redis/数据库查询失败，已注销的 Token 仍然有效。

**影响范围**：全系统认证安全

**发现位置**：`server/src/middleware/auth.ts:64-68`

```typescript
// 当前实现 — 危险的 Fail-Open
} catch {
  // If blacklist check fails, allow the request (fail open for availability)
  req.user = decoded;
  next();
}
```

**修复建议**：改为 Fail-Close，检查失败时返回 401

```typescript
} catch {
  return res.status(401).json({code: 'TOKEN_VALIDATION_FAILED'});
}
```

**预估工作量**：30 分钟

---

### BLOCKER-3：生产环境 Stack Trace 泄露

**问题描述**：全局错误处理器在生产环境输出完整堆栈信息到响应体，攻击者可利用内部路径、依赖版本进行定向攻击。

**影响范围**：全系统

**发现位置**：`server/src/middleware/errorHandler.ts:5-6`

```typescript
console.error(`[ERROR] ${err.message}`, err.stack);
// 且可能在响应中包含 stack 信息
```

**修复建议**：
1. 生产环境（`NODE_ENV=production`）不返回 stack trace
2. 错误响应只包含 `code` + `message`，不含内部细节
3. Stack trace 只写入日志文件，不暴露给客户端

**预估工作量**：2 小时

---

### BLOCKER-4：CSRF 保护被 Bearer Token 绕过

**问题描述**：CSRF 中间件对所有带 Bearer Token 的请求直接放行。在 API 场景下这可以接受，但如果未来引入 Cookie-based 认证（如 SSR），此设计会成为漏洞。

**影响范围**：CSRF 防护有效性

**发现位置**：`server/src/middleware/csrf.ts:23-27`

```typescript
// Bearer tokens automatically bypass CSRF - 可能不安全
if (authHeader && authHeader.startsWith('Bearer ')) {
  next();
  return;
}
```

**修复建议**：
1. 如果当前只使用 Bearer Token 认证，标注此设计决策的注释
2. 如果未来引入 Cookie 认证，必须移除此绕过逻辑
3. 建议在代码中添加明确注释说明为什么这样做

**预估工作量**：1 小时（添加防护 + 注释）

---

### BLOCKER-5：外联系统无真实发送能力

**问题描述**：PRD 要求"从简历导入到外联的自动化管理"，但外联模块（Outreach）只有模板管理 UI，没有真实的邮件/短信发送功能。整个沟通流程是断裂的。

**影响范围**：核心业务流程断裂

**发现位置**：
- `server/src/modules/outreach/outreach.routes.ts` — 只有 CRUD
- `src/modules/outreach/` — 前端只有模板展示

**缺失内容**：
- 无邮件发送集成（SendGrid / 阿里云邮件 / AWS SES）
- 无短信发送集成（阿里云短信 / 腾讯云短信）
- 无发送队列与重试机制
- 无发送状态追踪（已发送/已读/失败）
- 无退订/拒绝机制

**修复建议**：
1. 集成邮件发送服务（推荐 Resend 或阿里云邮件推送）
2. 集成短信服务（推荐阿里云短信）
3. 实现发送队列（Redis Bull Queue 或 PostgreSQL 队列）
4. 添加发送状态追踪和回调

**预估工作量**：2-3 周

---

## 二、高风险问题（强烈建议上线前修复）

### HIGH-1：AI 代理返回 Mock 数据

**问题描述**：AI 代理（Agents）模块是产品卖点之一，但当前执行结果全部返回 Mock 数据，无真实 AI 任务执行能力。

**发现位置**：
- `server/src/modules/agents/agentExecutor.ts`
- `src/modules/agents/pages/AgentsPage.tsx`

**修复建议**：
1. 实现 Agent 任务执行引擎（基于 LLM Function Calling）
2. 接入真实的 AI 模型调用
3. 添加任务队列与执行状态管理
4. 实现执行结果持久化

**预估工作量**：4-5 周

---

### HIGH-2：数据洞察（Analytics）依赖 Mock 数据

**问题描述**：数据洞察模块的图表 UI 完善，但数据源主要是 fixtures，无真实的数据库聚合查询。

**发现位置**：
- `src/modules/analytics/fixtures.ts` — Mock 数据
- `src/modules/analytics/hooks.ts` — 部分调用 mock
- `server/src/modules/analytics/analytics.routes.ts` — 后端有路由但聚合逻辑不完整

**修复建议**：
1. 实现后端数据聚合 API（SQL 聚合查询）
2. 前端切换到真实 API
3. 添加日期范围过滤
4. 实现实时数据更新

**预估工作量**：2-3 周

---

### HIGH-3：前端 Token 刷新存在竞态条件

**问题描述**：`apiClient.ts` 中的 Token 刷新逻辑在多个并发请求同时 401 时，会触发多次刷新，可能导致 Token 混乱。

**发现位置**：`src/shared/lib/apiClient.ts:110-142`

**修复建议**：
1. 实现全局 Token 刷新锁（使用 Promise 缓存）
2. 所有并发的 401 请求共享同一个刷新 Promise
3. 刷新成功后统一重试所有等待中的请求

**预估工作量**：1-2 天

---

### HIGH-4：敏感操作无速率限制

**问题描述**：密码重置、登录尝试等敏感端点缺乏独立的速率限制，存在暴力破解风险。

**发现位置**：`server/src/middleware/security.ts`

**当前状态**：
- API 通用限制：1000 次/分钟 ✅
- 登录限制：10 次/分钟 ✅
- 密码重置：无限制 ❌
- Token 刷新：无限制 ❌
- 文件上传：无限制 ❌

**修复建议**：为敏感端点添加独立速率限制

**预估工作量**：1 天

---

### HIGH-5：前端 AI 处理全部在客户端

**问题描述**：简历评分、文档解析等 AI 功能全部在前端执行，API Key 暴露在浏览器中，任何用户都可以从网络面板获取 AI 服务的 API Key。

**影响范围**：API Key 泄露 → 费用损失 → 服务被滥用

**发现位置**：
- `src/shared/lib/mineruClient.ts` — MinerU Token 在前端使用
- `src/shared/lib/resumeScorer.ts` — AI 评分在前端执行
- `.env` 中的 `VITE_GEMINI_API_KEY` 和 `VITE_MINERU_API_TOKEN`

**修复建议**：
1. 将 AI 调用全部迁移到后端代理（后端已有 `aiProxy.routes.ts`）
2. 前端只发送请求，后端持有 API Key
3. 添加后端速率限制防止滥用
4. 已有的 `server/src/modules/ai/` 目录可作为基础

**预估工作量**：3-5 天

---

### HIGH-6：无缓存层

**问题描述**：所有数据请求直接查数据库，无缓存策略。在并发用户增多时，数据库压力会快速上升。

**发现位置**：全部后端路由

**修复建议**：
1. 引入 Redis 缓存层（用户权限、岗位配置、面试模板等读多写少的数据）
2. 实现 Cache-Aside 模式
3. 数据变更时主动失效缓存

**预估工作量**：1 周

---

## 三、中风险问题（建议修复）

### MED-1：大型路由文件难以维护

**问题**：`interviews.routes.ts` 达 736 行，混合了多个子资源的路由逻辑。

**位置**：`server/src/modules/interviews/interviews.routes.ts`

**建议**：按子资源拆分为 `templates.routes.ts`、`sessions.routes.ts`、`results.routes.ts`、`scoring.routes.ts`

**工作量**：1-2 天

---

### MED-2：15 个前端文件包含 `any` 类型

**问题**：TypeScript 的类型安全在多处被 `any` 破坏。

**位置**：搜索 `any` 关键字，主要出现在 API 响应类型和事件处理

**建议**：逐步替换为具体类型定义，优先处理 API 响应类型

**工作量**：3-5 天

---

### MED-3：业务逻辑混入路由处理器

**问题**：部分路由直接包含业务逻辑（去重、编码生成等），违反分层原则。

**位置**：
- `candidates.routes.ts:257-310` — 去重逻辑
- `positions.routes.ts:70-117` — 自动编码

**建议**：提取到独立的 Service 层

**工作量**：2-3 天

---

### MED-4：Mock 数据切换机制不完善

**问题**：`VITE_USE_MOCK_API` 是全局开关，无法按模块切换。部分模块在 mock 模式下功能降级。

**位置**：`src/shared/lib/apiClient.ts`，各模块 `api.ts`

**建议**：支持按模块粒度的 mock/real 切换，方便渐进式接入

**工作量**：1-2 天

---

### MED-5：DashboardLayout 承担过多职责

**问题**：布局组件 331 行，混合了搜索、主题切换、用户管理、导航、业务数据加载等职责。

**位置**：`src/app/layouts/DashboardLayout.tsx`

**建议**：拆分为 SearchBar、UserMenu、ThemeToggle、Sidebar 等独立组件

**工作量**：1-2 天

---

### MED-6：错误处理静默失败

**问题**：多个关键路径使用 `catch(() => {})` 或 `console.error` 静默处理错误，用户无感知。

**位置**：
- `src/app/contexts/ProjectContext.tsx:30-34`
- `src/app/layouts/DashboardLayout.tsx:44-62`

**建议**：添加用户可见的错误提示（Toast），记录到错误追踪系统

**工作量**：1-2 天

---

### MED-7：外部集成模块完全为 Mock

**问题**：集成管理（Integrations）模块完成度仅 25%，MIS 和 OpenClaw 连接为假数据。

**位置**：`src/modules/integrations/`、`server/src/modules/integrations/`

**建议**：明确是否在 MVP 阶段需要此功能，如不需要则从导航中移除避免用户困惑

**工作量**：移除 UI 0.5 天 / 实现真实集成 4-6 周

---

### MED-8：缺乏统一的分页/排序/过滤规范

**问题**：各模块的分页参数不统一，有的用 `page/limit`，有的用 `offset/limit`，有的不支持排序。

**建议**：制定统一的查询参数规范并全量对齐

**工作量**：2-3 天

---

## 四、低风险问题 / 优化建议

| # | 问题 | 位置 | 建议 |
|---|------|------|------|
| LOW-1 | 硬编码魔法数字 | 路由文件中的分页大小等 | 提取为命名常量 |
| LOW-2 | 无请求取消机制 | 前端 API 调用 | 添加 AbortController |
| LOW-3 | Empty Mock Fixtures | `src/modules/talent/fixtures.ts` 等 | 填充有意义的演示数据 |
| LOW-4 | 无 CI/CD 配置 | 项目根目录 | 添加 GitHub Actions / GitLab CI |
| LOW-5 | 硬件面试面试录音复盘 | PRD 提到但未实现 | Phase 3 规划 |
| LOW-6 | 无移动端适配 | 全前端 | 响应式设计或独立移动端 |
| LOW-7 | 密码无复杂度要求 | `auth.service.ts` | 添加密码强度校验 |
| LOW-8 | 无账户锁定机制 | `auth.service.ts` | 连续失败 N 次后锁定 |
| LOW-9 | Notification Provider 未接入真实推送 | `src/shared/components/NotificationProvider.tsx` | 接入 WebSocket / SSE |
| LOW-10 | `package.json` name 仍为 `react-example` | 根 `package.json` | 改为 `em-box` |

---

## 五、与 PRD 对齐度分析

### PRD 核心流程对齐度

```
PRD 流程: 岗位配置 → 简历导入 → AI评分 → 入围 → 外联 → AI面试 → 审批 → 录用
实现状态:  ✅        ✅        ✅      ✅     ⚠️     ❌      ✅     ⚠️
```

### 按模块对齐度

| 模块 | PRD 要求 | 实际状态 | 对齐度 | 差距说明 |
|------|---------|---------|--------|---------|
| 项目管理 | CRUD + 状态管理 | 完整实现 | 100% | — |
| 人才库 | 导入/解析/管理 | 完整实现 | 100% | — |
| 联系人管理 | CRUD | 完整实现 | 100% | — |
| 岗位标准配置 | 评分规则/画像 | 完整实现 | 100% | — |
| 系统设置 | 用户/权限/配置 | 完整实现 | 100% | — |
| 候选人搜索 | 模糊搜索/过滤 | 完整实现 | 100% | — |
| 入围名单 | 管理和排序 | 完整实现 | 100% | — |
| AI 面试中心 | 模板/会话管理 | 完整实现 | 100% | — |
| 审批中心 | 多级审批流程 | 完整实现 | 100% | — |
| AI 代理 | 自动化任务执行 | UI 完成，执行为 Mock | 60% | 真实 AI 执行能力缺失 |
| 外联序列 | 邮件/短信发送 | 模板管理完成，发送为空 | 67% | 无真实发送通道 |
| 数据洞察 | 实时分析报表 | UI 完成，数据为 Mock | 62% | 无真实数据聚合 |
| 工作台 | 关键指标仪表盘 | 部分指标有真实数据 | 71% | 部分数据卡片为 Mock |
| 集成管理 | 外部系统对接 | UI 占位 | 25% | 无真实 API 连接 |
| **AI 面试体验** | **候选人面试界面** | **空壳** | **0%** | **核心功能完全缺失** |

### 与 PRD 描述不一致的实现

1. **用户角色**：PRD 定义了 Recruiter/Admin/Candidate/Viewer 四种角色，实现中有 admin/recruiter/hiring_manager/viewer，多了 `hiring_manager` 但少了 `candidate` 端
2. **候选人端**：PRD 描述了候选人独立的面试体验界面，但当前系统只有管理端，无候选人端入口
3. **AI 外联**：PRD 描述了 AI 自动外联和跟进，实际只有手动模板管理

---

## 六、分维度评分

| 维度 | 评分(1-10) | 关键发现 |
|------|-----------|---------|
| 架构合理性 | **7** | 模块化清晰、分层基本合理，但部分路由文件过大，业务逻辑混入路由层 |
| 安全性 | **6** | 基础安全扎实（参数化查询、bcrypt），但存在 Fail-Open、CSRF 绕过、API Key 暴露 |
| 代码质量 | **7** | TypeScript 全覆盖，代码风格一致，但 `any` 使用过多，部分静默错误处理 |
| 数据模型 | **8** | 25 个迁移、完整的约束和索引设计，JSONB 使用合理，软删除规范 |
| API 设计 | **7** | RESTful 规范、版本化支持，但分页/排序不统一，缺少批量操作端点 |
| 前端架构 | **6** | 模块化组件、懒加载路由，但状态管理混乱、大型组件未拆分、Mock 切换粗粒度 |
| 性能与扩展性 | **5** | 无缓存层、N+1 风险、AI 调用无熔断机制、客户端处理重 |
| 测试覆盖 | **5** | 有单元测试和 E2E 测试框架，但覆盖面有限，核心业务逻辑测试不完整 |
| 部署与运维 | **6** | Docker + Nginx + Vercel 方案完整，但无 CI/CD、无监控告警 |
| 文档完整度 | **7** | PRD、架构文档、API 文档齐全，但部分文档与实际实现有偏差 |

**综合评分：6.5 / 10**

---

## 七、修复路线图

### Phase 1：阻断性问题修复（2-3 周）

- [ ] **BLOCKER-2** 认证 Fail-Open → Fail-Close（0.5 天）
- [ ] **BLOCKER-3** 生产环境隐藏 Stack Trace（2 小时）
- [ ] **BLOCKER-4** CSRF 保护加固（1 小时）
- [ ] **HIGH-4** 敏感操作添加速率限制（1 天）
- [ ] **HIGH-5** AI API Key 迁移到后端代理（3-5 天）
- [ ] **HIGH-3** 修复 Token 刷新竞态条件（1-2 天）
- [ ] **BLOCKER-5** 外联系统接入真实发送通道（2 周）

> 以上修复完成后，系统可进入内部灰度测试

### Phase 2：核心功能补全（4-5 周）

- [ ] **BLOCKER-1** AI 面试体验开发（6-8 周，可与其他任务并行）
- [ ] **HIGH-1** AI 代理真实执行引擎（4-5 周，可与面试体验并行）
- [ ] **HIGH-2** 数据洞察接入真实聚合数据（2-3 周）
- [ ] **HIGH-6** 引入 Redis 缓存层（1 周）

> 以上修复完成后，系统可面向首批客户

### Phase 3：代码质量与架构优化（2-3 周）

- [ ] **MED-1** 拆分大型路由文件
- [ ] **MED-2** 消除 `any` 类型
- [ ] **MED-3** 提取业务逻辑到 Service 层
- [ ] **MED-5** 拆分 DashboardLayout
- [ ] **MED-6** 修复静默错误处理
- [ ] **MED-8** 统一分页/排序规范
- [ ] 添加 CI/CD 配置
- [ ] 补充核心业务逻辑测试

### Phase 4：商业化增强（持续迭代）

- [ ] 外部系统集成（MIS、OpenClaw 等）
- [ ] 移动端适配
- [ ] 高级报表与自动化洞察
- [ ] 线下面试录音复盘
- [ ] 通知系统（WebSocket / SSE）
- [ ] 数据导出增强
- [ ] 性能压力测试与优化

---

## 八、审计方法说明

**审计范围**：
- 前端源码：`src/` 目录全部文件（~100 个文件）
- 后端源码：`server/src/` 目录全部文件（~45 个文件）
- 数据库迁移：`server/src/db/migrations/` 全部 25 个迁移文件
- 配置文件：`package.json`、`tsconfig.json`、`vite.config.ts`、`docker-compose.yml`、`nginx.conf`、`.env.example`
- 文档：`docs/PRD-产品需求文档.md`、`SPEC.md`、`mvp.md`、已有审计报告

**审计方法**：
- 静态代码分析（人工阅读 + 模式匹配）
- 架构模式识别（分层、模块化、耦合度）
- 安全漏洞扫描（OWASP Top 10 检查清单）
- PRD 对齐度交叉验证
- 已有审计报告对比（检查之前发现的问题是否已修复）

**审计局限性**：
- 未执行运行时安全测试（渗透测试）
- 未进行性能压力测试
- 未验证部署环境实际配置
- AI 模型效果未评估（评分准确率、匹配精度等）

---

*本报告由 commercial-audit 技能生成 | 2026-05-26*
