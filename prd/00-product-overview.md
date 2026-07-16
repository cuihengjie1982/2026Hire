# EM-BOX 产品总览 PRD

> 版本：handover-2026-07 | 底稿： `docs/PRD-产品需求文档.md` v1.3（2026-05-27）| 校准：当前代码与导航

## 1. 产品概述

### 1.1 愿景与定位

EM-BOX 是面向内部招聘团队、约 50 人规模的 **AI 驱动招聘管理系统**。早期定位侧重 Embodied AI 数据采集岗位，如 Ego / UMI / 真机·本体 / 仿真·合成，现已扩展为通用招聘闭环：简历解析 → 岗位匹配评分 → 短名单推进 → AI 面试 → 审批录用 → 员工档案 → 培训提升。

生产域名：`hire.cmbpo.com`，前端 Vercel、后端 Supabase。详见 [PROJECT_CONTEXT](../.claude/memory/PROJECT_CONTEXT.md)。

### 1.2 产品目标 — 业务

| 目标 | 说明 |
|------|------|
| 提升筛选效率 | AI 解析 + Fit Score / 多维评分，减少人工粗筛 |
| 降低匹配成本 | 可配置岗位画像与评分规则，让 Agent 自动运行解析与评分流程 |
| 提高转化 | 短名单 → 外联/面试邀请 → 面试 → 审批 → 录用闭环可追踪 |
| 全流程数字化 | 从项目配置到培训效果对比均可在系统内完成 |

### 1.3 核心闭环

```mermaid
flowchart LR
  project[项目岗位配置] --> import[简历导入解析]
  import --> score[AI评分匹配]
  score --> shortlist[短名单推进]
  shortlist --> outreach[外联面试邀请]
  outreach --> interview[AI面试评分]
  interview --> approval[审批录用]
  approval --> employee[员工档案]
  employee --> training[培训闭环]
```

## 2. 角色与权限

| 角色 | 代码值 | 典型职责 |
|------|--------|----------|
| 管理员 | `admin` | 用户/权限、AI 模型、集成、系统级配置 |
| 招募专员 | `recruiter` | 日常招聘：导入、评分、短名单、外联、面试安排、培训管理 |
| 用人经理 | `hiring_manager` | 审批决定、确认录用；旧 PRD 称 interviewer，现网统一为 hiring_manager |
| 查看者 | `viewer` | 只读查看报表与数据 |
| 候选人 | （无账号） | 公开链接参加面试 / 查看培训门户 / 观看培训视频 |

权限矩阵细节见 [09-admin.md](./09-admin.md) 与 `src/modules/settings/CLAUDE.md`：24 项静态权限 × 4 角色。关键决策操作 `decide` / `hire` 要求 `hiring_manager+`。

认证：JWT，有效期 24h，`localStorage` key `em-box.auth-token`。

## 3. 端到端用户旅程

1. **准备**：在「项目管理」创建项目与岗位，配置画像/评分/等级规则。
2. **获客**：在「候选人中心」导入简历，使用 MinerU 与 Vision LLM 解析，AI 评分，加入人才库。
3. **推进**：加入「入围名单」，推进为联系人，发面试邀请并生成 `access_token`。
4. **评估**：候选人打开公开链接完成音频逐题或文本会话式面试；系统 Whisper 转写 + LLM 评分。
5. **决策**：自动生成待审批；用人经理批准后「确认录用」→ 写联系人/短名单 + 创建员工档案。
6. **发展**：员工/候选人进入培训学堂；可分享免登录视频链接。

## 4. 业务术语

| 术语 | 含义 |
|------|------|
| Ego / UMI / 真机·本体 / 仿真·合成 | 数据采集岗位品类；历史产品语境，岗位分类仍见 ITF/ITW/MWV |
| Fit Score | 候选人与岗位匹配分，0–100 |
| 岗位画像 / Profile Rules | 关键词 + 同义词 + 类别，驱动匹配 |
| 评分标准 / Scoring Rules | 维度权重 + 关键词 + matchMode，可选 all 或 any |
| Grade Rules | 分数区间 → 等级/标签/动作 |
| 入围名单 / Shortlist | 高优先级管道，`next_step` 阶段推进 |
| access_token | 面试场次公开入口令牌 |
| Mock API | `VITE_USE_MOCK_API=true` 时前端走 localStorage mock，不连后端 |
| embox-api | 生产环境单体 Edge Function 入口 |

## 5. 架构决策

浓缩自 [PROJECT_CONTEXT](../.claude/memory/PROJECT_CONTEXT.md) 与根 `CLAUDE.md`：

| 决策 | 要点 |
|------|------|
| **双后端** | Dev：Express `:4000`；Prod：Supabase Edge `embox-api`。行为必须对齐。 |
| **Edge 单体** | 免费版函数数量限制 → 25+ 模块打进一个 Deno 函数；路由顺序敏感。 |
| **snake ↔ camel** | DB/API snake_case，前端 camelCase，各 `api.ts` mapper 双向兼容。 |
| **Mock API** | 默认可无库开发；真实 AI/面试需 `USE_MOCK_API=false`。 |
| **PDF 解析路径差** | Dev Express：pdftotext → OCR → MinerU → Vision；Prod：浏览器直调 MinerU，因 Edge 无 `exec`。 |

详细架构见 [`docs/系统架构文档.md`](../docs/系统架构文档.md)。

## 6. 非功能与安全 — 现网可用项

保留旧 PRD 中仍适用的项，删除「微服务 / 数据分片」等与现网不符表述。

| 类别 | 要求 | 状态 |
|------|------|------|
| 性能 | 内部 50 人规模；页面可交互加载；列表分页 | **部分**，无严格 SLA 仪表 |
| 安全 | JWT + RBAC；Helmet + rate limit；CORS 白名单；Webhook `timingSafeEqual` | **已实现**，基础 |
| 审计 | 服务端 audit 中间件；短名单 `status_log` | **部分** |
| 可用性 | Vercel + Supabase 托管 | **已实现** |
| 无障碍 / WCAG | 未系统验收 | **缺失** |
| SSO | 未做 | **规划中** / **缺失** |
| 真实邮件发送 | 外联邮件可记，邮件通道未接 | **缺失** |
| 短信 | 腾讯云 SMS 网关已接 | **已实现**，依赖模板与密钥配置 |

## 7. 模块索引与状态汇总

| 模块 | PRD | 总体状态 | 备注 |
|------|-----|----------|------|
| 工作台 | [01](./01-dashboard.md) | **部分** | UI + 部分真实指标；非全量聚合 |
| 项目管理 | [02](./02-projects.md) | **已实现** | 项目 + 岗位配置完整 |
| 候选人中心 | [03](./03-candidates.md) | **已实现** | 三 Tab；高级筛选/标签仍有增强空间 |
| 招聘推进 | [04](./04-pipeline.md) | **部分** | 短名单、面试邀请、短信已实现；邮件通道缺失 |
| AI 面试 | [05](./05-interviews.md) | **部分** | 音频 + 文本会话已上线；数字人视频 **规划中** |
| 审批中心 | [06](./06-approvals.md) | **已实现** | decide + hire 跨表闭环 |
| 培训学堂 | [07](./07-training.md) | **已实现** | 含路径、门户、公开视频分享 |
| 员工档案 | [08](./08-employees.md) | **已实现** | 含胜任力 AI 推导 |
| 系统管理 | [09](./09-admin.md) | **部分** | Agents/设置/洞察可用；RBAC PUT 未落库；外部 MIS 占位 |

## 8. 已知缺口 / 路线图

对照代码与 PROJECT_CONTEXT，**覆盖** 2026-05-06 缺口文档中已过时项：

| 项 | 状态 | 说明 |
|----|------|------|
| 音频逐题 AI 面试 + Whisper 评分 | **已实现** | 旧缺口文档标「占位」已过时 |
| 文本会话式面试 + SSE | **已实现** | MVP 上线 |
| 数字人视频面试 `video_conversational` | **规划中** | 类型字段预留 |
| 腾讯云短信 | **已实现** | 需配置；管理端有短信模板 Tab |
| 真实邮件发送 | **缺失** | 外联可记渠道，无 SendGrid 等 |
| 外部 MIS / OpenClaw 同步 | **缺失** / 占位 | 集成页多为健康检查 |
| 洞察全真实聚合 | **已实现** | Mock 下用 fixtures；真实 API 走 `/api/insights/overview`；趋势预测仍缺 |
| CI Secrets / Leaked Password Protection | 运维待办 | 见 PROJECT_CONTEXT |
| 批量审批、自定义审批流 | **缺失** | 单条 decide 已够用 |

## 9. 代码入口地图

| 层 | 路径 |
|----|------|
| 前端模块 | `src/modules/{domain}/` |
| 导航 | `src/navigation.ts`、`src/app/navigation.tsx`、`src/app/router/AppRouter.tsx` |
| Express | `server/src/modules/`、`server/src/index.ts` |
| Edge | `supabase/functions/embox-api/` |
| 共享约定 | 根 `CLAUDE.md`、`AGENTS.md`、`server/CLAUDE.md` |

## 10. Open questions

1. 产品是否仍强调 Ego/UMI 四类岗位，还是已完全通用化？UI 仍有分类筛选。
2. 邮件发送是否纳入近期 P0，还是短信 + 人工外联足够？
3. 数字人视频面试的供应商/时间表？目前仅有类型预留。
4. `docs/` 乱码文件是否另开任务统一重命名为 UTF-8 文件名？
