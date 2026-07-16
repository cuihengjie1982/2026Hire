# 08 — 员工档案

> 导航：员工档案 `/employees` | `AppPageId: employees`  
> 关联：[06-approvals.md](./06-approvals.md) · [07-training.md](./07-training.md) · [03-candidates.md](./03-candidates.md)

## 模块目标与成功指标

| 目标 | 成功指标 |
|------|----------|
| 录用后有 HR 档案 | hire 自动建档；可维护状态/组织/技能等 |
| 绩效可追踪 | 周期绩效 UPSERT，自动重算均分 |
| 胜任力可沉淀 | 按岗位维护模型；可从 Top 绩效员工 AI 推导 |
| 统计可看 | 在职/均分/留存/分布 |

## 用户故事

1. **作为 HR/招募专员**，我在「员工档案」按入职中/试用期/在职/辞退/离职等状态筛选，查看详情，详情中含候选人简历 JOIN。
2. **作为管理员**，我在「字段管理」维护档案扩展字段展示，该功能在启用时生效。
3. **作为管理员**，我在「胜任力模型」为岗位配置维度权重，或一键 AI 推导。
4. **作为管理者**，我在「员工统计」查看仪表指标。

## 功能范围

### 页面 / Tab

| Tab | UI 文案 |
|-----|---------|
| profiles | 员工档案 |
| fields | 字段管理 |
| competency | 胜任力模型 |
| stats | 员工统计 |

容器：`EmployeeManagementPage.tsx`。

### 状态生命周期

`onboarding` → `probation` → `active` → `terminated` | `resigned`

### 关键规则

- 一候选人仅一档案，创建时防重
- `retention_days` **不落库**，查询时按 hireDate 计算
- 绩效写入后重算 `avg_performance`
- 新建/推导胜任力模型：同岗位旧模型 `is_active=false`

### 边界与错误态

- 无候选人关联：详情缺简历字段时降级展示
- AI 推导样本不足：返回明确错误，Top N 为空时提示
- JSONB 字段 stringify 遗漏导致写入失败

## 验收标准

| # | 标准 | 状态 |
|---|------|------|
| AC-1 | 审批「确认录用」后自动出现 onboarding 员工 | **已实现** |
| AC-2 | 员工列表分页 + status/project/position 筛选 | **已实现** |
| AC-3 | PATCH 更新档案字段，含 skills、certifications 等 | **已实现** |
| AC-4 | 绩效 UPSERT 且均分更新 | **已实现** |
| AC-5 | 胜任力 CRUD + 仅一 active/岗位 | **已实现** |
| AC-6 | `POST .../derive/:positionId` 生成 ai_derived 模型 | **已实现** |
| AC-7 | stats 接口返回在职/分布等 | **已实现** |
| AC-8 | 自定义字段定义 CRUD + 档案赋值，表为 `employee_custom_field_defs` / `_values` | **已实现** |
| AC-9 | 与外部 HRIS 双向同步 | **缺失** |

## 数据实体

| 表 | 迁移 | 用途 |
|----|------|------|
| `employee_profiles` | 027 | 核心档案 + JSONB 多维属性 |
| `employee_performance` | 027 | UNIQUE(employee_id, period) |
| `competency_models` | 027 | 维度权重 + derived_from |

类型：`src/modules/employees/types.ts`；api 模块亦导出类型。

## API 面（关键）

| 路径 | 说明 |
|------|------|
| `GET/POST /employees`、`GET/PATCH/DELETE /employees/:id` | 档案 |
| `GET /employees/stats` | 统计 |
| `GET/POST /employees/:id/performance` | 绩效 |
| `GET/POST/PATCH/DELETE .../competency-models` | 模型 |
| `POST .../competency-models/derive/:positionId` | AI 推导 |
| Edge `employees/` | 生产 |

## 代码入口

| 层 | 路径 |
|----|------|
| 前端 | `src/modules/employees/` |
| Express | `server/src/modules/employees/employees.routes.ts` |
| Edge | `supabase/functions/embox-api/employees/` |
| 指南 | `src/modules/employees/CLAUDE.md` |

## 依赖与跨模块

- **approvals / cross-table-ops**：hire 建档
- **candidates**：一对一 candidate_id
- **interviews**：interview_score/grade/weaknesses 流入档案
- **training**：training_score；薄弱项课程推荐
- **positions**：胜任力按岗位

## 实现状态汇总

| 能力 | 状态 |
|------|------|
| 档案/绩效/胜任力/统计/自定义字段 | **已实现** |
| 录用自动建档 | **已实现** |
| AI 推导模型 | **已实现** |
| 外部 HR 同步 | **缺失** |

## Open questions

1. 自定义字段 Express + Edge 均有；改 schema 时同步迁移与两边 handler。
2. 旧导航「8 模块」未含 employees——接手文档必须以 `navigation.ts` 为准。
3. derive 依赖 LLM 配置与足够样本员工——空库环境需种子或跳过演示。
