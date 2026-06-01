# CLAUDE.md — 员工档案模块

## 模块概述

员工档案管理已录用候选人的完整 HR 记录，覆盖在职状态、组织归属、多维属性、绩效记录、胜任力模型。前端提供 3 Tab 管理页面（员工档案 / 胜任力模型 / 员工统计）。

## 目录结构

```
src/modules/employees/
├── types.ts          # 全部类型（EmployeeProfile, PerformanceRecord, CompetencyModel 等）
├── api.ts            # 全部 API 调用（含 mock store，导出类型）
└── pages/
    └── EmployeeManagementPage.tsx  # 主管理页面（3 Tab + 内联 Modal）

server/src/modules/employees/
└── employees.routes.ts   # Express 路由（516 行，14 个端点）

supabase/functions/embox-api/employees/
└── index.ts              # Edge Function handler（625 行）
```

## 后端对应

```
server/src/modules/employees/
└── employees.routes.ts    # Express 路由

supabase/functions/embox-api/employees/
└── index.ts               # Edge Function handler
```

数据库迁移: `server/src/db/migrations/027_create_employee_profiles.sql`

## 数据库表

| 表 | 用途 |
|-----|------|
| `employee_profiles` | 核心员工 HR 记录（状态/组织/多维属性/面试分数/绩效均分/培训分数） |
| `employee_performance` | 周期性绩效评审（UNIQUE employee_id + period） |
| `competency_models` | 岗位胜任力模型（维度+权重，每岗位只有一个 active） |

## 核心 API 端点

### 员工档案
| 端点 | 用途 |
|------|------|
| `GET /employees` | 员工列表（分页 + status/projectId/positionId 筛选，运行时计算 retention_days） |
| `GET /employees/stats` | 仪表盘统计（在职人数/均分/留存/状态分布/等级分布） |
| `GET /employees/:id` | 员工详情（JOIN candidates 获取简历数据） |
| `POST /employees` | 从候选人创建员工档案（防重复：一个候选人只能有一个档案） |
| `PATCH /employees/:id` | 更新员工字段（动态 SET，JSONB 字段需 stringify） |
| `DELETE /employees/:id` | 删除员工档案 |

### 绩效记录（嵌套在员工下）
| `GET /employees/:id/performance` | 员工的所有绩效记录（period DESC） |
| `POST /employees/:id/performance` | 添加/更新绩效记录（UPSERT on employee_id + period，自动重算 avg_performance） |

### 胜任力模型
| `GET /employees/competency-models` | 模型列表（可按 positionId 筛选，JOIN 岗位名） |
| `GET /employees/competency-models/:id` | 单个模型详情 |
| `POST /employees/competency-models` | 创建模型（自动停用同岗位旧模型） |
| `POST /employees/competency-models/derive/:positionId` | AI 推导胜任力模型（从 Top N 绩效员工聚合 skills + weaknesses） |
| `PATCH /employees/competency-models/:id` | 更新模型（名称/维度/isActive） |
| `DELETE /employees/competency-models/:id` | 删除模型 |

## 关键实现细节

### 员工状态生命周期
```
onboarding（入职中）→ probation（试用期）→ active（正式）
                                             → terminated（辞退）
                                             → resigned（离职）
```

### 录用闭环（cross-table-ops）
审批通过 → `hireCandidate` → 自动创建 `employee_profiles`（status='onboarding'），同时更新 contacts.status='hired'、shortlist_entries.next_step='已录用'。

### retention_days 计算
不存储在数据库，每次查询时运行时计算：`Math.floor((Date.now() - hireDate) / 86400000)`。

### avg_performance 自动重算
每次添加/更新绩效记录后，自动对该员工所有绩效分数取平均值，写回 `employee_profiles.avg_performance`。

### 胜任力模型「只有一个 active」规则
创建或 AI 推导新模型时，先将同岗位所有旧模型设 `is_active = false`，再创建新模型。支持版本号递增。

### AI 推导逻辑（POST /derive/:positionId）
1. 找出该岗位 avg_performance 最高的 N 个在职员工
2. 聚合他们的 skills（JSONB 数组）→ 按频次排序 → 归一化权重到 100
3. 收集 interview_weaknesses → 排名 top 5 → 存入 derived_from.common_weaknesses
4. 创建 source_type='ai_derived' 的新模型

## JSONB 字段注意

- `employee_profiles.certifications` — `[{name, date?}]`
- `employee_profiles.skills` — `[{name, level}]`
- `employee_profiles.personality` — `Record<string, unknown>`
- `employee_profiles.interview_weaknesses` — `string[]`
- `employee_performance.dimensions` — `[{dimension, score, note?}]`
- `employee_performance.strengths / weaknesses` — `string[]`
- `competency_models.dimensions` — `[{name, weight, description}]`
- `competency_models.derived_from` — `{employee_ids[], sample_size, avg_score, common_weaknesses}`

写入 SQL 前需要 `JSON.stringify()`。

## 关联模块

- **candidates**: 一对一关联（candidate_id FK），员工详情 JOIN 候选人简历数据
- **interviews**: 面试分数/等级/弱项流入 employee_profiles.interview_score/grade/weaknesses
- **approvals**: cross-table-ops hireCandidate 自动创建 employee_profiles
- **training**: 共享 candidate_id，training_score 列跟踪培训成果
- **positions**: FK 关联，胜任力模型按岗位定义
- **projects**: FK 关联，可按项目筛选员工
