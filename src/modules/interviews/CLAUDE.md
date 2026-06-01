# CLAUDE.md — AI 面试中心模块

## 模块概述

AI 面试中心是整个系统最复杂的模块，管理面试模板、场次、评分、分析，以及对话式 AI 面试。支持三种面试模式：`audio_sequential`（音频逐题）、`text_chat_conversational`（文本对话）、`video_conversational`（数字人视频，规划中）。

## 目录结构

```
src/modules/interviews/
├── types.ts                # 全部类型定义（20+ 接口/类型）
├── api.ts                  # 全部 API 调用（1164 行，含 mock + SSE 流式）
├── hooks.ts                # useInterviewTemplates, useInterviewTemplateDetail, useInterviewSession
├── fixtures.ts             # 空 mock 数据
├── hooks/
│   ├── useConversationInterview.ts        # 对话面试状态机（内部使用）
│   ├── usePublicConversationInterview.ts  # 对话面试状态机（候选人使用）
│   └── useVoiceInput.ts                  # Web Speech API 语音输入
├── components/
│   └── VoiceInputButton.tsx              # 麦克风按钮（三态：不可用/聆听中/空闲）
├── utils/
│   └── exportConversationReport.ts       # 对话面试报告 PDF 导出
└── pages/
    ├── InterviewCenterPage.tsx                  # 中心 Hub（6 个 Tab）
    ├── InterviewTemplatesPage.tsx               # 模板编辑器 → AIInterviewPage
    ├── InterviewManagementPage.tsx              # 场次管理 CRUD
    ├── InterviewResultsPage.tsx                 # 结果列表 + 详情
    ├── InterviewAnalyticsPage.tsx               # 数据分析看板
    ├── InterviewPreviewPage.tsx                 # 音频面试预览 → AIVideoInterviewPage
    ├── ConversationInterviewPage.tsx            # 对话式面试（内部 UI）
    ├── ConversationInterviewManagementPage.tsx   # 对话面试管理
    ├── CandidateInterviewEntry.tsx              # 候选人入口页 /interview/:token
    └── PublicConversationInterviewPage.tsx      # 候选人对话面试 UI
```

## 后端对应

```
server/src/modules/interviews/
├── interviews.routes.ts         # 聚合路由（挂载 session + template + analytics）
├── template.routes.ts           # 模板 + 题目 CRUD
├── session.routes.ts            # 场次 + 结果 CRUD
├── scoring.routes.ts            # AI 评分流水线（Whisper 转录 + LLM 评分 + 聚合）
├── analytics.routes.ts          # 数据分析
├── conversational.routes.ts     # 对话面试（内部使用，dev 模拟）
└── publicConversation.routes.ts # 对话面试（候选人使用，dev 模拟）
```

Edge Function（5 个 handler）:
```
supabase/functions/embox-api/
├── interviews/index.ts              # 模板/题目/场次/结果 CRUD
├── interview-scoring/index.ts       # 转录 + 评分
├── conversational-interview/index.ts # 对话面试 LLM 逻辑
├── public-interview/index.ts        # 候选人公开入口
└── public-conversation/index.ts     # 候选人对话面试
```

## 面试模式

| 模式 | 值 | 状态 | 数据流 |
|------|-----|------|--------|
| 音频逐题 | `audio_sequential` | 已有 | 前端录音 → FormData POST → Whisper → LLM 评分 |
| 文本对话 | `text_chat_conversational` | MVP 已上线 | 候选人消息 → SSE 流式 AI 回复 → 全量评分 |
| 数字人视频 | `video_conversational` | Phase 2 规划 | `avatarConfig` 字段已预留 |

## 路由别名（4 套前缀）

同一套路由（`interviewsRoutes`）挂载在 4 个不同前缀下，内部分发到正确的子路由：

```
/api/interview-templates  → 模板 CRUD（/）
/api/interview-sessions   → 场次 CRUD（/sessions/...）
/api/interview-results    → 结果 CRUD（/results/...）
/api/interview-analytics  → 数据分析（/analytics/...）
```

另有独立的路由：
- `/api/interview-scoring` → `scoringRoutes`（转录 + 评分）
- `/api/public/interview` → 候选人面试入口（无 JWT，token 验证）
- `/api/public/conversation` → 候选人对话面试（无 JWT）

## 核心 API 端点

### 模板与题目
| 端点 | 用途 |
|------|------|
| `GET /interview-templates` | 模板列表（含岗位名称 JOIN） |
| `GET /interview-templates/:id` | 模板详情 + 题目列表 |
| `POST /interview-templates` | 创建模板 |
| `PATCH /interview-templates/:id` | 更新模板（动态字段映射） |
| `DELETE /interview-templates/:id` | 删除模板（级联题目） |
| `PUT /:templateId/questions` | 批量替换题目 |
| `POST /:templateId/questions` | 添加单个题目 |

### 场次与结果
| `GET /interview-sessions/management` | 场次管理列表（JOIN 候选人+模板） |
| `POST /interview-sessions` | 创建场次（自动生成 access_token + 外联记录） |
| `GET /interview-results` | 结果列表（分页） |
| `POST /interview-results` | 创建结果（自动创建审批请求） |

### 对话式面试
| `POST /conversational-interview/sessions` | 创建/恢复对话会话 |
| `POST /conversational-interview/messages` | 发送消息获取 AI 回复 |
| `GET /conversational-interview/messages/stream` | SSE 流式 AI 回复 |
| `POST /conversational-interview/complete` | 结束对话 |
| `POST /conversational-interview/score` | 评分对话 |

### 公共端点（候选人）
| `GET /public/interview?token=` | 验证 token 获取面试信息 |
| `POST /public/conversation/sessions` | 候选人开始对话 |
| `POST /public/conversation/messages` | 候选人发送消息 |

## 评分流水线

```
1. 前端 MediaRecorder 录制音频 (WebM/Opus)
2. POST /interview-scoring/transcribe-and-score (FormData, 25MB 限制)
3. 后端创建 pending 状态的 interview_answer_scores 行
4. OpenAI Whisper 转录 → LLM 多维评分
5. 所有题目完成后 → POST /interview-scoring/aggregate/:sessionId
6. 聚合各题分数 → interview_results → 根据 grade_rules 计算等级
7. 自动创建 approval_request → 通知 hiring_manager
8. 更新 training_enrollments (pre→post 对比)
```

## 关键类型

```typescript
InterviewMode = 'audio_sequential' | 'text_chat_conversational' | 'video_conversational';
ConversationalConfig = {
  maxDurationMinutes, icebreakerMessage, closingMessage,
  allowCandidateQuestions, maxFollowUpsPerTopic, avatarConfig?
};
ConversationSession = { convSessionId, status, messages[], config, ... };
ConversationScore = { overallScore, grade, dimensionScores[], strengths[], weaknesses[], summary };
```

## JSONB 字段注意

这些字段在 INSERT/UPDATE 前需要 `JSON.stringify()`：
- `interview_templates.scoring_config`, `grade_rules`, `conversational_config`
- `interview_questions.follow_ups`, `scoring_guide`, `linked_dimensions`, `trigger_condition`
- `interview_answer_scores.dimension_scores`, `scoring_guide_used`
- `interview_results.question_answers`

## 对接模块
- **shortlist**: `promoteShortlistEntry` → 创建面试场次
- **approvals**: 评分完成后自动创建审批请求
- **training**: 面试分数用于培训效果对比（pre/post interview score）
- **ai**: LLM 调用 (Whisper 转录 + 评分 + 对话)
