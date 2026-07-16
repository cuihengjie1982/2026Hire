# 07 — 培训学堂 + 视频分享

> 导航：培训学堂 `/training`，`AppPageId: training`；视频分享 `/video-sharing/manage`，`AppPageId: videoShare`  
> 公开：候选人门户 `/training/portal/:candidateId?token=`；公开视频 `/training/videos/watch?courseId=&token=`  
> 关联：[05-interviews.md](./05-interviews.md) · [08-employees.md](./08-employees.md)

## 模块目标与成功指标

| 目标 | 成功指标 |
|------|----------|
| 面试薄弱项可培训 | 可建课、报名、考核、看薄弱分析与效果对比 |
| 学习路径 | 路径挂多课，可整体报名 |
| 免登录触达 | 候选人门户 + 员工公开视频链接可分享 |
| 视频边学边记 | `VideoLearningAssistant` 管理端与公开页复用 |

## 用户故事

1. **作为招募专员**，我在「课程管理」创建课程，配置分类、难度、章节与考核。
2. **作为招募专员**，我在「学习路径」编排课程顺序并注册候选人。
3. **作为招募专员**，我在「培训记录」更新进度/分数并 CSV 导出。
4. **作为管理员**，我在「薄弱分析 / 效果统计」看维度柱状图与培训前后分对比。
5. **作为候选人**，我打开门户链接查看自己的课程与进度，无需账号。
6. **作为员工**，我打开公开视频链接观看培训，使用 HMAC token 鉴权。
7. **作为管理员**，我在「视频分享」生成/管理分享链接。

## 功能范围

### 管理端 Tab — TrainingAcademyPage

| Tab | UI 文案 |
|-----|---------|
| courses | 课程管理 |
| paths | 学习路径 |
| enrollments | 培训记录 |
| analysis | 薄弱分析 |
| effectiveness | 效果统计 |

### 视频分享

- 页面：`TrainingVideoSharePage.tsx`
- 路由：`/video-sharing`、`/video-sharing/manage`
- 侧边栏独立项「视频分享」；亦可从 admin 跳转

### Token 算法 — 接手必读

| 场景 | 算法摘要 |
|------|----------|
| 候选人门户 | `Base64(candidateId + JWT_SECRET[0:16]).slice(0, 8)` |
| 公开视频 | `HMAC-SHA256(JWT_SECRET, "training-video:" + courseId)` → base64url；`timingSafeEqual` 校验 |

Express 与 Edge 必须一致。

### 边界与错误态

- 重复报名：`UNIQUE(candidate_id, course_id)`，batch 接口返回 skipped
- token 错误：公开页拒绝，不泄露课程内容
- 删除课程需 admin 权限
- `publicMode` 下助手组件限制写操作

## 验收标准

| # | 标准 | 状态 |
|---|------|------|
| AC-1 | 课程 CRUD + 章节/材料/考核配置 | **已实现** |
| AC-2 | 报名/进度/考核提交并更新状态 | **已实现** |
| AC-3 | 学习路径 + 路径报名 | **已实现** |
| AC-4 | 薄弱分析 + 效果统计 + 课程推荐 API | **已实现** |
| AC-5 | CSV 导出，含 BOM | **已实现** |
| AC-6 | 候选人门户 token 鉴权只读 | **已实现** |
| AC-7 | 生成公开视频链接并可免登录观看 | **已实现** |
| AC-8 | VideoLearningAssistant 管理/公开复用 | **已实现** |
| AC-9 | 培训与绩效 HRIS 深度同步 | **缺失**，未接外部 HR |

## 数据实体

| 表 | 迁移 | 用途 |
|----|------|------|
| `training_courses` | 028 | 课程 JSONB content/materials/assessment_config |
| `training_enrollments` | 028 | 报名；pre/post interview score |
| `training_assessments` | 028 | 考核 |
| `training_paths` / `_courses` / `_enrollments` | 029 | 路径 |

类型：`src/modules/training/types.ts`。

## API 面（关键）

| 路径 | 说明 |
|------|------|
| `/api/training/courses` CRUD | 课程 |
| `/api/training/enrollments` + batch + assessments | 报名/考核 |
| `/api/training/paths` | 路径 |
| `/api/training/analytics/*` | 薄弱/效果/推荐 |
| `/api/training/portal/:candidateId` | 公开门户 |
| `POST /api/training/share-links` | 生成视频分享 |
| `GET /api/training/public/course/:courseId` | 公开读课 |
| Edge `training/` | 生产；handler 体积较大，约 1257 行 |

## 代码入口

| 层 | 路径 |
|----|------|
| 前端 | `src/modules/training/`，含 VideoLearningAssistant、Portal、PublicVideo、VideoShare |
| Express | `server/src/modules/training/training.routes.ts`，门户可能在 index 内联 |
| Edge | `supabase/functions/embox-api/training/` |
| 指南 | `src/modules/training/CLAUDE.md`；`docs/TRAINING_ACADEMY.md` |

## 依赖与跨模块

- **interviews**：薄弱维度、pre/post 分
- **employees**：入职后培训跟踪；`training_score`
- **positions**：课程/胜任力维度映射
- **导航**：`videoShare` 独立于 training 模块 ID，但代码同属 training

## 实现状态汇总

| 能力 | 状态 |
|------|------|
| 学堂 5 Tab + 路径 + 分析 | **已实现** |
| 门户 + 公开视频 + 分享管理 | **已实现** |
| 外部 HR/SSO 学员同步 | **缺失** |

## Open questions

1. 视频分享是否应对非 admin 角色隐藏侧边栏？当前有 `isVideoShareOnly` 特殊布局需考虑。
2. 门户 token 仅 8 字符——安全是否接受？生产是否需升级 HMAC？
3. 大文件视频存储位置，URL 外链或对象存储，需运维文档确认。
