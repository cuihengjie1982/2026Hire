# 05 — AI 面试中心

> 导航：AI 面试中心 `/interviews` | `AppPageId: interviews`  
> 公开入口：`/interview/:token`，候选人使用，无 JWT  
> 关联：[04-pipeline.md](./04-pipeline.md) · [06-approvals.md](./06-approvals.md) · [07-training.md](./07-training.md)

## 模块目标与成功指标

| 目标 | 成功指标 |
|------|----------|
| 标准化面试设计 | 模板 + 题目 + 评分维度 + grade rules 可配置，支持 MD 导入 |
| 可执行面试 | 音频逐题与文本会话式可完成并评分 |
| 结果可决策 | 聚合结果自动创建审批；培训 pre/post 分可更新 |
| 候选人自助 | 公开 token 入口无需登录 |

## 用户故事

1. **作为招募专员**，我在「面试模板」创建模板、编辑题目/追问/评分指南，或导入 Markdown。
2. **作为招募专员**，我在「会话管理」查看场次状态与邀请链接。
3. **作为候选人**，我打开公开链接完成音频答题或文本对话面试。
4. **作为用人经理**，我在「面试结果 / 数据分析」查看分数、等级与维度表现。
5. **作为招募专员**，我在「会话式面试」管理对话型模板与内部试跑。

## 功能范围

### 页面 / Tab — 中心 Hub

| Tab | `?tab=` | UI 文案 |
|-----|---------|---------|
| 面试模板 | `templates` | 面试模板 |
| 会话管理 | `management` | 会话管理 |
| 会话式面试 | `conversational` | 会话式面试 |
| 面试结果 | `results` | 面试结果 |
| 数据分析 | `analytics` | 数据分析 |
| 面试体验 | `preview` | 面试体验，内部预览 |

容器：`InterviewCenterPage.tsx`。

### 面试模式

| 模式 | 值 | 状态 |
|------|-----|------|
| 音频逐题 | `audio_sequential` | **已实现** |
| 文本对话 | `text_chat_conversational` | **已实现**，当前为 MVP，基于 SSE |
| 数字人视频 | `video_conversational` | **规划中**，字段已预留 |

### 评分流水线 — 音频

```
MediaRecorder (WebM/Opus 音频) → POST /interview-scoring/transcribe-and-score
  → Whisper → LLM 评分 → interview_answer_scores
  → aggregate → interview_results → approval_request
```

Whisper 需 OpenAI provider；LLM 评分可用任意已配置 provider。

### 边界与错误态

- 音频超限约 25MB、Whisper 失败、LLM JSON 解析失败 → 题目 score status 失败可重试
- 预览模式无 session：仍可本地聚合保存结果，详见 interviews 模块 CLAUDE.md
- 公开入口 token 无效 → 明确错误页，不泄露内部 ID
- Express conversational 路由在 dev 环境可能为模拟实现；Edge 为生产真逻辑——对齐时注意

## 验收标准

| # | 标准 | 状态 |
|---|------|------|
| AC-1 | 模板 CRUD + 题目批量替换 + MD 导入 | **已实现** |
| AC-2 | 场次创建含 access_token，管理列表可查 | **已实现** |
| AC-3 | 候选人公开入口可完成音频面试并产生成绩 | **已实现** |
| AC-4 | 转写+评分+聚合后自动 pending 审批 | **已实现** |
| AC-5 | 文本会话式：发消息、SSE 流式回复、结束评分 | **已实现** |
| AC-6 | 分析页展示通过率/均分等 | **已实现**，指标依赖真实业务数据 |
| AC-7 | 数字人视频面试端到端 | **规划中** |
| AC-8 | 面试结果批量导出 PDF/Excel | **部分**，对话报告有导出工具，全量导出待确认 |

## 数据实体

| 表 | 用途 |
|----|------|
| `interview_templates` | 模板；`scoring_config`、`grade_rules`、`conversational_config` |
| `interview_questions` | 题目；follow_ups / scoring_guide / linked_dimensions |
| `interview_sessions` | 场次 + access_token |
| `interview_answer_scores` | 逐题成绩 |
| `interview_results` | 聚合结果 + question_answers |
| 对话相关表 | 会话消息等；2026-05-31 已补 RLS |

类型：`src/modules/interviews/types.ts`，约 20+ 接口。

## API 面（关键）

| 前缀 / 路径 | 说明 |
|-------------|------|
| `/api/interview-templates` | 模板/题目，多别名挂载 |
| `/api/interview-sessions`、`/results`、`/analytics` | 场次/结果/分析 |
| `/api/interview-scoring/*` | 转写评分 + aggregate |
| `/api/conversational-interview/*` | 内部对话 + SSE |
| `/api/public/interview`、`/public/conversation` | 候选人公开 |
| Edge：`interviews`、`interview-scoring`、`conversational-interview`、`public-interview`、`public-conversation` | 生产 |

## 代码入口

| 层 | 路径 |
|----|------|
| 前端 | `src/modules/interviews/`，含 hooks、VoiceInput、公开页 |
| 根页 | `src/AIVideoInterviewPage.tsx` 等可能被 preview 引用 |
| Express | `server/src/modules/interviews/*` |
| Edge | `supabase/functions/embox-api/` 下 interviews / scoring / conversational / public-* |
| 指南 | `src/modules/interviews/CLAUDE.md` |

## 依赖与跨模块

- **shortlist**：invite 创建 session
- **approvals**：评分完成自动建审批 + 通知 hiring_manager
- **training**：pre/post interview score
- **ai**：llmClient、Whisper、promptBuilder

## 实现状态汇总

| 能力 | 状态 |
|------|------|
| 模板/场次/结果/分析 UI+API | **已实现** |
| 音频 Pipeline + 公开入口 | **已实现** |
| 文本会话式 MVP | **已实现** |
| 数字人视频 | **规划中** |
| 邀请依赖真实邮件 | **部分**，链接可复制；邮件通道见 pipeline |

## Open questions

1. 数字人供应商与 `avatarConfig` 契约？
2. 生产 Whisper 仅 OpenAI——是否接受多供应商 ASR？
3. 旧缺口文档称「面试体验占位」——**已过时**，勿再当现状。
4. 路由别名多，共 4 套 `interview-*` 前缀——改路由表时防重复注册遗漏。
