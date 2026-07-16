# 06 — 审批中心

> 导航：审批中心 `/approvals` | `AppPageId: approvals`  
> 关联：[05-interviews.md](./05-interviews.md) · [08-employees.md](./08-employees.md) · [04-pipeline.md](./04-pipeline.md)

## 模块目标与成功指标

| 目标 | 成功指标 |
|------|----------|
| 面试结果可决策 | pending 列表可批准/驳回，并可填写评语 |
| 录用闭环 | 「确认录用」更新联系人/短名单并创建员工档案 |
| 可追溯 | 已通过/历史可查；通知相关角色 |

## 用户故事

1. **作为用人经理**，我在「待审批」查看候选人面试分数、等级、维度得分，批准或驳回。
2. **作为用人经理**，我在「已通过」对候选人点击「确认录用」，完成入职触发。
3. **作为招募专员**，我收到审批结果通知，继续推进培训或档案。

## 功能范围

### 页面 / Tab

| Tab | UI 文案 | 行为 |
|-----|---------|------|
| pending | 待审批 | 批准录用 / 驳回 |
| approved | 已通过 | 确认录用 → hired |

主页面为 `src/ApprovalsPage.tsx`，路由包装在 `modules/approvals/pages/ApprovalsRoute.tsx`。侧边栏角标「待审批」。

### 状态机

`pending` → `approved` | `rejected` | `cancelled`；批准后可 → `hired`。

类型：`ApprovalType` 含 `interview_result` 等；以面试场景为主。

### 边界与错误态

- 非 hiring_manager/admin 调用 decide/hire → 403
- 重复 hire：员工档案防重复，一候选人仅能有一份档案
- 空列表：展示「暂无待审批的面试结果」等空态

## 验收标准

| # | 标准 | 状态 |
|---|------|------|
| AC-1 | 面试聚合完成后自动出现 pending 审批，requester 可为「AI面试系统」 | **已实现** |
| AC-2 | 批准/驳回写入 decidedAt/comment，列表刷新 | **已实现** |
| AC-3 | 确认录用：contacts=hired、shortlist next_step=已录用、创建 onboarding 员工 | **已实现** |
| AC-4 | 通知 hiring_manager 新待审、recruiter 决定结果 | **已实现**，走站内通知路径 |
| AC-5 | 批量审批 | **缺失** |
| AC-6 | 可配置多级审批流 | **缺失** |

## 数据实体

| 表 | 说明 |
|----|------|
| `approval_requests` | 冗余存候选人/岗位名、分数、维度、状态 |

hire 触及：`contacts`、`shortlist_entries`、`employee_profiles`。

类型：`src/modules/approvals/types.ts`。

## API 面（关键）

| 路径 | 权限 | 说明 |
|------|------|------|
| `GET/POST /api/interview-approvals` | any / recruiter+ | 待审列表 / 创建 |
| `POST /api/interview-approvals/:id/decide` | hiring_manager+ | Express 批准/驳回 |
| `GET .../interview-approval-history/history` | any | 历史 |
| `POST .../:id/hire` | hiring_manager+ | Express 录用 |
| Edge `approvals` | recruiter+ | CRUD |
| Edge `cross-table-ops/approval-decide`、`hire-candidate` | hiring_manager+ | 生产跨表 |

路由别名多：`interview-approvals`、`interview-approval-history`、`approval-requests`，均含 v1 版本。

## 代码入口

| 层 | 路径 |
|----|------|
| 前端 | `src/ApprovalsPage.tsx`、`src/modules/approvals/` |
| Express | `server/src/modules/approvals/approvals.routes.ts` |
| Edge | `approvals/`、`cross-table-ops/` |
| 指南 | `src/modules/approvals/CLAUDE.md` |

## 依赖与跨模块

- **interviews/scoring**：生产者
- **cross-table-ops**：decide / hire 原子跨表
- **employees**：录用创建档案
- **stats**：sidebar pending 计数
- **notifications**：角色通知

## 实现状态汇总

| 能力 | 状态 |
|------|------|
| 待审/已通过 UI + decide/hire | **已实现** |
| 自动建审批 + 跨表录用 | **已实现** |
| 批量审批 / 自定义流程 | **缺失** |
| 邮件通知通道 | **部分**，以站内通知为主 |

## Open questions

1. 页面在根 `src/ApprovalsPage.tsx` 而非 modules 内——重构时注意路由懒加载。
2. Express decide/hire 与 Edge cross-table-ops 需行为一致；修一边必改另一边。
3. 等级映射：excellent > good > qualified > pending > rejected——与模板 grade_rules 文案可能不完全一致，展示层需兼容。
