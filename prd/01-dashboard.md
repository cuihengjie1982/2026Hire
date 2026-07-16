# 01 — 工作台（Dashboard）

> 导航：工作台 `/` | `AppPageId: dashboard`  
> 关联总览：[00-product-overview.md](./00-product-overview.md) · 快捷跳转：[05-interviews](./05-interviews.md) · [06-approvals](./06-approvals.md) · [02-projects](./02-projects.md)

## 模块目标与成功指标

| 目标 | 成功指标 |
|------|----------|
| 一屏掌握今日工作 | 关键待办/指标可见并可跳转 |
| 降低导航成本 | 快捷操作直达导入、面试、项目等 |
| 支持时间范围切换 | 今日/本周/本月/自定义 |

## 用户故事

1. **作为招募专员**，我打开工作台看到待处理事项与快捷入口，以便安排当天工作。
2. **作为管理员**，我按时间范围查看招聘相关统计卡片，了解整体进度。
3. **作为查看者**，我只读浏览指标与近期结果，不执行写操作。

## 功能范围

### 页面

- 单页：`src/modules/dashboard/pages/DashboardPage.tsx`
- 时间范围：今日 / 本周 / 本月 / 自定义，对应 `RANGE_LABELS`
- 快捷操作示例：发起面试 → `/interviews?tab=templates` 等
- 展示面试结果列表片段、统计卡片、今日任务

### 边界与错误态

- API 失败：卡片降级为空或错误提示，不白屏
- Mock 模式：部分数据来自本地或简化聚合
- 无「每 5 分钟自动刷新」硬保证

## 验收标准

| # | 标准 | 状态 |
|---|------|------|
| AC-1 | 登录后 `/` 渲染工作台，含统计卡片与快捷操作 | **已实现** |
| AC-2 | 时间范围切换会过滤相关数据 | **已实现** |
| AC-3 | 快捷操作跳转到正确模块路由 | **已实现** |
| AC-4 | 面试场次/通过率/均分来自 `listInterviewResults`；待办计数含 pendingApprovals 等 | **部分**，客户端聚合而非独立 dashboard API；人才库总量不随时间范围变化 |
| AC-5 | 固定间隔自动刷新，如 5 分钟 | **缺失** |
| AC-6 | 用户可自定义仪表盘布局 | **缺失** |

## 数据实体

无独立主表。聚合来自 `interview_results`、stats/analytics 等，见 dashboard 页内 `listInterviewResults` 与 token 请求。

## API 面（关键）

| 来源 | 说明 |
|------|------|
| `listInterviewResults` 等模块 API | 页内直接拉取 |
| `/api/.../stats`、insights，若嵌入 | 视实现版本而定 |
| Edge `stats` / `analytics` | 生产聚合 |

接手时以 `DashboardPage.tsx` 内实际 fetch 为准。

## 代码入口

| 层 | 路径 |
|----|------|
| 前端 | `src/modules/dashboard/pages/DashboardPage.tsx` |
| 统计后端 | `server/src/modules/stats/`、`analytics/`；Edge `stats/`、`analytics/` |

## 依赖与跨模块

几乎只读依赖：candidates、interviews、approvals、projects。写操作通过跳转至对应模块完成。

## 实现状态汇总

| 能力 | 状态 |
|------|------|
| Dashboard UI + 快捷入口 | **已实现** |
| 时间范围 | **已实现** |
| 全量真实聚合 + 自动刷新 + 个性化 | **部分** / **缺失** |

## Open questions

1. 「待处理简历 / AI 面试待安排 / 审批待处理」三件套是否仍为产品 KPI 定义？需与现卡片文案对齐。
2. 是否把 sidebar 角标逻辑与工作台待办统一数据源，即 `stats`？
