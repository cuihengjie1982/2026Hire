# 02 — 项目管理（项目 + 岗位配置）

> 导航：项目管理 `/projects` | `AppPageId: projects`  
> 关联总览：[00-product-overview.md](./00-product-overview.md) · 下游：[03-candidates.md](./03-candidates.md) · [05-interviews.md](./05-interviews.md)

## 模块目标与成功指标

| 目标 | 成功指标 |
|------|----------|
| 管理招聘项目生命周期 | 可创建/编辑/状态变更/删除项目；删除时级联清理关联数据 |
| 在项目下维护岗位 | 行内创建岗位；自动生成岗位编号 |
| 配置 AI 匹配规则 | 画像、评分维度、Grade Rules、基础分、AI 提示词可保存并被候选人评分使用 |
| 导入导出配置 | Markdown 导入/导出岗位评分配置 |

## 用户故事

1. **作为招募专员**，我在「项目列表」创建项目，填写名称、城市、负责人、日期与状态，以便启动招聘。
2. **作为招募专员**，我展开项目行查看嵌套岗位，并新建岗位，分类可选 ITF/ITW/MWV 等。
3. **作为管理员**，我在「岗位配置」Tab 编辑画像关键词、同义词、评分维度权重与等级区间，以便 AI 评分一致。
4. **作为管理员**，我导出岗位配置 Markdown，或导入结构化文档批量回填配置。

## 功能范围

### 页面 / Tab

| Tab | URL | UI 文案 | 组件 |
|-----|-----|---------|------|
| 项目列表 | `/projects?tab=projects` | 项目列表 | `ProjectsPage` |
| 岗位配置 | `/projects?tab=positions` | 岗位配置 | `PositionConfigPage`，位于根 `src/` |

容器：`src/modules/projects/pages/ProjectManagePage.tsx`

### 关键交互

- 统计卡片：进行中项目 / 人才储备 / 本周面试 + 时间范围筛选
- 项目表：进度条、状态标签、展开嵌套岗位、行内 CRUD
- 岗位配置：左侧岗位列表支持搜索与分类；右侧共 6 段配置，覆盖基本信息、画像、评分标准、Grade Rules、基础分与 AI 提示词
- 保存前校验：维度权重之和 = `100 - baseScore`

### 边界与错误态

- 删除项目：级联清理 positions FK、candidates/agents SET NULL、shortlist/contacts DELETE 等，详见模块 CLAUDE.md
- 岗位重名或重复：创建时去重检查
- 旧格式兼容：读 `profile_rules` 或 legacy `profile.mustHave/niceToHave/bonus`
- 受控输入：`value={field ?? ""}` 防 uncontrolled 警告

## 验收标准

| # | 标准 | 状态 |
|---|------|------|
| AC-1 | 可 CRUD 项目，状态可切换为 `进行中` / `筹备中` / `已关闭`，见 `ProjectStatus` | **已实现** |
| AC-2 | 展开项目可见岗位列表，可新建/编辑/删除岗位 | **已实现** |
| AC-3 | 岗位编号形如 `POS-YYYYMMDD-NNNN` | **已实现** |
| AC-4 | 保存岗位详情含 profile_rules、scoring_rules、grade_rules、base_score_config、ai_prompt | **已实现** |
| AC-5 | 权重校验失败时阻止保存并提示 | **已实现** |
| AC-6 | Markdown 导入/导出四段结构可往返 | **已实现** |
| AC-7 | 删除项目后关联短名单/联系人被清理，不留孤儿关键路径 | **已实现** |
| AC-8 | 项目文档库 / 项目模板 | **缺失** |

## 数据实体

| 实体 | 表 / 迁移 | 前端类型 |
|------|-----------|----------|
| Project | `projects` | `src/modules/projects/types.ts` |
| Position | `positions` | `src/modules/positions/types.ts` |
| PositionDetail | `position_details`，与 position 1:1 | ProfileRule, ScoringRule, GradeRule, BaseScoreConfig |

JSONB 写入前需 `JSON.stringify()`：`profile`、`profile_rules`、`scoring_rules`、`grade_rules`、`base_score_config`。

## API 面（关键）

| Express | Edge | 说明 |
|---------|------|------|
| `GET/POST /api/projects` | `embox-api/projects` | 列表/创建 |
| `PATCH /api/projects/:id`、`/:id/status` | 同左 | 更新 |
| `DELETE /api/projects/:id` | 同左 | 级联删除 |
| `GET /api/projects/stats` | — | 仪表统计 |
| `GET/POST/PATCH/DELETE /api/positions` | `embox-api/positions` | 岗位 CRUD |
| `PUT /api/positions/:id/detail` | 同左 | 评分配置 |

双前缀：`/api` 与 `/api/v1`。

## 代码入口

| 层 | 路径 |
|----|------|
| 前端 | `src/modules/projects/`、`src/modules/positions/`、`src/PositionConfigPage.tsx` |
| Express | `server/src/modules/projects/projects.routes.ts`、`positions/positions.routes.ts` |
| Edge | `supabase/functions/embox-api/projects/`、`positions/` |
| 指南 | `src/modules/projects/CLAUDE.md` |

## 依赖与跨模块

- **候选人 / Agents / Shortlist**：FK `project_id` 或 `position_id`
- **面试模板**：`position_id` ON DELETE CASCADE
- **员工 / 审批**：岗位引用
- 下游评分读 `scoring_rules` / `grade_rules`，供候选人搜索与 Agent Screener 使用

## 实现状态汇总

| 能力 | 状态 |
|------|------|
| 项目 CRUD + 状态 + 进度 | **已实现** |
| 嵌套岗位 + 岗位配置 6 段 | **已实现** |
| MD 导入导出 | **已实现** |
| 旧 profile 格式兼容 | **已实现** |
| 项目文档管理 / 模板 | **缺失** |
| 团队成员细粒度项目 ACL | **部分**，全局角色为主 |

## Open questions

1. 岗位分类 ITF/ITW/MWV 是否仍为业务强制？通用岗位是否需要新分类体系？
2. `PositionConfigPage` 仍在根 `src/`，未迁入 `modules/positions/pages/`——接手时注意 import 路径。
3. Express 与 Edge 对 JSONB 的 stringify 行为不同：Edge SDK 常自动序列化——改保存逻辑时两边对齐。
