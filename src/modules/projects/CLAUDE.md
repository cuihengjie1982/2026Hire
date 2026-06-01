# CLAUDE.md — 项目管理模块（项目 + 岗位配置）

## 模块概述

项目管理是招聘项目和岗位的管理中枢。招聘人员在此创建招聘项目、跟踪进度，并在项目下管理岗位。每个岗位可配置复杂的 AI 评分流水线：画像规则（关键词+同义词）、评分维度（加权关键词匹配）、等级区间、AI 提示词。

**核心流程**：
- 创建/编辑/删除招聘项目（名称、城市、负责人、日期、状态、进度）
- 项目统计（进行中项目数、人才储备数、本周面试数）+ 时间范围筛选
- 展开项目行 → 查看嵌套岗位列表 → 行内创建/编辑/删除岗位
- 岗位配置 Tab → 左侧岗位列表 + 右侧 6 段评分配置 → 导入/导出 Markdown

## 目录结构

```
src/modules/projects/
├── types.ts              # Project, ProjectStatus, ProjectStats
├── api.ts                # Project CRUD + stats + mock store
├── fixtures.ts           # 空 mock
├── pages/
│   ├── ProjectsPage.tsx        # 项目列表页（694 行）
│   └── ProjectManagePage.tsx   # Tab 容器（68 行）
└── components/
    └── PositionDialog.tsx      # 行内创建岗位弹窗（209 行）

src/modules/positions/
├── types.ts              # PositionSummary, ProfileRule, ScoringRule, GradeRule, BaseScoreConfig 等
├── api.ts                # Position CRUD + detail save/get + 兼容旧格式
├── hooks.ts              # usePositions(), usePositionDetail()
├── fixtures.ts           # 空 mock
└── pages/
    └── PositionConfigRoute.tsx  # 路由包装 → PositionConfigPage

src/PositionConfigPage.tsx       # 完整岗位配置页（1152 行，位于根 src/）

server/src/modules/
├── projects/projects.routes.ts   # Express 路由（137 行）
└── positions/positions.routes.ts # Express 路由（238 行）

supabase/functions/embox-api/
├── projects/index.ts     # 项目 handler（76 行）
└── positions/index.ts    # 岗位 handler（118 行）
```

## 前端页面结构

`ProjectManagePage` 两个 Tab（URL search param `?tab=`）：

1. **项目列表** (`tab=projects`, 默认) → `<ProjectsPage />`
   - 3 张统计卡片（进行中项目/人才储备/本周面试）+ 时间范围筛选
   - 项目表格（名称/城市/负责人/描述/日期/进度条/状态标签/操作按钮）
   - 展开行 → 嵌套岗位表格（懒加载）→ 行内创建/编辑/删除岗位

2. **岗位配置** (`tab=positions`) → `<PositionConfigPage />`
   - 左侧：岗位列表（搜索 + 分类筛选 ITF/ITW/MWV）
   - 右侧 6 段配置：
     1. 岗位基本信息（只读）
     2. 画像配置（ProfileRule 网格：关键词/同义词/分类）
     3. 评分标准（画像权重 + 维度权重 + 关键词匹配）
     4. Grade Rules（分数区间 → 等级/标签/动作）
     5. AI 智能筛选提示词
   - 导入/导出结构化 Markdown

## 核心 API 端点

### 项目
| 端点 | 方法 | 用途 |
|------|------|------|
| `GET /api/projects` | GET | 项目列表（分页） |
| `GET /api/projects/stats` | GET | 仪表盘统计 |
| `POST /api/projects` | POST | 创建项目 |
| `PATCH /api/projects/:id` | PATCH | 更新项目 |
| `PATCH /api/projects/:id/status` | PATCH | 更新项目状态 |
| `DELETE /api/projects/:id` | DELETE | 删除项目（级联清理 5 张关联表） |

### 岗位
| `GET /api/positions?projectId=` | GET | 岗位列表 |
| `GET /api/positions/:id` | GET | 岗位详情（JOIN position_details） |
| `POST /api/positions` | POST | 创建岗位（自动生成编号 POS-YYYYMMDD-NNNN，去重检查） |
| `PATCH /api/positions/:id` | PATCH | 更新岗位 |
| `PUT /api/positions/:id/detail` | PUT | 保存评分配置（profile/scoring_rules/grade_rules/ai_prompt） |
| `DELETE /api/positions/:id` | DELETE | 删除岗位（级联清理 5 张关联表） |

所有端点双前缀：`/api/*` 和 `/api/v1/*`

## 数据库表

| 表 | 用途 |
|-----|------|
| `projects` | 招聘项目（名称/城市/负责人/日期/状态/进度） |
| `positions` | 岗位（编号/名称/分类/项目FK/需求人数/交付周期） |
| `position_details` | 岗位评分配置（画像规则/评分规则/等级规则/AI 提示词，与 position 1:1） |

删除项目/岗位时级联清理：candidates, agents, shortlist_entries, contacts, outreach_records, approval_requests, interview_templates, employee_profiles

## 评分体系

```
总分 100 = 画像匹配分（baseScore，默认 50）+ 技能经验分（100 - baseScore，默认 50）

技能经验分按维度权重分配：SUM(scoringRules[i].weight) === 100 - baseScore
```

### 关键类型

```typescript
ProfileRule = { keyword, synonyms: string[], category }
ScoringRule = { dimension, weight, keywords: string[], matchMode: 'all' | 'any' }
GradeRule = { grade: 'A级'|'B+级'|'B级'|'C级', minScore, maxScore, label, action }
BaseScoreConfig = { baseScore: number }
```

## JSONB 字段注意

- `position_details.profile` — 旧格式 `{mustHave[], niceToHave[], bonus[]}`（读取兼容，写入用 profile_rules）
- `position_details.profile_rules` — `ProfileRule[]`
- `position_details.scoring_rules` — `ScoringRule[]`
- `position_details.grade_rules` — `GradeRule[]`
- `position_details.base_score_config` — `BaseScoreConfig`

Express 端需 `JSON.stringify()`，Edge Function（Supabase SDK）自动序列化。

## 关键实现细节

### 岗位编号自动生成
`POS-YYYYMMDD-NNNN`，通过 PostgreSQL sequence `positions_code_seq`（LPAD 4 位），不存在时自动创建。

### 旧格式兼容
`getPositionDetail()` 同时处理：
- 新格式：`raw.profile_rules`（ProfileRule 数组）
- 旧格式：`raw.profile`（mustHave/niceToHave/bonus 三段式）→ 展平为 ProfileRule[]

`ScoringRule` 兼容旧的 `criteria` 字符串（按 `[,/、\s]+` 分割成 keywords 数组）。

### 权重校验
前端 `PositionConfigPage` 保存时校验：维度权重之和必须等于 `100 - baseScore`。

### Markdown 导入/导出
岗位配置可导出为结构化 Markdown（4 个 `##` 段落），支持重新导入解析。段落匹配用正则：`## 1. 画像配置`、`## 2. 评分标准配置`、`## 3. Grade Rules`、`## 4. 画像匹配权重`。

### 项目删除级联逻辑
1. `positions.project_id` → SET NULL
2. `candidates.project_id` → SET NULL
3. `agents.project_id` → SET NULL
4. `shortlist_entries` WHERE project_id → DELETE
5. `contacts` WHERE project_id → DELETE

## 关联模块

- **candidates**: FK project_id/position_id，删除时 SET NULL
- **agents**: FK project_id，Agent 可按项目筛选
- **shortlist**: FK project_id/position_id，项目删除时清理
- **interviews**: interview_templates.position_id ON DELETE CASCADE
- **approvals**: position_id FK，hireCandidate 跨表操作
- **employees**: position_id/project_id FK
- **analytics**: projectStats 查询项目+候选人+面试数据
- **navigation**: 导航栏第 2 项（/projects）
