# CLAUDE.md — 培训学堂模块

## 模块概述

培训学堂是招聘→入职→培训闭环的最后一环。支持课程管理、学习路径、候选人注册、考核评估、薄弱项分析、培训效果统计。有两套访问界面：管理员端（`TrainingAcademyPage`，5 个 Tab）和候选人公开门户（`CandidateTrainingPortal`，无账号访问）。

## 目录结构

```
src/modules/training/
├── types.ts                          # 全部类型（15+ 接口）
├── api.ts                            # 全部 API 调用（含 mock store）
├── fixtures.ts                       # Mock 数据（4 课程 + 3 注册）
└── pages/
    ├── TrainingAcademyPage.tsx        # 管理后台（1637 行，5 Tab + 7 Modal 内联）
    └── CandidateTrainingPortal.tsx    # 候选人门户（357 行，只读）
```

所有子组件（Cards, Tabs, Modals）均内联在 `TrainingAcademyPage.tsx` 中，无独立 components/ 目录。

## 后端对应

```
server/src/modules/training/
└── training.routes.ts    # Express 路由（893 行）

# 候选人门户在 server/src/index.ts 内联（行 115-160）
app.get('/api/training/portal/:candidateId', handleTrainingPortal);
```

Edge Function: `supabase/functions/embox-api/training/index.ts`（1257 行）

## 数据库表

| 表 | 迁移 | 用途 |
|-----|------|------|
| `training_courses` | 028 | 课程目录（分类/难度/时长/JSONB 内容/素材/考核配置） |
| `training_enrollments` | 028 | 候选人选课（状态/进度/前后测分数），UNIQUE(candidate_id, course_id) |
| `training_assessments` | 028 | 考核结果（分数/通过/作答/评语） |
| `training_paths` | 029 | 学习路径（分类/等级/认证/封面） |
| `training_path_courses` | 029 | 路径-课程关联（排序/必修），UNIQUE(path_id, course_id) |
| `training_path_enrollments` | 029 | 路径注册（状态/进度），UNIQUE(path_id, candidate_id) |

## 管理后台 5 个 Tab

1. **课程管理 (Courses)** — 课程卡片网格，分类/难度筛选，新建/编辑/删除课程
2. **学习路径 (Learning Paths)** — 路径卡片，拖拽排序课程，注册管理
3. **培训记录 (Enrollments)** — 注册表格，状态筛选，行内评分，CSV 导出
4. **薄弱分析 (Analysis)** — 薄弱维度柱状图，候选人定向课程推荐
5. **效果统计 (Effectiveness)** — 培训前后分数对比（按类别分组）

## 核心 API 端点

### 课程
| `GET /training/courses` | 课程列表（category/positionId/difficulty 筛选） |
| `POST /training/courses` | 创建课程 |
| `PATCH /training/courses/:id` | 更新课程 |
| `DELETE /training/courses/:id` | 删除课程（admin only） |

### 注册
| `GET /training/enrollments` | 注册列表（candidateId/courseId/status 筛选） |
| `POST /training/enrollments` | 注册候选人（自动获取最近面试分数） |
| `PATCH /training/enrollments/:id` | 更新进度/状态/分数 |
| `POST /training/enrollments/batch` | 批量注册 |

### 考核
| `GET /training/enrollments/:id/assessments` | 考核记录 |
| `POST /training/enrollments/:id/assessments` | 提交考核（自动更新注册状态和分数） |

### 学习路径
| `GET /training/paths` | 路径列表（含 enrolled_count + 嵌套课程） |
| `POST /training/paths` | 创建路径 + 附加课程 |
| `PATCH /training/paths/:id` | 更新路径 + 重同步课程 |
| `POST /training/paths/:id/enrollments` | 注册候选人到路径 |

### 分析
| `GET /training/analytics/weakness-analysis` | 薄弱维度聚合 |
| `GET /training/analytics/training-effectiveness` | 培训前后对比 |
| `POST /training/analytics/recommend-courses` | 基于弱项推荐课程 |

### 门户（公开）
| `GET /training/portal/:candidateId?token=` | 候选人查看自己的培训进度 |

## 关键实现细节

### 候选人门户（无 JWT 认证）
- 接入方式：`/training/portal/:candidateId?token=<hash>`
- Token 算法：`Base64(candidateId + JWT_SECRET[0:16]).slice(0, 8)`
- 返回：候选人信息 + 所有注册记录（含课程详情、嵌套考核结果）
- 仅读操作，SELECT only

### 培训效果闭环
```
候选人面试 → interview_results.total_score → pre_interview_score
  → 注册培训 → 完成课程 → 再次面试
  → post_interview_score → 培训效果分析
```

### JSONB 字段
- `training_courses.content` — CourseSection[]
- `training_courses.materials` — CourseMaterial[]
- `training_courses.assessment_config` — AssessmentConfig
- `training_assessments.answers` — 作答数组
- 写入时都需要 `JSON.stringify()`

### 批量注册
`POST /training/enrollments/batch`:
- body: `{candidateIds[], courseId? | pathId?}`
- 返回: `{enrolled[], skipped[], total}`
- 跳过逻辑: ON CONFLICT (candidate_id, course_id) DO NOTHING

## 关联模块
- **interviews**: 面试评分 → pre/post interview score
- **employees**: 入职员工培训跟踪
- **candidates**: 候选人 → 培训注册
- **positions**: 岗位关联 → 胜任力维度映射
