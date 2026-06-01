# CLAUDE.md — 审批中心模块

## 模块概述

审批中心是招聘流程的最终决策环节。AI 面试评分完成后自动创建 pending 审批，用人经理审查后批准或驳回，批准的候选人可进一步「确认录用」触发入职流程（更新联系人、短名单、创建员工档案）。

**审批流程**：
```
AI 面试评分完成 → 自动创建 pending approval_request
  → 用人经理在 /approvals 审查（两个 Tab：待审批 / 已通过）
  → 决定：批准录用 或 驳回（带评语）
  → 批准后可「确认录用」→ status='hired' + 跨表更新
```

## 目录结构

```
src/modules/approvals/
├── types.ts          # 全部类型（ApprovalRequest, InterviewApprovalRequest 等）
├── api.ts            # 全部 API 调用（含 mock store，localStorage 持久化）
├── fixtures.ts       # 空 mock 数据
├── hooks.ts          # useApprovals() hook
└── pages/
    └── ApprovalsRoute.tsx   # 路由包装（6 行，import ApprovalsPage）

src/ApprovalsPage.tsx        # 主页面组件（640 行，实际位置在根 src/）

server/src/modules/approvals/
└── approvals.routes.ts      # Express 路由（167 行）

supabase/functions/embox-api/
├── approvals/index.ts       # 审批 CRUD handler（79 行）
└── cross-table-ops/index.ts # approvalDecide + hireCandidate（221 行）
```

## 路由别名（6 套前缀）

同一个 `approvalsRoutes` Express 路由挂载在 3 组前缀下：
```
/api/interview-approvals        /api/v1/interview-approvals
/api/interview-approval-history /api/v1/interview-approval-history
/api/approval-requests          /api/v1/approval-requests
```

## 核心 API 端点

| 端点 | 方法 | 权限 | 用途 |
|------|------|------|------|
| `/api/interview-approvals` | GET | any | 待审批列表（status='pending'，分页） |
| `/api/interview-approvals` | POST | recruiter+ | 创建审批请求 |
| `/api/interview-approvals/:id/decide` | POST | hiring_manager+ | 批准/驳回（Express） |
| `/api/interview-approval-history/history` | GET | any | 已处理审批历史（分页） |
| `/api/interview-approval-history/:id/hire` | POST | hiring_manager+ | 确认录用（Express） |
| `/embox-api/approvals` | GET/POST/PATCH | recruiter+ | 审批 CRUD（Edge Function） |
| `/embox-api/cross-table-ops/approval-decide` | POST | hiring_manager+ | 批准/驳回 + 通知（Edge） |
| `/embox-api/cross-table-ops/hire-candidate` | POST | hiring_manager+ | 录用 + 跨表更新（Edge） |

## 关键类型

```typescript
ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'cancelled' | 'hired';
ApprovalType = 'agent_publish' | 'config_publish' | 'outreach_launch' | 'interview_result';

InterviewApprovalRequest = {
  id, candidateId, candidateName, candidateEmail,
  positionId, positionName,
  interviewScore, interviewGrade, interviewGradeLabel,
  interviewDate, interviewDuration,
  dimensionScores: [{name, score, weight}],
  status, requesterName, approverName,
  decidedAt?, decidedComment?, createdAt
};
```

等级映射: `excellent` > `good` > `qualified` > `pending` > `rejected`

## 数据库表

| 表 | 用途 |
|-----|------|
| `approval_requests` | 核心审批表（候选人/岗位/面试分数/维度分数/状态/决定信息） |

hire 操作触及的关联表：
- `contacts` — status → 'hired'
- `shortlist_entries` — next_step → '已录用'
- `employee_profiles` — INSERT 新员工档案（status='onboarding'）

## 关键实现细节

### 双重权限控制
- 简单 CRUD（GET/POST/PATCH）：`recruiter+`
- 关键决策操作（decide/hire）：`hiring_manager+`（或 admin）

### 数据冗余
`approval_requests` 表冗余存储 candidate_name、candidate_email、position_name，避免查询时 JOIN。

### 自动创建审批
AI 面试评分引擎（`interview-scoring`）完成评分后自动创建 `pending` 审批，requester_name 硬编码为 `"AI面试系统"`。同时通知 `hiring_manager` 角色用户。

### 通知集成
- 评分完成 → `notifyByRole('hiring_manager', ...)` 通知有新待审批
- 审批决定 → `notifyByRole('recruiter', ...)` 通知审批结果

### 前端页面结构
`ApprovalsRoute.tsx` 是 6 行包装，实际页面在 `src/ApprovalsPage.tsx`（640 行，从模块目录外 import）。两个 Tab：
1. **待审批** — pending 列表，显示面试分数/等级/维度，批准/驳回按钮
2. **已通过** — approved/hired 列表，「确认录用」按钮 → hire 流程

## 关联模块

- **interviews/scoring**: 评分完成后自动创建 pending 审批（生产者）
- **cross-table-ops**: approvalDecide + hireCandidate 跨表操作
- **shortlist**: 录用后更新 next_step = '已录用'
- **contacts**: 录用后更新 status = 'hired'
- **employees**: 录用后创建 employee_profiles（入职闭环）
- **candidates**: 读取候选人详情用于创建员工档案
- **notifications**: 审批状态变更通知
- **stats**: 提供 sidebar 角标 pendingApprovals 计数
