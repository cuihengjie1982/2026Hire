# EM-BOX AI招聘平台 — API 接口文档

> 版本: 2.2 | 更新日期: 2026-05-16

## 1. 通用说明

### Base URL
```
https://api.embox-ai.com/v2
```

### 认证方式
所有端点（除 `/auth/login`、`/health` 和 webhooks 外）都需要在请求头中包含 JWT 令牌：

```http
Authorization: Bearer <jwt_token>
```

### 请求格式
- **Content-Type**: `application/json`
- **字符编码**: UTF-8
- **字段约定**: 后端使用 snake_case（如 `duration_minutes`），前端使用 camelCase（如 `durationMinutes`）

### 分页格式
```json
{
  "data": [...],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 100,
    "totalPages": 5
  }
}
```

### 错误响应格式
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "请求参数验证失败"
  }
}
```

### 常用 HTTP 状态码
- `200` - 成功
- `201` - 创建成功
- `204` - 删除成功，无返回内容
- `400` - 请求参数错误
- `401` - 未授权，需要重新登录
- `403` - 权限不足
- `404` - 资源不存在
- `409` - 资源冲突（如重复创建）

---

## 2. 认证模块 (`/api/auth`)

### POST /login - 用户登录
**描述**: 使用邮箱和密码登录，返回 JWT 令牌

**请求参数**:
```json
{
  "email": "admin@example.com",
  "password": "password123"
}
```

**成功响应**:
```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": 1,
    "email": "admin@example.com",
    "name": "管理员",
    "role": "admin",
    "permissions": ["manage_users", "manage_projects"]
  }
}
```

**错误响应**:
```json
{
  "error": {
    "code": "INVALID_CREDENTIALS",
    "message": "邮箱或密码错误"
  }
}
```

**说明**: 登录成功后，需要在后续请求中返回的 `token` 设置到 `Authorization` 头中。

---

### GET /me - 获取当前用户信息
**描述**: 获取当前登录用户的详细信息

**请求头**:
```
Authorization: Bearer <jwt_token>
```

**成功响应**:
```json
{
  "id": 1,
  "email": "admin@example.com",
  "name": "管理员",
  "role": "admin",
  "permissions": ["manage_users", "manage_projects"],
  "createdAt": "2026-01-01T00:00:00Z",
  "lastLoginAt": "2026-05-06T10:30:00Z"
}
```

---

### POST /register - 创建用户
**描述**: 创建新用户（仅管理员权限）

**请求头**:
```
Authorization: Bearer <jwt_token>
```

**请求参数**:
```json
{
  "email": "user@example.com",
  "password": "password123",
  "name": "新用户",
  "role": "user"
}
```

**成功响应**:
```json
{
  "id": 2,
  "email": "user@example.com",
  "name": "新用户",
  "role": "user",
  "createdAt": "2026-05-06T10:30:00Z"
}
```

---

## 3. 项目管理 (`/api/projects`)

### GET / - 获取项目列表
**描述**: 获取项目列表，包含项目统计信息

**请求头**:
```
Authorization: Bearer <jwt_token>
```

**查询参数**:
- `page`: 页码，默认 1
- `limit`: 每页数量，默认 20

**成功响应**:
```json
{
  "data": [
    {
      "id": 1,
      "name": "智能制造项目",
      "city": "上海",
      "manager": "张经理",
      "startDate": "2026-05-01",
      "endDate": "2026-08-31",
      "description": "智能制造岗位招聘",
      "status": "进行中",
      "positionCount": 5,
      "candidateCount": 23,
      "createdAt": "2026-05-01T00:00:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 1,
    "totalPages": 1
  }
}
```

---

### GET /stats - 项目统计
**描述**: 获取项目统计数据

**请求头**:
```
Authorization: Bearer <jwt_token>
```

**成功响应**:
```json
{
  "totalProjects": 3,
  "activeProjects": 2,
  "closedProjects": 1,
  "totalPositions": 15,
  "totalCandidates": 89,
  "avgCandidatesPerProject": 29.7
}
```

---

### POST / - 创建项目
**描述**: 创建新项目

**请求头**:
```
Authorization: Bearer <jwt_token>
```

**请求参数**:
```json
{
  "name": "新项目",
  "city": "北京",
  "manager": "李经理",
  "startDate": "2026-06-01",
  "endDate": "2026-12-31",
  "description": "项目详细描述"
}
```

**成功响应**:
```json
{
  "id": 2,
  "name": "新项目",
  "city": "北京",
  "manager": "李经理",
  "startDate": "2026-06-01",
  "endDate": "2026-12-31",
  "description": "项目详细描述",
  "status": "筹备中",
  "createdAt": "2026-05-06T10:30:00Z"
}
```

---

### PATCH /:id - 更新项目
**描述**: 更新项目基本信息

**请求头**:
```
Authorization: Bearer <jwt_token>
```

**路径参数**:
- `id`: 项目 ID

**请求参数**:
```json
{
  "name": "更新的项目名称",
  "manager": "更新的经理姓名"
}
```

---

### PATCH /:id/status - 更新项目状态
**描述**: 更新项目状态（进行中/筹备中/已关闭）

**请求头**:
```
Authorization: Bearer <jwt_token>
```

**路径参数**:
- `id`: 项目 ID

**请求参数**:
```json
{
  "status": "进行中"
}
```

---

### DELETE /:id - 删除项目
**描述**: 删除项目（将同时删除相关岗位和候选人数据）

**请求头**:
```
Authorization: Bearer <jwt_token>
```

**路径参数**:
- `id`: 项目 ID

**响应**: 204 No Content

---

## 4. 岗位管理 (`/api/positions`)

### GET / - 获取岗位列表
**描述**: 获取岗位列表，可选择按项目过滤

**请求头**:
```
Authorization: Bearer <jwt_token>
```

**查询参数**:
- `projectId`: 项目 ID（可选）
- `page`: 页码，默认 1
- `limit`: 每页数量，默认 20

**成功响应**:
```json
{
  "data": [
    {
      "id": 1,
      "name": "AI算法工程师",
      "category": "技术",
      "projectId": 1,
      "description": "负责AI算法研发",
      "requiredCount": 5,
      "deliveryDays": 30,
      "candidatesCount": 12,
      "createdAt": "2026-05-01T00:00:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 5,
    "totalPages": 1
  }
}
```

---

### GET /:id - 获取岗位详情
**描述**: 获取岗位详细信息，包含岗位配置数据

**请求头**:
```
Authorization: Bearer <jwt_token>
```

**路径参数**:
- `id`: 岗位 ID

**成功响应**:
```json
{
  "id": 1,
  "name": "AI算法工程师",
  "category": "技术",
  "projectId": 1,
  "description": "负责AI算法研发",
  "requiredCount": 5,
  "deliveryDays": 30,
  "positionDetails": {
    "profile": {
      "mustHave": [
        {
          "keyword": "机器学习",
          "synonyms": ["深度学习", "神经网络"],
          "category": "技术技能"
        }
      ],
      "niceToHave": [],
      "bonus": []
    },
    "profile_rules": [
      {
        "keyword": "机器学习",
        "synonyms": ["深度学习", "神经网络"],
        "category": "技术技能"
      }
    ],
    "scoring_rules": [
      {
        "dimension": "经验对口度",
        "weight": 30,
        "keywords": ["数据标注", "AI训练"],
        "matchMode": "any"
      }
    ],
    "grade_rules": [
      {
        "grade": "A",
        "minScore": 80,
        "maxScore": 100,
        "label": "优先录用",
        "action": "interview"
      }
    ],
    "base_score_config": {
      "baseScore": 50,
      "requiredMatchCount": 4,
      "requiredItems": ["电脑操作熟练", "排班出勤"]
    },
    "ai_prompt": "请根据候选人的简历评估其AI算法开发能力..."
  }
}
```

---

### POST / - 创建岗位
**描述**: 创建新岗位

**请求头**:
```
Authorization: Bearer <jwt_token>
```

**请求参数**:
```json
{
  "name": "数据科学家",
  "category": "技术",
  "projectId": 1,
  "description": "负责数据分析",
  "requiredCount": 3,
  "deliveryDays": 45
}
```

**成功响应**:
```json
{
  "id": 2,
  "name": "数据科学家",
  "category": "技术",
  "projectId": 1,
  "description": "负责数据分析",
  "requiredCount": 3,
  "deliveryDays": 45,
  "createdAt": "2026-05-06T10:30:00Z"
}
```

---

### PATCH /:id - 更新岗位
**描述**: 更新岗位基本信息

**请求头**:
```
Authorization: Bearer <jwt_token>
```

**路径参数**:
- `id`: 岗位 ID

**请求参数**:
```json
{
  "name": "更新的岗位名称",
  "requiredCount": 4
}
```

---

### PUT /:id/detail - 更新岗位配置
**描述**: 创建或更新岗位配置信息（画像配置、评分标准、分数档位、基础分配置）

**请求头**:
```
Authorization: Bearer <jwt_token>
```

**路径参数**:
- `id`: 岗位 ID

**请求参数**:
```json
{
  "profile": {
    "mustHave": [
      {
        "keyword": "Python",
        "synonyms": ["python编程", "python开发"],
        "category": "编程技能"
      }
    ],
    "niceToHave": [],
    "bonus": []
  },
  "profile_rules": [
    {
      "keyword": "Python",
      "synonyms": ["python编程", "python开发"],
      "category": "编程技能"
    }
  ],
  "scoring_rules": [
    {
      "dimension": "编程能力",
      "weight": 40,
      "keywords": ["Python", "Java", "C++"],
      "matchMode": "any"
    }
  ],
  "grade_rules": [
    {
      "grade": "A",
      "minScore": 80,
      "maxScore": 100,
      "label": "优先录用",
      "action": "interview"
    },
    {
      "grade": "B",
      "minScore": 60,
      "maxScore": 79,
      "label": "考虑录用",
      "action": "interview"
    },
    {
      "grade": "C",
      "minScore": 40,
      "maxScore": 59,
      "label": "备选",
      "action": "waitlist"
    }
  ],
  "base_score_config": {
    "baseScore": 50,
    "requiredMatchCount": 4,
    "requiredItems": ["电脑操作熟练", "排班出勤"]
  },
  "ai_prompt": "请评估候选人的Python编程能力和相关经验..."
}
```

---

### DELETE /:id - 删除岗位
**描述**: 删除岗位（将同时删除相关候选人数据）

**请求头**:
```
Authorization: Bearer <jwt_token>
```

**路径参数**:
- `id`: 岗位 ID

**响应**: 204 No Content

---

## 5. 候选人管理 (`/api/candidates`)

### GET / - 获取候选人列表
**描述**: 获取候选人列表，包含标签信息

**请求头**:
```
Authorization: Bearer <jwt_token>
```

**查询参数**:
- `page`: 页码，默认 1
- `limit`: 每页数量，默认 20

**成功响应**:
```json
{
  "data": [
    {
      "id": 1,
      "name": "张三",
      "email": "zhangsan@example.com",
      "phone": "13800138000",
      "positionId": 1,
      "positionName": "AI算法工程师",
      "grade": "A",
      "tags": ["高学历", "经验丰富"],
      "resumeUrl": "/uploads/resumes/1.pdf",
      "importedAt": "2026-05-06T10:30:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 89,
    "totalPages": 5
  }
}
```

---

### GET /search - 搜索候选人
**描述**: 按条件搜索候选人

**请求头**:
```
Authorization: Bearer <jwt_token>
```

**查询参数**:
- `keyword`: 搜索关键词
- `positionId`: 岗位 ID
- `grades`: 等级筛选（如 "A,B,C"）
- `page`: 页码，默认 1
- `limit`: 每页数量，默认 20

**成功响应**:
```json
{
  "data": [
    {
      "id": 1,
      "name": "张三",
      "email": "zhangsan@example.com",
      "phone": "13800138000",
      "positionId": 1,
      "positionName": "AI算法工程师",
      "grade": "A",
      "tags": ["高学历", "经验丰富"],
      "resumeUrl": "/uploads/resumes/1.pdf",
      "importedAt": "2026-05-06T10:30:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 15,
    "totalPages": 1
  }
}
```

---

### GET /stats - 候选人统计
**描述**: 获取候选人统计数据

**请求头**:
```
Authorization: Bearer <jwt_token>
```

**成功响应**:
```json
{
  "totalCandidates": 89,
  "gradeDistribution": [
    {"grade": "A", "count": 25},
    {"grade": "B", "count": 40},
    {"grade": "C", "count": 24}
  ],
  "positionDistribution": [
    {"position": "AI算法工程师", "count": 12},
    {"position": "数据科学家", "count": 8}
  ],
  "importSourceDistribution": [
    {"source": "邮件", "count": 65},
    {"source": "导入", "count": 24}
  ]
}
```

---

### GET /:id - 获取候选人详情
**描述**: 获取单个候选人详细信息

**请求头**:
```
Authorization: Bearer <jwt_token>
```

**路径参数**:
- `id`: 候选人 ID

**成功响应**:
```json
{
  "id": 1,
  "name": "张三",
  "email": "zhangsan@example.com",
  "phone": "13800138000",
  "positionId": 1,
  "positionName": "AI算法工程师",
  "grade": "A",
  "tags": ["高学历", "经验丰富"],
  "resumeUrl": "/uploads/resumes/1.pdf",
  "resumeText": "张三，男，28岁，毕业于清华大学计算机科学专业...",
  "aiScore": {
    "totalScore": 85,
    "matchedKeywords": ["机器学习", "Python", "深度学习"],
    "missingKeywords": ["数据标注"],
    "reason": "匹配关键字: 机器学习, Python, 深度学习"
  },
  "interviewHistory": [
    {
      "sessionId": 1,
      "templateName": "AI算法工程师面试",
      "score": 85,
      "result": "通过"
    }
  ],
  "importedAt": "2026-05-06T10:30:00Z"
}
```

---

### POST /import - 导入候选人
**描述**: 导入候选人并自动去重

**请求头**:
```
Authorization: Bearer <jwt_token>
Content-Type: multipart/form-data
```

**表单参数**:
- `file`: 简历文件（PDF, DOC, DOCX）
- `positionId`: 岗位 ID
- `tags`: 标签（可选，逗号分隔）

**成功响应**:
```json
{
  "imported": 3,
  "duplicates": 1,
  "success": [
    {"id": 1, "name": "张三", "email": "zhangsan@example.com"},
    {"id": 2, "name": "李四", "email": "lisi@example.com"}
  ],
  "duplicates": [
    {"id": 3, "name": "王五", "email": "wangwu@example.com", "duplicateOf": 4}
  ],
  "errors": []
}
```

---

### DELETE /:id - 删除候选人
**描述**: 删除候选人

**请求头**:
```
Authorization: Bearer <jwt_token>
```

**路径参数**:
- `id`: 候选人 ID

**响应**: 204 No Content

---

### POST /:id/tags - 更新候选人标签
**描述**: 替换候选人标签

**请求头**:
```
Authorization: Bearer <jwt_token>
```

**路径参数**:
- `id`: 候选人 ID

**请求参数**:
```json
{
  "tags": ["高学历", "经验丰富", "985院校"]
}
```

**成功响应**:
```json
{
  "id": 1,
  "name": "张三",
  "tags": ["高学历", "经验丰富", "985院校"]
}
}
```

---

## 6. 面试模板 (`/api/interview-templates`)

### GET / - 获取模板列表
**描述**: 获取面试模板列表

**请求头**:
```
Authorization: Bearer <jwt_token>
```

**成功响应**:
```json
{
  "data": [
    {
      "id": 1,
      "name": "AI算法工程师面试",
      "positionId": 1,
      "durationMinutes": 45,
      "status": "active",
      "questionsCount": 8,
      "createdAt": "2026-05-01T00:00:00Z"
    }
  ]
}
```

---

### GET /:id - 获取模板详情
**描述**: 获取面试模板详情，包含面试问题

**请求头**:
```
Authorization: Bearer <jwt_token>
```

**路径参数**:
- `id`: 模板 ID

**成功响应**:
```json
{
  "id": 1,
  "name": "AI算法工程师面试",
  "positionId": 1,
  "durationMinutes": 45,
  "status": "active",
  "questions": [
    {
      "id": 1,
      "type": "technical",
      "content": "请介绍一下你对机器学习的理解",
      "required": true,
      "weight": 20,
      "category": "技术基础"
    },
    {
      "id": 2,
      "type": "behavioral",
      "content": "请描述一个你解决过的复杂技术问题",
      "required": false,
      "weight": 10,
      "category": "行为面试"
    }
  ],
  "createdAt": "2026-05-01T00:00:00Z"
}
```

---

### POST / - 创建模板
**描述**: 创建新的面试模板

**请求头**:
```
Authorization: Bearer <jwt_token>
```

**请求参数**:
```json
{
  "name": "数据科学家面试",
  "position_id": 2,
  "duration_minutes": 60,
  "status": "active"
}
```

**成功响应**:
```json
{
  "id": 2,
  "name": "数据科学家面试",
  "positionId": 2,
  "durationMinutes": 60,
  "status": "active",
  "createdAt": "2026-05-06T10:30:00Z"
}
```

---

### PATCH /:id - 更新模板
**描述**: 更新面试模板基本信息

**请求头**:
```
Authorization: Bearer <jwt_token>
```

**路径参数**:
- `id`: 模板 ID

**请求参数**:
```json
{
  "name": "更新的模板名称",
  "duration_minutes": 50
}
```

---

### DELETE /:id - 删除模板
**描述**: 删除面试模板

**请求头**:
```
Authorization: Bearer <jwt_token>
```

**路径参数**:
- `id`: 模板 ID

**响应**: 204 No Content

---

### PUT /:templateId/questions - 批量替换问题
**描述**: 批量替换模板中的所有问题

**请求头**:
```
Authorization: Bearer <jwt_token>
```

**路径参数**:
- `templateId`: 模板 ID

**请求参数**:
```json
{
  "questions": [
    {
      "type": "technical",
      "content": "请介绍一下你对数据分析的理解",
      "required": true,
      "weight": 25,
      "category": "技术基础"
    },
    {
      "type": "behavioral",
      "content": "请描述一个你处理大数据的经验",
      "required": false,
      "weight": 15,
      "category": "行为面试"
    }
  ]
}
```

**成功响应**:
```json
{
  "templateId": 2,
  "questionsCount": 2,
  "replaced": true
}
```

---

### POST /:templateId/questions - 添加问题
**描述**: 向模板中添加单个问题

**请求头**:
```
Authorization: Bearer <jwt_token>
```

**路径参数**:
- `templateId`: 模板 ID

**请求参数**:
```json
{
  "type": "technical",
  "content": "请介绍你对机器学习的理解",
  "required": true,
  "weight": 20,
  "category": "技术基础"
}
```

**成功响应**:
```json
{
  "questionId": 3,
  "templateId": 2,
  "content": "请介绍你对机器学习的理解"
}
```

---

### PATCH /:templateId/questions/:questionId - 更新问题
**描述**: 更新模板中的特定问题

**请求头**:
```
Authorization: Bearer <jwt_token>
```

**路径参数**:
- `templateId`: 模板 ID
- `questionId`: 问题 ID

**请求参数**:
```json
{
  "content": "请详细介绍你对机器学习的理解",
  "weight": 25
}
```

---

### DELETE /:templateId/questions/:questionId - 删除问题
**描述**: 删除模板中的特定问题

**请求头**:
```
Authorization: Bearer <jwt_token>
```

**路径参数**:
- `templateId`: 模板 ID
- `questionId`: 问题 ID

**响应**: 204 No Content

---

## 7. 面试会话 (`/api/interview-sessions`)

### GET /:sessionId - 获取面试会话
**描述**: 获取单个面试会话详情

**请求头**:
```
Authorization: Bearer <jwt_token>
```

**路径参数**:
- `sessionId`: 会话 ID

**成功响应**:
```json
{
  "id": 1,
  "candidateId": 1,
  "candidateName": "张三",
  "templateId": 1,
  "templateName": "AI算法工程师面试",
  "interviewerId": 1,
  "interviewerName": "李面试官",
  "scheduledAt": "2026-05-10T14:00:00Z",
  "durationMinutes": 45,
  "status": "scheduled",
  "meetingUrl": "https://meet.example.com/join/session-123",
  "feedback": null
}
```

---

### GET /management - 获取面试会话管理列表
**描述**: 获取面试会话列表，包含候选人信息和模板信息

**请求头**:
```
Authorization: Bearer <jwt_token>
```

**成功响应**:
```json
{
  "data": [
    {
      "id": 1,
      "candidate": {
        "id": 1,
        "name": "张三",
        "email": "zhangsan@example.com",
        "phone": "13800138000"
      },
      "template": {
        "id": 1,
        "name": "AI算法工程师面试",
        "positionName": "AI算法工程师"
      },
      "interviewer": {
        "id": 1,
        "name": "李面试官"
      },
      "scheduledAt": "2026-05-10T14:00:00Z",
      "durationMinutes": 45,
      "status": "scheduled",
      "meetingUrl": "https://meet.example.com/join/session-123"
    }
  ]
}
```

---

## 8. 面试结果 (`/api/interview-results`)

### GET / - 获取面试结果列表
**描述**: 获取面试结果列表

**请求头**:
```
Authorization: Bearer <jwt_token>
```

**成功响应**:
```json
{
  "data": [
    {
      "id": 1,
      "sessionId": 1,
      "candidateId": 1,
      "candidateName": "张三",
      "templateId": 1,
      "templateName": "AI算法工程师面试",
      "interviewerId": 1,
      "interviewerName": "李面试官",
      "totalScore": 85,
      "result": "通过",
      "feedback": "候选人对机器学习有深入理解，建议录用",
      "createdAt": "2026-05-10T15:30:00Z"
    }
  ]
}
```

---

### POST / - 创建面试结果
**描述**: 创建面试结果并自动创建审批请求

**请求头**:
```
Authorization: Bearer <jwt_token>
```

**请求参数**:
```json
{
  "sessionId": 1,
  "totalScore": 85,
  "result": "通过",
  "feedback": "候选人对机器学习有深入理解，建议录用",
  "questionScores": [
    {
      "questionId": 1,
      "score": 90,
      "feedback": "回答很好"
    },
    {
      "questionId": 2,
      "score": 80,
      "feedback": "回答一般"
    }
  ]
}
```

**成功响应**:
```json
{
  "resultId": 1,
  "approvalRequestId": 1,
  "sessionId": 1,
  "totalScore": 85,
  "result": "通过",
  "feedback": "候选人对机器学习有深入理解，建议录用"
}
```

---

## 9. 面试分析 (`/api/interview-analytics`)

### GET /summary - 获取面试总结
**描述**: 获取面试统计数据

**请求头**:
```
Authorization: Bearer <jwt_token>
```

**成功响应**:
```json
{
  "totalInterviews": 150,
  "completedInterviews": 120,
  "passRate": 65.8,
  "averageScore": 78.5,
  "thisWeekCount": 8,
  "thisMonthCount": 25
}
```

---

### GET /score-distribution - 获取分数分布
**描述**: 获取面试分数分布统计

**请求头**:
```
Authorization: Bearer <jwt_token>
```

**成功响应**:
```json
[
  {"range": "0-59", "count": 15},
  {"range": "60-69", "count": 30},
  {"range": "70-79", "count": 45},
  {"range": "80-89", "count": 25},
  {"range": "90-100", "count": 5}
]
```

---

### GET /pass-rate-trend - 获取通过率趋势
**描述**: 获取月度通过率趋势

**请求头**:
```
Authorization: Bearer <jwt_token>
```

**成功响应**:
```json
[
  {"month": "2024-01", "total": 12, "passed": 8, "passRate": 66.7},
  {"month": "2024-02", "total": 15, "passed": 10, "passRate": 66.7},
  {"month": "2024-03", "total": 18, "passed": 13, "passRate": 72.2}
]
```

---

### GET /position-analytics - 获取岗位分析
**描述**: 获取各岗位的面试统计数据

**请求头**:
```
Authorization: Bearer <jwt_token>
```

**成功响应**:
```json
[
  {
    "position": "AI算法工程师",
    "totalInterviews": 50,
    "passRate": 70,
    "avgScore": 82.5
  },
  {
    "position": "数据科学家",
    "totalInterviews": 30,
    "passRate": 65,
    "avgScore": 78.3
  }
]
```

---

## 10. 审批管理 (`/api/approval-requests`)

### GET / - 获取待审批列表
**描述**: 获取待审批的请求列表

**请求头**:
```
Authorization: Bearer <jwt_token>
```

**成功响应**:
```json
{
  "data": [
    {
      "id": 1,
      "type": "interview_result",
      "candidateName": "张三",
      "positionName": "AI算法工程师",
      "requester": "李面试官",
      "requestedAt": "2026-05-10T15:30:00Z",
      "status": "pending",
      "deadline": "2026-05-12T00:00:00Z"
    }
  ]
}
```

---

### POST / - 创建审批请求
**描述**: 创建新的审批请求

**请求头**:
```
Authorization: Bearer <jwt_token>
```

**请求参数**:
```json
{
  "type": "interview_result",
  "candidateId": 1,
  "positionId": 1,
  "requesterId": 1,
  "requesterName": "李面试官",
  "subject": "张三 - AI算法工程师面试结果审批",
  "details": {
    "totalScore": 85,
    "result": "通过",
    "feedback": "候选人对机器学习有深入理解，建议录用"
  },
  "deadline": "2026-05-12T00:00:00Z"
}
```

**成功响应**:
```json
{
  "id": 1,
  "type": "interview_result",
  "candidateId": 1,
  "positionId": 1,
  "status": "pending",
  "createdAt": "2026-05-10T15:30:00Z"
}
```

---

### POST /:id/decide - 审批决定
**描述**: 批准或拒绝审批请求

**请求头**:
```
Authorization: Bearer <jwt_token>
```

**路径参数**:
- `id`: 审批请求 ID

**请求参数**:
```json
{
  "decision": "approved",
  "comment": "候选人表现优秀，同意录用"
}
```

**成功响应**:
```json
{
  "id": 1,
  "decision": "approved",
  "comment": "候选人表现优秀，同意录用",
  "decidedBy": "1",
  "decidedAt": "2026-05-11T10:00:00Z"
}
```

---

## 11. 名单管理 (`/api/shortlist`)

### GET / - 获取名单列表
**描述**: 获取候选人名单列表

**请求头**:
```
Authorization: Bearer <jwt_token>
```

**查询参数**:
- `projectId`: 项目 ID（可选）
- `positionId`: 岗位 ID（可选）
- `page`: 页码，默认 1
- `limit`: 每页数量，默认 20

**成功响应**:
```json
{
  "data": [
    {
      "id": 1,
      "candidateId": 1,
      "candidateName": "张三",
      "positionId": 1,
      "positionName": "AI算法工程师",
      "addedBy": "李经理",
      "addedAt": "2026-05-06T10:30:00Z",
      "nextStep": "面试邀请",
      "priority": "high"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 15,
    "totalPages": 1
  }
}
```

---

### POST / - 添加到名单
**描述**: 将候选人添加到名单

**请求头**:
```
Authorization: Bearer <jwt_token>
```

**请求参数**:
```json
{
  "candidateId": 1,
  "positionId": 1,
  "priority": "high",
  "notes": "候选人表现优秀"
}
```

**成功响应**:
```json
{
  "id": 1,
  "candidateId": 1,
  "positionId": 1,
  "addedBy": "1",
  "addedAt": "2026-05-06T10:30:00Z"
}
```

---

### POST /:id/promote - 更新下一步
**描述**: 更新候选人的下一步操作

**请求头**:
```
Authorization: Bearer <jwt_token>
```

**路径参数**:
- `id`: 名单 ID

**请求参数**:
```json
{
  "nextStep": "已安排面试",
  "notes": "已安排2026-05-15面试"
}
```

**成功响应**:
```json
{
  "id": 1,
  "nextStep": "已安排面试",
  "notes": "已安排2026-05-15面试",
  "updatedAt": "2026-05-06T11:00:00Z"
}
```

---

### POST /:id/interview-invite - 发送面试邀请
**描述**: 创建外展邀请并更新状态

**请求头**:
```
Authorization: Bearer <jwt_token>
```

**路径参数**:
- `id`: 名单 ID

**请求参数**:
```json
{
  "interviewDate": "2026-05-15T14:00:00Z",
  "interviewerName": "李面试官",
  "meetingUrl": "https://meet.example.com/join/session-123"
}
```

**成功响应**:
```json
{
  "shortlistId": 1,
  "outreachId": 1,
  "interviewDate": "2026-05-15T14:00:00Z",
  "meetingUrl": "https://meet.example.com/join/session-123"
}
```

---

## 12. 联系人管理 (`/api/contacts`)

### GET / - 获取联系人列表
**描述**: 获取联系人列表

**请求头**:
```
Authorization: Bearer <jwt_token>
```

**成功响应**:
```json
{
  "data": [
    {
      "id": 1,
      "name": "王经理",
      "email": "wang@client.com",
      "phone": "13900139000",
      "company": "ABC公司",
      "position": "HR总监",
      "status": "active",
      "notes": "合作愉快"
    }
  ]
}
```

---

### POST / - 创建联系人
**描述**: 创建新联系人

**请求头**:
```
Authorization: Bearer <jwt_token>
```

**请求参数**:
```json
{
  "name": "李经理",
  "email": "li@client.com",
  "phone": "13800138000",
  "company": "XYZ公司",
  "position": "HR经理",
  "notes": "新客户"
}
```

**成功响应**:
```json
{
  "id": 2,
  "name": "李经理",
  "email": "li@client.com",
  "phone": "13800138000",
  "company": "XYZ公司",
  "position": "HR经理",
  "status": "active",
  "notes": "新客户",
  "createdAt": "2026-05-06T10:30:00Z"
}
```

---

### PATCH /:id/status - 更新状态
**描述**: 更新联系人状态

**请求头**:
```
Authorization: Bearer <jwt_token>
```

**路径参数**:
- `id`: 联系人 ID

**请求参数**:
```json
{
  "status": "inactive"
}
```

**成功响应**:
```json
{
  "id": 1,
  "status": "inactive",
  "updatedAt": "2026-05-06T11:00:00Z"
}
```

---

## 13. 外展管理 (`/api/outreach`)

### GET /campaigns - 获取外展活动列表
**描述**: 获取外展活动列表

**请求头**:
```
Authorization: Bearer <jwt_token>
```

**成功响应**:
```json
{
  "data": [
    {
      "id": 1,
      "name": "AI算法工程师招聘",
      "positionId": 1,
      "status": "active",
      "createdBy": "李经理",
      "createdAt": "2026-05-01T00:00:00Z",
      "contactCount": 100,
      "responseCount": 25
    }
  ]
}
```

---

### POST /campaigns - 创建外展活动
**描述**: 创建新的外展活动

**请求头**:
```
Authorization: Bearer <jwt_token>
```

**请求参数**:
```json
{
  "name": "数据科学家招聘",
  "positionId": 2,
  "contactList": [
    {"name": "张总", "email": "zhang@tech.com", "company": "科技公司"},
    {"name": "李总", "email": "li@ai.com", "company": "AI公司"}
  ]
}
```

**成功响应**:
```json
{
  "id": 2,
  "name": "数据科学家招聘",
  "positionId": 2,
  "status": "active",
  "createdBy": "李经理",
  "createdAt": "2026-05-06T10:30:00Z",
  "contactCount": 2
}
```

---

### GET /records - 获取外展记录
**描述**: 获取外展记录列表

**请求头**:
```
Authorization: Bearer <jwt_token>
```

**成功响应**:
```json
{
  "data": [
    {
      "id": 1,
      "campaignId": 1,
      "candidateId": 1,
      "contactName": "张总",
      "contactEmail": "zhang@tech.com",
      "status": "sent",
      "sentAt": "2026-05-06T10:30:00Z",
      "responseAt": null
    }
  ]
}
```

---

### POST /records - 创建外展记录
**描述**: 创建外展记录

**请求头**:
```
Authorization: Bearer <jwt_token>
```

**请求参数**:
```json
{
  "campaignId": 1,
  "candidateId": 1,
  "contactName": "张总",
  "contactEmail": "zhang@tech.com",
  "message": "您好，我们正在招聘AI算法工程师..."
}
```

**成功响应**:
```json
{
  "id": 1,
  "campaignId": 1,
  "candidateId": 1,
  "status": "sent",
  "sentAt": "2026-05-06T10:30:00Z"
}
```

---

### GET /by-candidate - 按候选人获取外展记录
**描述**: 获取候选人的外展记录

**请求头**:
```
Authorization: Bearer <jwt_token>
```

**路径参数**:
- `candidateId`: 候选人 ID

**成功响应**:
```json
{
  "candidateId": 1,
  "outreachRecords": [
    {
      "id": 1,
      "campaignName": "AI算法工程师招聘",
      "sentAt": "2026-05-06T10:30:00Z",
      "status": "sent",
      "responseMessage": null
    }
  ]
}
```

---

## 14. AI Agent管理 (`/api/agents`)

### GET / - 获取Agent列表
**描述**: 获取AI Agent列表

**请求头**:
```
Authorization: Bearer <jwt_token>
```

**成功响应**:
```json
{
  "data": [
    {
      "id": 1,
      "name": "简历解析Agent",
      "description": "解析简历并提取关键信息",
      "model": "gpt-4",
      "status": "running",
      "lastRunAt": "2026-05-06T10:00:00Z",
      "createdAt": "2026-05-01T00:00:00Z"
    }
  ]
}
```

---

### GET /stats - 获取Agent统计
**描述**: 获取Agent运行统计数据

**请求头**:
```
Authorization: Bearer <jwt_token>
```

**成功响应**:
```json
{
  "totalAgents": 3,
  "runningAgents": 2,
  "pausedAgents": 1,
  "totalRuns": 150,
  "successRate": 95.5,
  "avgResponseTime": 2.3
}
```

---

### POST / - 创建Agent
**描述**: 创建新的AI Agent

**请求头**:
```
Authorization: Bearer <jwt_token>
```

**请求参数**:
```json
{
  "name": "面试评估Agent",
  "description": "评估面试结果并给出建议",
  "model": "gpt-4",
  "config": {
    "maxTokens": 1000,
    "temperature": 0.3
  }
}
```

**成功响应**:
```json
{
  "id": 2,
  "name": "面试评估Agent",
  "description": "评估面试结果并给出建议",
  "model": "gpt-4",
  "status": "paused",
  "createdAt": "2026-05-06T10:30:00Z"
}
```

---

### PATCH /:id - 更新Agent
**描述**: 更新Agent配置

**请求头**:
```
Authorization: Bearer <jwt_token>
```

**路径参数**:
- `id`: Agent ID

**请求参数**:
```json
{
  "name": "更新的Agent名称",
  "description": "更新的Agent描述",
  "config": {
    "maxTokens": 1500,
    "temperature": 0.5
  }
}
```

---

### POST /:id/pause - 暂停Agent
**描述**: 暂停Agent运行

**请求头**:
```
Authorization: Bearer <jwt_token>
```

**路径参数**:
- `id`: Agent ID

**成功响应**:
```json
{
  "id": 1,
  "status": "paused",
  "pausedAt": "2026-05-06T11:00:00Z"
}
```

---

### POST /:id/resume - 恢复Agent
**描述**: 恢复Agent运行

**请求头**:
```
Authorization: Bearer <jwt_token>
```

**路径参数**：
- `id`: Agent ID

**成功响应**:
```json
{
  "id": 1,
  "status": "running",
  "resumedAt": "2026-05-06T11:00:00Z"
}
```

---

### POST /:id/run - 执行Agent
**描述**: 手动执行Agent

**请求头**:
```
Authorization: Bearer <jwt_token>
```

**路径参数**:
- `id`: Agent ID

**请求参数**:
```json
{
  "input": "请解析这份简历的关键信息",
  "parameters": {
    "maxTokens": 1000
  }
}
```

**成功响应**:
```json
{
  "id": 1,
  "status": "running",
  "runId": "run-20260506-110000",
  "startedAt": "2026-05-06T11:00:00Z"
}
```

---

### DELETE /:id - 删除Agent
**描述**: 删除Agent

**请求头**:
```
Authorization: Bearer <jwt_token>
```

**路径参数**:
- `id`: Agent ID

**响应**: 204 No Content

---

## 15. AI配置管理 (`/api/ai-configs`)

### GET / - 获取配置列表
**描述**: 获取AI配置列表（API密钥会被遮罩）

**请求头**:
```
Authorization: Bearer <jwt_token>
```

**成功响应**:
```json
{
  "data": [
    {
      "id": 1,
      "name": "OpenAI配置",
      "model": "gpt-4",
      "provider": "openai",
      "isActive": true,
      "apiKey": "•••••••••••••••••••••••••••••",
      "baseUrl": "https://api.openai.com/v1",
      "createdAt": "2026-05-01T00:00:00Z"
    }
  ]
}
```

---

### GET /active - 获取活跃配置
**描述**: 获取当前活跃的AI配置

**请求头**:
```
Authorization: Bearer <jwt_token>
```

**成功响应**:
```json
{
  "id": 1,
  "name": "OpenAI配置",
  "model": "gpt-4",
  "provider": "openai",
  "isActive": true,
  "apiKey": "•••••••••••••••••••••••••••••",
  "baseUrl": "https://api.openai.com/v1",
  "createdAt": "2026-05-01T00:00:00Z"
}
```

---

### POST / - 创建配置
**描述**: 创建新的AI配置

**请求头**:
```
Authorization: Bearer <jwt_token>
```

**请求参数**:
```json
{
  "name": "Claude配置",
  "model": "claude-3",
  "provider": "anthropic",
  "apiKey": "your-api-key-here",
  "baseUrl": "https://api.anthropic.com"
}
```

**成功响应**:
```json
{
  "id": 2,
  "name": "Claude配置",
  "model": "claude-3",
  "provider": "anthropic",
  "isActive": false,
  "apiKey": "•••••••••••••••••••••••••••••",
  "baseUrl": "https://api.anthropic.com",
  "createdAt": "2026-05-06T10:30:00Z"
}
```

---

### PATCH /:id - 更新配置
**描述**: 更新AI配置

**请求头**:
```
Authorization: Bearer <jwt_token>
```

**路径参数**:
- `id`: 配置 ID

**请求参数**:
```json
{
  "name": "更新的配置名称",
  "apiKey": "new-api-key-here"
}
```

---

### DELETE /:id - 删除配置
**描述**: 删除AI配置

**请求头**:
```
Authorization: Bearer <jwt_token>
```

**路径参数**:
- `id`: 配置 ID

**响应**: 204 No Content

---

### POST /switch - 切换活跃配置
**描述**: 切换活跃的AI配置

**请求头**:
```
Authorization: Bearer <jwt_token>
```

**请求参数**:
```json
{
  "configId": 2
}
```

**成功响应**:
{
  "activeConfigId": 2,
  "previousConfigId": 1,
  "switchedAt": "2026-05-06T11:00:00Z"
}
```

---

### POST /health-check - API密钥健康检查
**描述**: 测试AI配置的API密钥是否有效

**请求头**:
```
Authorization: Bearer <jwt_token>
```

**请求参数**:
```json
{
  "configId": 1
}
```

**成功响应**:
```json
{
  "configId": 1,
  "status": "healthy",
  "responseTime": 1200,
  "model": "gpt-4",
  "checkedAt": "2026-05-06T11:00:00Z"
}
```

---

## 16. 用户管理 (`/api/users`)

### POST / - 创建用户
**描述**: 创建新用户（仅管理员权限）

**请求头**:
```
Authorization: Bearer <jwt_token>
```

**请求参数**:
```json
{
  "email": "newuser@example.com",
  "password": "password123",
  "name": "新用户",
  "role": "user"
}
```

**成功响应**:
```json
{
  "id": 3,
  "email": "newuser@example.com",
  "name": "新用户",
  "role": "user",
  "createdAt": "2026-05-06T10:30:00Z"
}
```

---

### GET /me - 获取当前用户
**描述**: 获取当前登录用户信息

**请求头**:
```
Authorization: Bearer <jwt_token>
```

**成功响应**:
```json
{
  "id": 1,
  "email": "admin@example.com",
  "name": "管理员",
  "role": "admin",
  "permissions": ["manage_users", "manage_projects"],
  "createdAt": "2026-01-01T00:00:00Z",
  "lastLoginAt": "2026-05-06T10:30:00Z"
}
```

---

### GET / - 获取用户列表
**描述**: 获取所有用户列表

**请求头**:
```
Authorization: Bearer <jwt_token>
```

**成功响应**:
```json
{
  "data": [
    {
      "id": 1,
      "email": "admin@example.com",
      "name": "管理员",
      "role": "admin",
      "status": "active",
      "createdAt": "2026-01-01T00:00:00Z"
    },
    {
      "id": 2,
      "email": "user@example.com",
      "name": "普通用户",
      "role": "user",
      "status": "active",
      "createdAt": "2026-05-01T00:00:00Z"
    }
  ]
}
```

---

### PATCH /:id - 更新用户
**描述**: 更新用户信息

**请求头**:
```
Authorization: Bearer <jwt_token>
```

**路径参数**:
- `id`: 用户 ID

**请求参数**:
```json
{
  "name": "更新的用户名",
  "role": "admin"
}
```

---

### DELETE /:id - 删除用户
**描述**: 删除用户

**请求头**:
```
Authorization: Bearer <jwt_token>
```

**路径参数**:
- `id`: 用户 ID

**响应**: 204 No Content

---

## 17. 其他端点

### GET /api/insights/overview - 数据概览
**描述**: 获取数据分析概览

**请求头**:
```
Authorization: Bearer <jwt_token>
```

**成功响应**:
```json
{
  "totalCandidates": 89,
  "totalProjects": 3,
  "totalInterviews": 150,
  "avgPassRate": 65.8,
  "activePositions": 5,
  "thisMonthTalent": 25
}
```

---

### GET /api/integrations/overview - 集成概览
**描述**: 获取集成服务概览

**请求头**:
```
Authorization: Bearer <jwt_token>
```

**成功响应**:
```json
{
  "services": [
    {
      "name": "企业微信",
      "status": "connected",
      "lastSync": "2026-05-06T10:30:00Z"
    },
    {
      "name": "钉钉",
      "status": "disconnected",
      "lastSync": null
    }
  ]
}
```

---

### GET /api/integrations/sync - 集成同步
**描述**: 获取集成同步信息

**请求头**:
```
Authorization: Bearer <jwt_token>
```

**成功响应**:
```json
{
  "totalSyncs": 156,
  "lastSync": "2026-05-06T10:30:00Z",
  "syncStatus": "completed",
  "nextSync": "2026-05-06T11:30:00Z"
}
```

---

### GET /api/permissions - 权限列表
**描述**: 获取所有可用权限列表

**请求头**:
```
Authorization: Bearer <jwt_token>
```

**成功响应**:
```json
{
  "permissions": [
    {"id": "manage_users", "name": "用户管理", "description": "管理用户账户"},
    {"id": "manage_projects", "name": "项目管理", "description": "管理项目"},
    {"id": "manage_positions", "name": "岗位管理", "description": "管理岗位"}
  ]
}
```

---

### GET /api/role-permissions - 角色权限映射
**描述**: 获取角色与权限的映射关系

**请求头**:
```
Authorization: Bearer <jwt_token>
```

**成功响应**:
```json
{
  "roles": {
    "admin": ["manage_users", "manage_projects", "manage_positions"],
    "user": ["manage_positions"]
  }
}
```

---

### GET /api/notification-settings - 通知设置
**描述**: 获取通知设置列表

**请求头**:
```
Authorization: Bearer <jwt_token>
```

**成功响应**:
```json
{
  "settings": [
    {
      "id": 1,
      "type": "email",
      "event": "new_candidate",
      "enabled": true
    },
    {
      "id": 2,
      "type": "push",
      "event": "interview_reminder",
      "enabled": false
    }
  ]
}
```

---

### PATCH /api/notification-settings/:id - 切换通知设置
**描述**: 切换通知设置状态

**请求头**:
```
Authorization: Bearer <jwt_token>
```

**路径参数**:
- `id`: 设置 ID

**请求参数**:
```json
{
  "enabled": true
}
```

---

### GET /api/invites - 团队邀请
**描述**: 获取团队邀请列表

**请求头**:
```
Authorization: Bearer <jwt_token>
```

**成功响应**:
```json
{
  "data": [
    {
      "id": 1,
      "email": "invitee@example.com",
      "role": "user",
      "invitedBy": "admin@example.com",
      "invitedAt": "2026-05-06T10:30:00Z",
      "status": "pending"
    }
  ]
}
```

---

### POST /api/invites - 创建邀请
**描述**: 创建团队邀请

**请求头**:
```
Authorization: Bearer <jwt_token>
```

**请求参数**:
```json
{
  "email": "newmember@example.com",
  "role": "user",
  "message": "欢迎加入团队"
}
```

**成功响应**:
```json
{
  "id": 2,
  "email": "newmember@example.com",
  "role": "user",
  "invitedBy": "admin@example.com",
  "invitedAt": "2026-05-06T11:00:00Z",
  "inviteLink": "https://app.example.com/invite/abc123"
}
```

---

### DELETE /api/invites/:email - 删除邀请
**描述**: 删除团队邀请

**请求头**:
```
Authorization: Bearer <jwt_token>
```

**路径参数**:
- `email`: 邀请邮箱

**响应**: 204 No Content

---

### POST /api/webhooks/mis/onboarding-complete - MIS Webhook
**描述**: MIS系统回调接口（公开接口，无需认证）

**请求参数**:
```json
{
  "event": "onboarding_complete",
  "candidateId": 1,
  "timestamp": "2026-05-06T10:30:00Z",
  "data": {
    "onboardingStatus": "completed",
    "documentsSubmitted": true
  }
}
```

**成功响应**:
```json
{
  "status": "received",
  "message": "Webhook received successfully"
}
```

---

### GET /api/health - 健康检查
**描述**: 系统健康检查（公开接口，无需认证）

**成功响应**:
```json
{
  "status": "healthy",
  "timestamp": "2026-05-06T10:30:00Z",
  "version": "2.0.0",
  "uptime": 259200
}
```

---

## 18. 简历解析 (`/api/mineru`)

### POST /file_parse - PDF简历解析（4级降级）
**描述**: 解析PDF简历文件，使用4级降级策略提取文字内容。公开接口，无需认证。

**请求参数**:
```json
{
  "fileBase64": "<文件的base64编码>",
  "fileName": "resume.pdf"
}
```

**解析链路**:
1. `pdftotext` — 文本型PDF直接提取
2. OCR (`pdftoppm` + `tesseract -l chi_sim+eng`) — 扫描版PDF中文OCR
3. MinerU API — 远程API解析 (需配置 `MINERU_API_TOKEN`)
4. LLM Vision — PDF页面转图片，发送给视觉大模型提取文字 (需配置默认AI模型)

**成功响应**:
```json
{
  "success": true,
  "content_md": "# resume.pdf\n\n姓名：张三\n性别：男\n...",
  "content_list": []
}
```

**失败响应** (所有4级均失败):
```json
{
  "error": "No PDF parsing method available"
}
```

---

## 19. AI简历解析 (`/api/ai`)

### POST /parse-resume - AI结构化简历提取
**描述**: 从简历文本中提取结构化信息（姓名、性别、联系方式、教育经历、工作经历等14个字段）。需要认证，使用默认AI模型。

**请求头**:
```
Authorization: Bearer <jwt_token>
```

**请求参数**:
```json
{
  "resumeText": "张三，男，28岁，毕业于清华大学..."
}
```

**成功响应**:
```json
{
  "modelUsed": "gpt-4",
  "provider": "openai",
  "name": "张三",
  "gender": "男",
  "ageOrBirth": "28岁",
  "phone": "13800138000",
  "email": "zhangsan@example.com",
  "location": "北京",
  "highestEducation": "本科",
  "school": "清华大学",
  "major": "计算机科学",
  "educationTime": "2021-2025",
  "expectedSalary": "",
  "currentlyEmployed": "离职",
  "availability": "随时到岗",
  "skills": ["Python", "机器学习", "深度学习"],
  "workExperience": [
    {"company": "ABC科技", "role": "算法工程师", "period": "2025.07-至今", "desc": "负责AI模型开发"}
  ],
  "honors": []
}
```

---

## 20. 面试评分管线 (`/api/interview-scoring`)

### POST /transcribe-and-score - 音频转录与AI评分
**描述**: 接受面试答题音频文件，使用 Whisper 转录文本，然后通过 LLM 进行结构化评分。支持两种模式：有 session 的正式面试和没有 session 的预览评分。

**请求头**:
```
Authorization: Bearer <jwt_token>
Content-Type: multipart/form-data
```

**表单参数**:
- `audio`: 音频文件 (WebM/Opus 格式，MediaRecorder 生成)
- `sessionId`: 面试会话 ID (可选，预览模式不传)
- `questionId`: 问题 ID (可选)
- `questionTitle`: 问题标题
- `questionPrompt`: 问题提示词
- `scoringGuide`: 评分指南 JSON 字符串 (可选)
- `linkedDimensions`: 关联维度 JSON 字符串 (可选)
- `durationSeconds`: 录音时长（秒，可选）

**成功响应**:
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "sessionId": "660e8400-e29b-41d4-a716-446655440000",
  "questionId": "770e8400-e29b-41d4-a716-446655440000",
  "questionTitle": "请介绍一下你的项目经验",
  "transcript": "我之前在ABC公司负责了一个AI模型训练的项目...",
  "score": 82.5,
  "maxScore": 100,
  "scoreReasoning": "候选人展示了丰富的项目经验，逻辑清晰，但缺少对技术细节的深入描述。",
  "dimensionScores": [
    {"name": "项目经验", "score": 85, "weight": 30},
    {"name": "技术深度", "score": 75, "weight": 40},
    {"name": "表达能力", "score": 88, "weight": 30}
  ],
  "llmModel": "gpt-4",
  "llmProvider": "openai",
  "status": "completed"
}
```

**错误响应**:
```json
{
  "error": {
    "code": "TRANSCRIPTION_FAILED",
    "message": "Whisper transcription failed: audio format not supported"
  }
}
```

---

### GET /session/:sessionId - 获取会话评分列表
**描述**: 获取指定面试会话的所有答题评分记录

**请求头**:
```
Authorization: Bearer <jwt_token>
```

**路径参数**:
- `sessionId`: 面试会话 ID

**成功响应**:
```json
{
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "sessionId": "660e8400-e29b-41d4-a716-446655440000",
      "questionId": "770e8400-e29b-41d4-a716-446655440000",
      "questionTitle": "请介绍一下你的项目经验",
      "questionPrompt": "请描述你参与过的最有挑战性的项目...",
      "audioDuration": 180,
      "transcript": "我之前在ABC公司负责了一个AI模型训练的项目...",
      "score": 82.5,
      "maxScore": 100,
      "scoreReasoning": "候选人展示了丰富的项目经验...",
      "dimensionScores": [...],
      "llmModel": "gpt-4",
      "llmProvider": "openai",
      "status": "completed",
      "createdAt": "2026-05-16T10:30:00Z"
    }
  ]
}
```

---

### POST /aggregate/:sessionId - 聚合评分并创建审批
**描述**: 将会话内所有已完成答题评分聚合为面试结果，并自动创建审批请求。

**请求头**:
```
Authorization: Bearer <jwt_token>
```

**路径参数**:
- `sessionId`: 面试会话 ID

**成功响应**:
```json
{
  "resultId": "880e8400-e29b-41d4-a716-446655440000",
  "approvalRequestId": "990e8400-e29b-41d4-a716-446655440000",
  "sessionId": "660e8400-e29b-41d4-a716-446655440000",
  "totalScore": 82.5,
  "grade": "A",
  "gradeLabel": "优先录用",
  "candidateName": "张三",
  "position": "AI算法工程师",
  "templateName": "AI算法工程师面试",
  "questionAnswers": [
    {
      "questionTitle": "请介绍一下你的项目经验",
      "score": 82.5,
      "maxScore": 100
    }
  ]
}
```

**错误响应**:
```json
{
  "error": {
    "code": "NO_COMPLETED_ANSWERS",
    "message": "No completed answer scores found for this session"
  }
}
```

---

## 21. 错误代码参考

| 代码 | 说明 | 解决方案 |
|------|------|----------|
| `INVALID_CREDENTIALS` | 邮箱或密码错误 | 检查登录凭据是否正确 |
| `EMAIL_ALREADY_EXISTS` | 邮箱已存在 | 使用其他邮箱或找回密码 |
| `INVALID_TOKEN` | 无效的JWT令牌 | 重新登录获取新令牌 |
| `PERMISSION_DENIED` | 权限不足 | 联系管理员获取相应权限 |
| `RESOURCE_NOT_FOUND` | 资源不存在 | 检查资源ID是否正确 |
| `VALIDATION_ERROR` | 请求参数验证失败 | 检查请求参数格式和必填字段 |
| `CONFLICT` | 资源冲突 | 如重复创建，检查是否存在重复数据 |
| `RATE_LIMIT_EXCEEDED` | 请求频率超限 | 降低请求频率或联系管理员 |
| `INTERNAL_SERVER_ERROR` | 服务器内部错误 | 稍后重试或联系技术支持 |

---

## 22. 版本历史

### 版本 2.2 (2026-05-16)
- 新增面试评分管线 API（/api/interview-scoring）
- 支持 Whisper 语音转录 + LLM 结构化评分
- 新增 per-question 评分记录（interview_answer_scores 表）
- 新增评分汇总和自动审批请求创建

### 版本 2.1 (2026-05-11)
- 新增简历解析LLM Vision视觉识别兜底 (4级降级链路第4级)
- 新增 `/api/mineru/file_parse` 和 `/api/ai/parse-resume` 端点文档

### 版本 2.0 (2026-05-06)
- 新增面试会话管理模块
- 新增AI Agent管理功能
- 新增外展管理功能
- 优化岗位配置数据结构
- 支持候选人简历AI评分

### 版本 1.0 (2024-01-01)
- 初始版本发布
- 基础项目管理功能
- 岗位配置和管理
- 候选人管理
- 面试模板管理

---

## 23. 联系信息

如有API相关问题，请联系技术支持：

- 邮箱: api-support@embox-ai.com
- 电话: 400-123-4567
- 工作时间: 周一至周五 9:00-18:00