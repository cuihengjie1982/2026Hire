# EM-BOX 前端代码功能审查报告

> 审查日期：2026-07-14  
> 基线：`docs/FRONTEND_TEST_PLAN.md`（2026-05-28）核心 🔴/🟡 用例  
> 对照：`docs/鍔熻兘缂哄け涓庝紭鍏堢骇鍒嗘瀽.md`（磁盘编码名；内容标题为「功能缺失与优先级分析」，2026-05-06）  
> 方法：静态代码审查（Mock 优先）；代码为准，文档为线索  
> 范围：前端功能完整性；不改业务代码  
> **详细修复建议（含代码级改法与验收）**：[`docs/FRONTEND_FEATURE_REVIEW_FIXES.md`](./FRONTEND_FEATURE_REVIEW_FIXES.md)

---

## Phase 0 — 审查导读

### 0.1 请求生命周期

```
页面组件
  → modules/*/api.ts（mapper + USE_MOCK_API 双路径）
    → fetchJson('/api/...')  或  模块内 efetch('/functions/v1/embox-api/...')
      → src/shared/lib/apiClient.ts::buildApiUrl
        → Dev：Vite 代理 /api → Express :4000
        → Prod：/api/* → /functions/v1/embox-api/api/*
```

关键约定：

| 项 | 位置 | 说明 |
|----|------|------|
| Mock 开关 | `src/shared/lib/runtime.ts` | `USE_MOCK_API = VITE_USE_MOCK_API !== 'false'`（默认 true） |
| Token | `em-box.auth-token` | `fetchJson` 自动附加；`efetch` 需各自实现 |
| 项目上下文 | `src/app/contexts/ProjectContext.tsx` | `em-box.selected-project-id` |
| 导航 | `src/navigation.ts` + `src/app/navigation.tsx` | 8 主模块 + LEGACY_MAP |

### 0.2 模块 → 页面 → API → 后端映射

| 模块 | 路由 | 页面文件 | API 文件 | 后端（Express / Edge） |
|------|------|----------|----------|------------------------|
| 工作台 | `/` | `src/modules/dashboard/pages/DashboardPage.tsx` | 无独立 api（调 interviews + raw stats） | `/stats/dashboard` |
| 项目管理 | `/projects?tab=projects\|positions` | `ProjectManagePage` → `ProjectsPage` / `PositionConfigPage` | `projects/api.ts`, `positions/api.ts` | projects / positions |
| 候选人中心 | `/candidates?tab=talent\|search\|contacts` | `CandidateCenterPage` → TalentPool / CandidateSearch / Contacts | `talent/api.ts`, `candidates/api.ts`, `contacts/api.ts` | candidate-ops / contacts |
| 招聘推进 | `/pipeline?tab=shortlist\|outreach` | `PipelinePage` → ShortlistPage / OutreachPage | `shortlist/api.ts`, `outreach/api.ts` | shortlist / outreach / sms-gateway |
| AI 面试 | `/interviews?tab=*` | `InterviewCenterPage` + `AIVideoInterviewPage.tsx` | `interviews/api.ts` | interviews / interview-scoring |
| 公开面试 | `/interview/:token` | `CandidateInterviewEntry`, `PublicConversationInterviewPage` | `interviews/api.ts` public* | public-interview / public-conversation |
| 审批中心 | `/approvals` | `ApprovalsRoute` → `src/ApprovalsPage.tsx` | `approvals/api.ts` | approvals / cross-table-ops |
| 培训学堂 | `/training` + 公开路由 | `TrainingAcademyPage` 等 | `training/api.ts` | training |
| 员工档案 | `/employees` | `EmployeeManagementPage` | `employees/api.ts` | employees |
| 系统管理 | `/admin?tab=*` | `SystemAdminPage` → Agents / Insights / Integrations / Settings / SmsTemplate | 各子模块 api | agent-executor / analytics / settings |

入口：`src/main.tsx` → `src/app/router/AppRouter.tsx`（lazy + `DashboardLayout`）。

### 0.3 前端特有风险总览

1. **USE_MOCK_API 双路径**：多数 `api.ts` 有分支；例外见下文（`reparseCandidate`、Mock 审批状态机）。
2. **snake_case ↔ camelCase**：读侧 mapper 普遍存在；写侧部分 POST 直接传 camelCase（shortlist `addToShortlist`）。
3. **fetchJson vs efetch**：employees / analytics 走 `fetchJson`；talent / shortlist / interviews / approvals / settings 等多用本地 `efetch` 直打 Edge；shortlist 在 `USE_MOCK_API=false` 时**从不**走 Vite `/api` 代理。

---

## Phase 1 — 功能覆盖矩阵

基线：`FRONTEND_TEST_PLAN.md` 中「核心功能 ✅」且风险 🔴/🟡 的用例。判定定义：

| 判定 | 含义 |
|------|------|
| Covered | UI + API mock/real 均可达，行为符合预期 |
| Partial | 主路径存在，但缺边角、Mock 不一致、或路由/响应未接线 |
| Missing | API 或 UI 缺失，核心路径不可用 |
| Deviated | 已实现但与测试方案/产品预期路径不一致 |
| Outdated | 测试方案或旧缺口文档描述已过时 |

### 1.1 汇总计数（核心 🔴/🟡）

| 判定 | 数量 | 说明 |
|------|------|------|
| **Covered** | **78** | 登录刷新、项目/岗位 CRUD、候选人导入搜索、模板/场次 CRUD、评分提交、审批列表、培训核心 Tab、Agents/用户 CRUD 等 |
| **Partial** | **31** | 面试邀请链路、短名单批量、Dashboard Mock 统计、Insights 筛选、Mock 审批录用、角色权限持久化等 |
| **Missing** | **9** | 预览独立路由、邀请响应丢弃 session、短名单历史 UI、批量添加 UI、改密真实 API、集成「立即同步」、hire→员工自动刷新等 |
| **Deviated** | **6** | `/interviews/preview` pushState、legacy `navigateToPage` 无 `?tab=`、shortlist 始终 EF URL、decide 用 PATCH 非 cross-table-ops 等 |
| **Outdated** | **12** | 旧缺口文档将面试体验标 0%、Agents/Outreach 仍标半成品等（对照代码已明显推进） |

> 合计审查条目：**136**（核心 🔴/🟡）；非核心 🟢 未逐条展开。

### 1.2 高风险核心用例明细（摘录）

#### 认证 / 导航

| # | 用例 | 判定 | 证据 |
|---|------|------|------|
| 2,8,9,10 | 真实登录 / Token 刷新 / 未登录跳转 | Covered | `apiClient.ts` 401→refresh；路由守卫在 layout/auth |
| 14,19 | 工作台加载 / 8 导航 | Covered | `AppRouter.tsx`, `navigation.tsx` |
| 15–17 | KPI / 空数据 / 卡片跳转 | Partial | Mock 下 `DashboardPage` 聚合 stats 为 null，计数常为 0 |

#### 项目 / 岗位

| # | 用例 | 判定 | 证据 |
|---|------|------|------|
| 30–36,40–43,46–51 | 项目/岗位 CRUD、画像、权重、Grade | Covered | `ProjectsPage`, `PositionConfigPage`, `positions/api.ts` |
| 52–53 | MD 导入 | Covered（实现存在；测试方案标非核心） | `PositionConfigPage` 导入导出 |

#### 候选人

| # | 用例 | 判定 | 证据 |
|---|------|------|------|
| 57–60,64,76–79,88,92 | 列表/导入/详情/删除/搜索 | Covered | `talent/api.ts`, `CandidateSearchPage`, `TalentPoolPage` |
| 74 | 导入后 autoRun | Covered（后端异步；前端不阻塞） | 导入 EF + agent-executor |
| 90 | CSV 导出 | Partial | Mock 抛错（`candidates/api.ts`） |
| — | 重新解析简历 | Missing（真实模式） | `reparseCandidate` **无** `USE_MOCK_API` 分支，始终写 localStorage（`talent/api.ts:193-230`） |
| 104 | 批量加入短名单 | Missing（UI） | `batchAddToShortlist` 有 API，Shortlist/Search 页未接线 |

#### 招聘推进

| # | 用例 | 判定 | 证据 |
|---|------|------|------|
| 102–103,107 | 列表/添加/推进 | Covered | `ShortlistPage`, `shortlist/api.ts` |
| 105–106,108 | 移除/批量状态 | Partial / Missing | 批量 API 存在，页面未调用 `batchRemove` / `batchUpdate` |
| 109 | 发送面试邀请 | **Partial + Deviated** | API 调用有；丢弃 session URL；导航错误（见 Phase 2） |
| 110 | 状态历史 | Missing（UI） | `getShortlistHistory` 无页面引用 |
| 112–113,115,117 | 外联 CRUD / SMS | Covered | `OutreachPage`, `outreach/api.ts` |

#### AI 面试

| # | 用例 | 判定 | 证据 |
|---|------|------|------|
| 120–134,137–138 | 模板/题目/场次 CRUD | Covered | `InterviewCenterPage` tabs + `interviews/api.ts` |
| 139,143 | 开始面试 / 页面加载 | **Deviated / Missing** | `InterviewManagementPage:149-151` pushState `/interviews/preview?...`，**AppRouter 无该 Route** → 易 404 |
| 156–159 | 提交评分 / 聚合保存 | Covered | `AIVideoInterviewPage` → `submitAnswerAudio` / `aggregateInterviewResults` |
| 160 | 提交审批 | Covered（真实依赖后端聚合旁路创建） | preview 无 session 走 `createInterviewResult` |

#### 审批 / 员工

| # | 用例 | 判定 | 证据 |
|---|------|------|------|
| 176–179,182–183 | 待审/批准/驳回/录用 | Covered（真实）；**Partial（Mock）** | `ApprovalsPage`; Mock hire 查错 store（见 Phase 2） |
| 187–189 | 角色权限 | Covered（API 层）；UI 按钮未按角色隐藏属 Partial | Edge/Express requireRole |
| — | 录用→员工档案可见 | Partial | 后端 `hire-candidate` 建档；前端不跳转/不刷新 employees |

#### 培训 / 管理

| # | 用例 | 判定 | 证据 |
|---|------|------|------|
| 190–201,203 | 课程/注册/分析/门户 | Covered | `TrainingAcademyPage` 5 Tab |
| 205–214,225–244 | Agents / 用户 / 邀请 | Covered | `SystemAdminPage` |
| 216–220 | 洞察筛选 | Partial | 项目/岗位/自定义日期 UI 未传 API |
| 221–223 | 集成同步 | Partial | 「立即同步」为前端假延迟 |

### 1.3 与旧缺口文档 Delta（2026-05-06 → 2026-07-14）

| 旧文档结论 | 当前代码结论 | Delta |
|------------|--------------|-------|
| AI 面试体验 0%（占位） | `InterviewPreviewPage` + `AIVideoInterviewPage` 完整评分流水线 | **已实现**；但**路由接线错误**仍阻断主入口 |
| Agents 60% / 真实 AI 处理弱 | Agents CRUD + run + autoRun 已接线 | **明显改善**；统计多为客户端聚合 |
| Outreach 67% / 邮件短信弱 | SMS gateway + 模板页已有 | **改善**；邮件仍偏 .eml/记录型 |
| Integrations 25% 占位 | 有 overview + fallback | **仍半成品**（同步假、映射静态） |
| Dashboard 71% | 真实有 stats；Mock KPI 空 | **仍 Partial** |
| Shortlist/Interview/Approvals「完整」 | 主 CRUD 完整，但邀请→面试→Mock 录用有断点 | **旧文档过于乐观** |

---

## Phase 2 — P0 招聘主链路 Click-Path（Mock 静态）

### 2.1 共享状态

| Store / Context | 关键字段 | 危险副作用 |
|-----------------|----------|------------|
| `ProjectContext` | `selectedProject` | 切换项目刷新多数列表 |
| localStorage mock 数组 | shortlist / approvals / candidates / employees | **互不联动**（hire 不写 employees mock） |
| URL searchParams | tab / templateId / sessionId | pushState 到未注册 path 会丢 React 树 |

### 2.2 Touchpoint 审计

#### T1 — 简历导入

```
TOUCHPOINT: 导入简历 (ResumeImportModal)
  HANDLER: importResumes()
  READS: 文件 / 选中岗位 / ProjectContext
  WRITES: candidates mock/localStorage 或 EF candidate-ops
  EXPECTED: 列表刷新，可选 autoRun
  VERDICT: OK（Covered）；真实模式逐条导入，单条失败不回滚前序
```

#### T2 — 加入短名单

```
TOUCHPOINT: 加入短名单 (CandidateSearchPage ~726-764)
  HANDLER: addToShortlist(input)
  WRITES: shortlist store / EF POST（body 为 camelCase）
  EXPECTED: Pipeline 短名单可见
  VERDICT: OK；TalentPool 无此按钮（须走搜索 Tab）— UX Partial
```

#### T3 — 推进（联系人）

```
TOUCHPOINT: 推进 (ShortlistPage ~139-166)
  HANDLER: createContact() → promoteShortlistEntry()
  WRITES: contacts + shortlist.nextStep
  RISK: Sequential — promote 失败则联系人孤儿
  VERDICT: BUG 风险（无事务/补偿）
```

#### T4 — 发送面试邀请 ⚠️ P0

```
TOUCHPOINT: 发送邀请 (ShortlistPage:501-510)
  HANDLER:
    1. sendShortlistInterviewInvite(...) → 返回 ShortlistEntry（丢弃 session/token）
    2. content 硬编码链接 /interviews/preview?candidate=&position=（无 sessionId）
    3. navigateToPage('ai-interview-preview') → LEGACY_MAP → /interviews（无 ?tab=preview）
  EXPECTED: 生成可进入的面试 session 链接并进入面试 UI
  ACTUAL: Mock 仅改 nextStep；真实响应的 interviewUrl 未用；导航落在模板 Tab；独立 path 未注册
  VERDICT: BUG — 主链路断裂
```

引用：

- `src/modules/shortlist/pages/ShortlistPage.tsx:501-510`
- `src/modules/shortlist/api.ts:99-119`（返回类型仅为 `ShortlistEntry`）
- `src/navigation.ts:45-50`（`ai-interview-preview` → `interviews`）
- `src/app/router/AppRouter.tsx:123`（仅 `/interviews`）

#### T5 — 从场次管理进入面试 ⚠️ P0

```
TOUCHPOINT: 开始面试 (InterviewManagementPage:134-151)
  HANDLER: updateSessionStatus → pushState('/interviews/preview?sessionId=...')
  EXPECTED: 打开 AIVideoInterviewPage 带 session
  ACTUAL: 无 Route 匹配 /interviews/preview → NotFound 或错误页
  正确路径应为: /interviews?tab=preview&templateId=&sessionId=&candidateId=
  VERDICT: BUG — 路由 Deviated
```

注：`InterviewCenterPage` 已有 `tab=preview` 嵌入 `InterviewPreviewPage` → `AIVideoInterviewPage`，能力存在，入口 URL 写错。

#### T6 — 答题评分 / 聚合

```
TOUCHPOINT: 确认提交 / 完成 (AIVideoInterviewPage)
  HANDLER: submitAnswerAudio → aggregateInterviewResults | createInterviewResult
  READS: URL sessionContext / MediaRecorder blob
  WRITES: answer_scores / results /（后端）approval_requests
  Mock: getInterviewSession 恒 null；评分可本地模拟
  VERDICT: 组件内 OK；依赖 T4/T5 正确进入
```

#### T7 — 审批决定

```
TOUCHPOINT: 批准/驳回 (ApprovalsPage:53-78)
  HANDLER: decideInterviewApproval → loadInterviewApprovals()
  Mock: 仅原地改 status，不搬到 history store
  UI: pending 过滤 status==='pending' → 批准后离开待审（OK）
  VERDICT: 真实 OK；Mock 与 history 列表不一致
```

#### T8 — 确认录用 ⚠️ P0（Mock）

```
TOUCHPOINT: 确认录用 (ApprovalsPage:80-90)
  HANDLER: hireCandidate(id) → loadInterviewApprovals()
  Mock (approvals/api.ts:171-178):
    在 interviewApprovalHistoryData 中查找
    但 decide 后记录仍在 interviewApprovalRequestsData
  EXPECTED: status=hired + 员工档案
  ACTUAL (Mock): throw 'Approval request not found'；employees mock 不更新
  真实: POST cross-table-ops/hire-candidate（OK）
  VERDICT: Mock 状态机 BUG；真实依赖后端
```

#### T9 — 员工档案查看

```
TOUCHPOINT: /employees 列表
  HANDLER: listEmployees on mount
  EXPECTED: 录用后可见新员工
  ACTUAL: 审批页无跳转/事件；需手动进入；Mock 永远看不到 hire 结果
  VERDICT: Partial
```

### 2.3 P0 链路健康度

```
导入 ✅ → 短名单 ✅ → 推进 ⚠️(孤儿风险) → 面试邀请 ❌
  → 进入面试 ❌(路由) → 评分 ✅(若手动 ?tab=preview) → 审批 ✅(真实)
  → 录用 ✅(真实) / ❌(Mock) → 员工档案 ⚠️(无自动刷新)
```

| 环节 | Mock | 真实 API（前端侧） |
|------|------|-------------------|
| 导入→短名单 | 通 | 通（EF） |
| 面试邀请→可答卷 | 断 | 断（响应未接线 + URL） |
| 管理页开始面试 | 断 | 断（同路由） |
| 评分→审批 | 通（本地结果） | 通（若已有 session） |
| 审批→录用→员工 | 断 | 通（后端）；UI 弱 |

---

## Top 10 下周修复（优先级）

| # | 优先级 | 项 | 建议 |
|---|--------|-----|------|
| 1 | **P0** | 修复面试入口路由 | 统一为 `/interviews?tab=preview&...`；或注册 `/interviews/preview` Route；改 `InterviewManagementPage` + Shortlist 邀请链接 |
| 2 | **P0** | 接线面试邀请响应 | `sendShortlistInterviewInvite` 解析 `interviewUrl`/`access_token`/`sessionId`；邮件内容用真实链接；Mock 创建假 session |
| 3 | **P0** | 修复 Mock 审批→录用状态机 | `decide` 时迁入 history；`hireCandidate` 同时查 requests+history；可选写入 employees mock |
| 4 | **P1** | `reparseCandidate` 双路径 | 增加 `USE_MOCK_API` 守卫；真实模式调 candidate-ops 更新 |
| 5 | **P1** | Shortlist 开发路径 | 与 Express `/api/shortlist` 对齐，或文档明确「短名单仅 EF」 |
| 6 | **P1** | 推进事务性 | contact+promote 失败补偿或后端原子 API |
| 7 | **P1** | Legacy `navigateToPage` 带 tab | `insights/settings/agents` → `/admin?tab=`；`ai-interview-preview` → `?tab=preview` |
| 8 | **P1** | 短名单批量/历史 UI | 接线已有 `batch*` / `getShortlistHistory`，或从测试方案降级为非核心 |
| 9 | **P2** | Dashboard Mock KPI | Mock 分支聚合 sidebar 计数，避免空工作台 |
| 10 | **P2** | 设置改密 / 集成同步 / Insights 筛选 | 接真实 API 或隐藏假按钮，避免「点了以为成功」 |

---

## 前端特有风险清单

### Mock 双路径

| 问题 | 位置 |
|------|------|
| `reparseCandidate` 无真实分支 | `talent/api.ts:193-230` |
| Mock hire 查错数组 | `approvals/api.ts:171-178` |
| Mock invite 不建 session | `shortlist/api.ts:109-115` |
| `getInterviewSession` Mock 恒 null | `interviews/api.ts` |
| Dashboard Mock 无 stats | `DashboardPage.tsx` |
| CSV 导出 Mock 抛错 | `candidates/api.ts` |

### snake_case / camelCase

| 问题 | 位置 |
|------|------|
| shortlist POST 直接传 camelCase input | `shortlist/api.ts:78` |
| talent import body 混用 snake + camel | `talent/api.ts` 导入段 |
| 读侧 mapper 大多健全 | interviews / approvals / employees / positions |

### fetchJson vs efetch

| 模块 | 模式 | 风险 |
|------|------|------|
| employees, analytics | `fetchJson('/api/...')` | Prod 经 `buildApiUrl` 改写 EF — 正常 |
| talent, interviews, approvals, settings, agents, training | 本地 `efetch` | 绕过 `buildApiUrl`；需自带 Auth |
| shortlist | **硬编码** `${API_BASE_URL}/functions/v1/embox-api/api/shortlist` | 本地 Express 开发时 shortlist **不通**（除非本地也跑 Supabase EF） |
| dashboard stats | raw `fetch` EF | Mock 跳过；无统一错误处理 |
| training portal | 页面内 ad-hoc fetch | 与 api.ts 不一致 |

---

## 审查结论

- **产品面**：8 模块骨架与大部分 CRUD **已落地**；旧「功能缺失」文档对面试体验/Agents 的判断 **过时**。
- **主链路**：P0 闭环在「面试邀请 → 进入可评分会话」处 **前端断裂**（路由 + 响应丢弃）；Mock 录用状态机 **不可用**。
- **建议下一周**：只修表中 P0×3，即可显著恢复「候选人→录用」演示/联调路径；其余 P1/P2 按环境（Mock vs 真实）分批。

---

## 附录：关键文件索引

```
src/app/router/AppRouter.tsx
src/navigation.ts
src/shared/lib/apiClient.ts
src/shared/lib/runtime.ts
src/modules/shortlist/pages/ShortlistPage.tsx
src/modules/shortlist/api.ts
src/modules/interviews/pages/InterviewManagementPage.tsx
src/modules/interviews/pages/InterviewCenterPage.tsx
src/AIVideoInterviewPage.tsx
src/ApprovalsPage.tsx
src/modules/approvals/api.ts
src/modules/talent/api.ts
docs/FRONTEND_TEST_PLAN.md
docs/鍔熻兘缂哄け涓庝紭鍏堢骇鍒嗘瀽.md
```
