# EM-BOX PRD 套件

> 本地产品需求文档索引。基于旧版 `docs/PRD-产品需求文档.md` v1.3 愿景/术语，**以当前代码与导航为准**校准功能状态。

## 阅读顺序

1. 先读本文（状态图例 + 模块索引）
2. 再读 [`00-product-overview.md`](./00-product-overview.md)（愿景、角色、端到端旅程、架构决策、NFR）
3. 按接手任务选读子模块 PRD（建议闭环顺序：项目 → 候选人 → 推进 → 面试 → 审批 → 员工 → 培训 → 管理 → 工作台）

## 状态图例

每个子 PRD 的核心需求标注实现状态：

| 标签 | 含义 |
|------|------|
| **已实现** | 前后端（Express + Edge）与 UI 可用，可按验收标准手工/自动验收 |
| **部分** | 主路径可用，但缺边界能力、真实通道、或 Mock/真实 API 不一致 |
| **缺失** | 产品需要但当前代码无可用实现 |
| **规划中** | 类型/字段已预留或路线图明确，尚未交付，例如 `video_conversational` |

> 旧版缺口文档（2026-05-06）多处已过时，例如「AI 面试体验占位」一项。以本套件标注为准；缺口文档仅作历史参考。

## 模块索引

| 文件 | 侧边栏 / 路径 | 说明 |
|------|----------------|------|
| [00-product-overview.md](./00-product-overview.md) | — | 产品总览、权限、架构决策、路线图 |
| [01-dashboard.md](./01-dashboard.md) | 工作台 `/` | 首页指标与快捷入口 |
| [02-projects.md](./02-projects.md) | 项目管理 `/projects` | 项目列表 + 岗位配置 |
| [03-candidates.md](./03-candidates.md) | 候选人中心 `/candidates` | 人才库 / 简历搜索 / 联系人 |
| [04-pipeline.md](./04-pipeline.md) | 招聘推进 `/pipeline` | 入围名单 + 沟通记录，含短信 |
| [05-interviews.md](./05-interviews.md) | AI 面试中心 `/interviews` | 模板 / 场次 / 会话式 / 评分 / 公开入口 |
| [06-approvals.md](./06-approvals.md) | 审批中心 `/approvals` | 待审批 → 录用闭环 |
| [07-training.md](./07-training.md) | 培训学堂 `/training` + 视频分享 | 课程 / 路径 / 门户 / 公开视频 |
| [08-employees.md](./08-employees.md) | 员工档案 `/employees` | 档案 / 胜任力 / 绩效 / 统计 |
| [09-admin.md](./09-admin.md) | 系统管理 `/admin` | Agents / 洞察 / 集成 / 设置 / 短信模板 |

导航源码：[`src/navigation.ts`](../src/navigation.ts)、[`src/app/navigation.tsx`](../src/app/navigation.tsx)。
`AppPageId` 含 `employees` 与 `videoShare`。

## 与 `docs/` 交叉引用

本套件**不**重写数据库/API 全文，技术细节指向：

| 文档 | 用途 |
|------|------|
| [`docs/系统架构文档.md`](../docs/系统架构文档.md)，乱码文件名同内容 | 架构说明 |
| [`docs/API接口文档.md`](../docs/API接口文档.md) | API 全文 |
| [`docs/OPERATIONS_MANUAL.md`](../docs/OPERATIONS_MANUAL.md) | 运维 |
| [`docs/TRAINING_ACADEMY.md`](../docs/TRAINING_ACADEMY.md) | 培训学堂补充 |
| [`docs/功能缺失与优先级分析.md`](../docs/功能缺失与优先级分析.md) | 历史缺口，2026-05-06，**已过时** |
| 各模块 `src/modules/*/CLAUDE.md`、`server/CLAUDE.md` | 代码级接手指南 |
| [`.claude/memory/PROJECT_CONTEXT.md`](../.claude/memory/PROJECT_CONTEXT.md) | 产品、部署、待办等非代码上下文 |

> 部分 `docs/` 文件名因编码损坏显示乱码，内容仍可读。

## 维护约定

- 功能变更时：更新对应子 PRD 的「实现状态」与验收标准，必要时改总览模块索引表。
- 状态标签必须对照当前路由、`api.ts`、Express 路由与 `supabase/functions/embox-api/`。
- 不要把规划项写成已上线。
