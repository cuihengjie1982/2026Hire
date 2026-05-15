#!/usr/bin/env python3
"""
诺亦腾岗位画像 - 正式版（满分100分制）
基于153名入职者数据推导，两个岗位分开独立设计评分标准
"""

import os
import csv
import re
import fitz
from pathlib import Path
from collections import Counter

RESUME_BASE = Path("/Users/tree/Desktop/Ops Mind Ai/Trai-main/诺亦藤/诺亦藤")

# ============================================================
# 岗位画像标准（基于入职者数据推导）
# ============================================================

SHAPE_PROFILE = {
    "name": "IA数采形体实习生",
    # Nice-to-have 各维度最大值
    "education": {
        "硕士": 14, "博士": 14,
        "本科": 12,
        "专科": 10,
        "高中": 6, "中专": 6,
    },
    "experience": {
        0: 8,   # 应届
        1: 10,
        2: 12,
        5: 16,  # 5年及以上
    },
    "sports_background": {
        True: 18,   # 有体育背景
        False: 0,
    },
    "competition": {
        "国家级": 14,
        "省级": 14,
        "市级": 10,
        "校级": 6,
        "无": 0,
    },
    "major_related": True,
    "major_related_score": 8,
    # Bonus
    "certificate_bonus": 12,
    "skill_bonus_per": 3,
    "skill_bonus_cap": 10,
    "skill_rich_bonus": 5,
    # 关键词
    "keywords": ["体育", "舞蹈", "动作捕捉", "形体", "数据采集", "动作数据",
                 "表演", "武术", "运动训练", "动捕"],
}

DATA_PROFILE = {
    "name": "数采操作员",
    "education": {
        "硕士": 14, "博士": 14,
        "本科": 12,
        "专科": 10,
        "高中": 6, "中专": 6,
    },
    "experience": {
        0: 8,
        1: 12,
        2: 14,
        5: 16,
    },
    "sports_background": {
        True: 12,
        False: 0,
    },
    "competition": {
        "国家级": 14,
        "省级": 14,
        "市级": 10,
        "校级": 6,
        "无": 0,
    },
    "major_related": True,
    "major_related_score": 8,
    "certificate_bonus": 12,
    "skill_bonus_per": 3,
    "skill_bonus_cap": 10,
    "skill_rich_bonus": 5,
    "keywords": ["机器人", "数据采集", "ros", "点云", "质检",
                  "标注", "Python", "数据处理", "机械", "电子"],
}

# 理论满分（用于标准化到100分制）
# Nice满分 = 学历14 + 经验16 + 体育18 + 赛事14 + 专业8 = 70
# Bonus满分 = 证书12 + 关键词10 + 技能丰富5 = 27
# 合计满分 = 97
SHAPE_TOTAL_MAX = 97   # 理论满分
DATA_TOTAL_MAX = 97

# ============================================================
# 等级阈值（基于实际入职者得分分布）
# 形体岗：实际最高分=71.1（原始分），归一化到100分制后阈值为85/70/60
# 数采岗：实际最高分=53.6（原始分），归一化到100分制后阈值为85/70/60
# 但由于理论满分远高于实际得分，需用实际最高分归一化
GRADE_THRESHOLDS = {
    "A": 85,
    "B+": 70,
    "B": 60,
    "C": 0
}

# 各岗位实际最高分（用于归一化到100分制）
SHAPE_ACTUAL_MAX = 71.1   # 形体岗实际最高原始分
DATA_ACTUAL_MAX = 53.6    # 数采岗实际最高原始分

# ============================================================
# 简历解析
# ============================================================

def extract_text(file_path: str) -> str:
    ext = Path(file_path).suffix.lower()
    if ext != ".pdf":
        return ""

    text_parts = []
    try:
        doc = fitz.open(file_path)
        for page in doc:
            txt = page.get_text("text", flags=fitz.TEXT_PRESERVE_WHITESPACE)
            if txt and len(txt.strip()) > 20:
                text_parts.append(txt)
            else:
                try:
                    import pytesseract
                    from PIL import Image, ImageEnhance
                    from io import BytesIO
                    pix = page.get_pixmap(dpi=150)
                    img = Image.open(BytesIO(pix.tobytes("png"))).convert("L")
                    img = ImageEnhance.Sharpness(img).enhance(2.5)
                    ocr = pytesseract.image_to_string(img, lang="chi_sim+eng", config="--psm 6")
                    if ocr.strip():
                        text_parts.append(ocr)
                except Exception:
                    pass
        doc.close()
    except Exception:
        return ""

    return "\n".join(text_parts)


def parse_resume(text: str, filename: str) -> dict:
    info = {
        "filename": filename, "name": "", "gender": "", "age": None,
        "education": "", "major": "", "height": None, "experience_years": 0,
        "sports_background": False, "competition_level": "无",
        "certificate": False, "skills": [], "summary": "", "phone": ""
    }

    if not text or len(text.strip()) < 10:
        info["summary"] = "[图片简历，未能解析]"
        return info

    lines = [l.strip() for l in text.split("\n") if l.strip()]

    # 姓名
    if lines:
        nm = re.search(r'^[\u4e00-\u9fa5]{2,4}', lines[0])
        if nm:
            info["name"] = nm.group()
        else:
            info["name"] = filename.split("_")[0][:8]

    # 性别
    if re.search(r'男[/\s]|性别\s*[男女]|性别男', text):
        info["gender"] = "男"
    elif re.search(r'女[/\s]|性别\s*[女男]', text):
        info["gender"] = "女"

    # 年龄
    m = re.search(r'(\d{2})\s*岁', text)
    if m:
        info["age"] = int(m.group(1))
    else:
        b = re.search(r'(19\d{2}|20[01]\d)[年-]', text)
        if b:
            info["age"] = 2026 - int(b.group(1))

    # 学历（扩展识别高职院校）
    for kw in ["博士", "硕士", "本科", "大专", "专科", "高中", "中专"]:
        if kw in text:
            info["education"] = "专科" if kw == "大专" else kw
            break
    # 高职院校识别为专科
    if not info["education"] and re.search(r'职业技术|职业学院|高职院校|专科学校', text):
        info["education"] = "专科"

    # 工作经验（扩展识别年月格式）
    # 匹配 2024.12-2025.02 这种日期范围
    date_ranges = re.findall(r'(20\d{2})[./年](\d{1,2})\s*[-~至]\s*(20\d{2})[./年](\d{1,2})', text)
    if date_ranges:
        # 取最近一段工作经历，计算月数
        start_year = int(date_ranges[-1][0])
        start_month = int(date_ranges[-1][1])
        # 如果有"至今"则用当前时间
        if "至今" in text:
            end_year, end_month = 2026, 4
        else:
            end_year = int(date_ranges[-1][2])
            end_month = int(date_ranges[-1][3])
        months = (end_year - start_year) * 12 + (end_month - start_month)
        if 0 < months <= 360:
            info["experience_years"] = max(info["experience_years"], months // 12 if months >= 12 else 0)
            if months < 12:
                info["experience_years"] = 0.5  # 不到一年记为0.5年

    exp_nums = [int(x) for x in re.findall(r'(\d+)\s*(?:年|个月)', text)
                 if 0 < int(x) <= 30]
    if exp_nums:
        info["experience_years"] = max(exp_nums)

    # 身高
    for pat in [r'身高[:：]?\s*(\d{3})', r'(\d{3})\s*cm', r'height[:：]?\s*(\d{3})']:
        m = re.search(pat, text, re.IGNORECASE)
        if m:
            h = int(m.group(1))
            if 140 <= h <= 220:
                info["height"] = h
                break

    # 工作经验
    exp_nums = [int(x) for x in re.findall(r'(\d+)\s*(?:年|个月)', text)
                 if 0 < int(x) <= 30]
    if exp_nums:
        info["experience_years"] = max(exp_nums)
    if re.search(r'应届|实习', text) and info["experience_years"] == 0:
        info["experience_years"] = 0

    # 体育背景
    sports_kw = ["体育", "舞蹈", "表演", "武术", "运动训练", "体校", "啦啦操",
                  "健美操", "田径", "篮球", "足球", "游泳", "跆拳道", "柔道",
                  "体操", "瑜伽", "模特", "艺术体操", "跳绳", "轮滑", "跳水",
                  "羽毛球", "乒乓球", "网球", "健身", "跑酷", "街舞", "爵士舞"]
    info["sports_background"] = any(kw in text for kw in sports_kw)

    # 专业（扩展识别动漫/动画/动捕相关）
    major_m = re.search(r'(?:专业|所学专业|主修|动漫)[:：]\s*([\u4e00-\u9fa5a-zA-Z]{2,20})', text)
    if major_m:
        info["major"] = major_m.group(1).strip()
    # 动漫制作技术 -> 自动识别为相关
    if not info["major"] and "动漫制作" in text:
        info["major"] = "动漫制作技术"

    # 赛事（扩展：广东省大学生运动会=省级）
    if "国家级" in text and ("赛" in text or "运动会" in text):
        info["competition_level"] = "国家级"
    elif "省级" in text or "广东省" in text and ("大学生" in text and "运动会" in text):
        info["competition_level"] = "省级"
    elif "市级" in text:
        info["competition_level"] = "市级"
    elif "校级" in text or "院级" in text:
        info["competition_level"] = "校级"

    # 证书
    cert_kw = ["裁判", "教练", "资格证", "社会体育指导员", "职业资格", "运动员等级"]
    info["certificate"] = any(kw in text for kw in cert_kw)

    # 技能
    skills_kw = ["动作捕捉", "动捕", "数据采集", "数采", "MAYA", "3Dmax",
                 "Blender", "Kinect", "惯性动捕", "光学动捕",
                 "Unity", "Unreal", "标注", "质检", "逆向建模",
                 "骨架", "动画", "Mocap", "Python", "C++", "Rviz",
                 "机器人", "ROS", "点云", "SLAM", "机械",
                 "计算机", "信息管理", "物流", "电子", "CAD", "solidworks",
                 "数控", "维护", "操作", "巡检", "车队", "调度", "UG",
                 "CAD", "PLC", "solidworks", "机电", "自动化"]
    found = set()
    for kw in skills_kw:
        if kw.lower() in text.lower():
            found.add(kw)
    info["skills"] = list(found)

    # 电话
    ph = re.search(r'1[3-9]\d{9}', text)
    if ph:
        info["phone"] = ph.group()

    info["summary"] = " ".join(l for l in lines if len(l) > 15)[:200]
    return info


def compute_score(info: dict, profile: dict) -> dict:
    """按岗位画像标准计分，满分100分"""
    edu = info.get("education", "")
    exp = info.get("experience_years", 0)
    sports = info.get("sports_background", False)
    comp = info.get("competition_level", "无")
    cert = info.get("certificate", False)
    major = info.get("major") or ""
    skills = info.get("skills", [])
    major_related = False

    sports_majors = ["体育", "舞蹈", "表演", "武术", "运动", "体校", "艺术",
                      "田径", "体操", "健身", "模特"]
    if any(k in major for k in sports_majors):
        major_related = True

    # Nice-to-have 加分
    nice = 0
    nice_breakdown = {}

    edu_score = profile["education"].get(edu, 0)
    nice += edu_score
    nice_breakdown["学历"] = f"{edu or '未填'}+{edu_score}"

    exp_score = profile["experience"].get(exp, profile["experience"].get(0, 8))
    nice += exp_score
    nice_breakdown["工作经验"] = f"{exp}年+{exp_score}"

    sports_score = profile["sports_background"].get(sports, 0)
    nice += sports_score
    nice_breakdown["体育背景"] = f"{'有' if sports else '无'}+{sports_score}"

    comp_score = profile["competition"].get(comp, 0)
    nice += comp_score
    nice_breakdown["赛事"] = f"{comp}+{comp_score}"

    if profile["major_related"] and major_related:
        nice += 8
        nice_breakdown["专业相关"] = f"{major}+8"
    else:
        nice_breakdown["专业相关"] = f"{major or '未填'}+0"

    # Bonus 加分
    bonus = 0
    bonus_breakdown = {}

    if cert:
        bonus += profile["certificate_bonus"]
        bonus_breakdown["证书"] = f"有+{profile['certificate_bonus']}"

    kw_text = info.get("summary", "") + " " + " ".join(info.get("skills", []))
    kw_matches = sum(1 for kw in profile["keywords"] if kw in kw_text)
    kw_score = min(kw_matches * profile["skill_bonus_per"], profile["skill_bonus_cap"])
    bonus += kw_score
    bonus_breakdown["关键词"] = f"{kw_matches}个+{kw_score}"

    if kw_matches >= 3:
        bonus += profile["skill_rich_bonus"]
        bonus_breakdown["技能丰富"] = f"3个以上+{profile['skill_rich_bonus']}"

    # 标准化到100分制（以实际理论满分为基准）
    total_raw = nice + bonus
    total_max = SHAPE_TOTAL_MAX if "形体" in profile["name"] else DATA_TOTAL_MAX
    actual_max = SHAPE_ACTUAL_MAX if "形体" in profile["name"] else DATA_ACTUAL_MAX

    # 以实际最高分为100%基准，转换为百分制
    # 例如：形体岗最高raw=71.1，若某候选人raw=60，则百分制=60/71.1*100=84.4
    total_100 = round(total_raw / actual_max * 100, 1)

    # 等级
    if total_100 >= GRADE_THRESHOLDS["A"]:
        grade = "A"
    elif total_100 >= GRADE_THRESHOLDS["B+"]:
        grade = "B+"
    elif total_100 >= GRADE_THRESHOLDS["B"]:
        grade = "B"
    else:
        grade = "C"

    # 是否符合面试标准
    matched = "符合" if grade in ("A", "B+", "B") else "不符合"

    return {
        "grade": grade,
        "matched": matched,
        "total_score": total_100,
        "nice_score": nice,
        "nice_max": total_max,
        "bonus_score": bonus,
        "keyword_matches": kw_matches,
        "details": nice_breakdown,
        "bonus_details": bonus_breakdown
    }


def generate_md_report(results: list, position_name: str, profile: dict):
    """生成完整Markdown报告"""
    total = len(results)
    grade_dist = Counter(r.get("grade", "C") for r in results)
    sports_count = sum(1 for r in results if r.get("sports_background"))
    edu_dist = Counter(r.get("education", "未填") for r in results)
    heights = [r["height"] for r in results if r.get("height")]
    avg_h = sum(heights)/len(heights) if heights else 0
    cert_count = sum(1 for r in results if r.get("certificate"))
    comp_dist = Counter(r.get("competition_level", "无") for r in results)
    all_skills = Counter()
    for r in results:
        for s in r.get("skills", []):
            all_skills[s] += 1
    top_skills = all_skills.most_common(10)
    avg_score = sum(r.get("total_score", 0) for r in results) / max(1, total)

    edu_order = ["博士", "硕士", "本科", "专科", "高中", "中专", "未填"]
    edu_rows = [(k, edu_dist.get(k, 0)) for k in edu_order if edu_dist.get(k, 0) > 0]

    lines = []
    lines.append(f"# {position_name} 岗位画像报告\n")
    lines.append(f"**生成时间：** 2026-05-02\n")
    lines.append(f"**数据来源：** 诺亦腾入职人员 · 共 {total} 份\n")

    # ===== 评分标准 =====
    lines.append("""
---

## 一、评分标准（满分100分制）

### 1.1 Nice-to-have 加分项（满分100分）

| 加分项 | 分值 | 说明 |
|--------|------|------|
""")
    for key, val in [("学历", profile["education"]), ("工作经验", profile["experience"]),
                      ("体育/舞蹈背景", profile["sports_background"]),
                      ("赛事经验", profile["competition"])]:
        lines.append(f"| **{key}** | | |")
        if isinstance(val, dict):
            for k, v in val.items():
                lines.append(f"|   → {k} | +{v} | |")

    if profile["major_related"]:
        lines.append(f"| **专业相关** | +8 | 体育/舞蹈/武术/表演等专业 |")

    lines.append(f"""
### 1.2 Bonus 额外加分（满分{profile['certificate_bonus'] + profile['skill_bonus_cap'] + profile['skill_rich_bonus']}分）

| 加分项 | 分值 | 说明 |
|--------|------|------|
| **裁判/教练证书** | +{profile['certificate_bonus']} | 有证书额外加分 |
| **关键词匹配** | 每命中1个+{profile['skill_bonus_per']}，上限{profile['skill_bonus_cap']}分 | |
| **技能丰富（≥3个）** | +{profile['skill_rich_bonus']} | 命中3个以上额外加分 |

**关键词库：** `{"`、`".join(profile["keywords"])}`

### 1.3 等级划分（满分100分）

| 等级 | 分数区间 | 说明 |
|------|----------|------|
| **A** | ≥85分 | 非常优秀，位于前15% |
| **B+** | 70-84分 | 优秀，位于15%-40% |
| **B** | 60-69分 | 符合要求，位于40%-70% |
| **C** | <60分 | 未达标准，后30% |

**计算公式：** 最终得分 = (Nice分 + Bonus分) / (Nice满分 + Bonus满分) × 100
""")

    # ===== 基础统计 =====
    lines.append("\n---\n## 二、入职人员基础统计\n")
    lines.append(f"| 指标 | 数值 | 占比 |\n|------|------|------|")
    lines.append(f"| 入职总人数 | {total} 人 | - |")
    lines.append(f"| 平均得分 | {avg_score:.1f} 分 | - |")
    lines.append(f"| 有体育/舞蹈背景 | {sports_count} 人 | {sports_count/total*100:.1f}% |")
    lines.append(f"| 持有证书(裁判/教练) | {cert_count} 人 | {cert_count/total*100:.1f}% |")
    lines.append(f"| 平均身高 | {avg_h:.1f} cm | （{len(heights)}人填写）|")

    lines.append(f"\n**学历分布：**\n")
    for k, v in edu_rows:
        lines.append(f"- {k}: {v} 人 ({v/total*100:.1f}%)")

    # ===== 等级分布 =====
    lines.append("\n---\n## 三、等级分布\n")
    lines.append(f"| 等级 | 人数 | 占比 | 分数区间 |")
    lines.append("|------|------|------|----------|")
    grade_order = [("A", "优秀", "≥85分"), ("B+", "良好", "70-84分"), ("B", "合格", "60-69分"), ("C", "待提升", "<60分")]
    for g, desc, range_str in grade_order:
        cnt = grade_dist.get(g, 0)
        lines.append(f"| {g}（{desc}） | {cnt} 人 | {cnt/total*100:.1f}% | {range_str} |")

    # ===== 各等级典型画像 =====
    lines.append("\n---\n## 四、各等级典型画像\n")
    for g, desc, _ in grade_order:
        g_results = [r for r in results if r.get("grade") == g]
        if not g_results:
            continue
        avg_edu = Counter(r.get("education","未填") for r in g_results).most_common(1)[0][0]
        avg_sports = sum(1 for r in g_results if r.get("sports_background")) / max(1, len(g_results)) * 100
        avg_exp = sum(r.get("experience_years", 0) for r in g_results) / max(1, len(g_results))
        avg_cert = sum(1 for r in g_results if r.get("certificate")) / max(1, len(g_results)) * 100
        top_g_skills = Counter(s for r in g_results for s in r.get("skills",[])).most_common(3)
        skills_str = "/".join([f"{k}({v}次)" for k, v in top_g_skills]) if top_g_skills else "-"
        lines.append(f"\n**{g}（{desc}）- {len(g_results)}人：**")
        lines.append(f"- 平均学历：{avg_edu}")
        lines.append(f"- 体育背景比例：{avg_sports:.0f}%")
        lines.append(f"- 平均工作经验：{avg_exp:.1f}年")
        lines.append(f"- 证书持有率：{avg_cert:.0f}%")
        lines.append(f"- 典型技能：{skills_str}")

    # ===== 全员评分明细 =====
    lines.append("\n---\n## 五、全员评分明细（符合面试标准→A/B+/B）\n")
    matched_list = [r for r in results if r["matched"] == "符合"]
    not_matched = [r for r in results if r["matched"] == "不符合"]

    lines.append(f"\n**符合面试条件（A/B+/B）：{len(matched_list)} 人**\n")
    lines.append(f"\n| 姓名 | 性别 | 年龄 | 学历 | 经验 | 体育 | 证书 | 等级 | 总分 | Nice分 | Bonus分 | 加分明细 |")
    lines.append("|------|------|------|------|------|------|------|------|------|--------|---------|----------|")

    for r in sorted(matched_list, key=lambda x: x.get("total_score", 0), reverse=True):
        bonus_d = r.get("bonus_details", {})
        bonus_str = "; ".join([f"{k}{v}" for k, v in bonus_d.items()])
        lines.append(f"| {r.get('name','未知')[:8]} | {r.get('gender','?')} | {r.get('age','?')} | {r.get('education','?')} | {r.get('experience_years',0)}年 | {'是' if r.get('sports_background') else '否'} | {'有' if r.get('certificate') else '无'} | **{r.get('grade')}** | {r.get('total_score')} | {r.get('nice_score',0)} | {r.get('bonus_score',0)} | {bonus_str} |")

    lines.append(f"\n**不符合面试条件（C级）：{len(not_matched)} 人**\n")
    lines.append(f"\n| 姓名 | 性别 | 年龄 | 学历 | 等级 | 总分 | 主要不符合项 |")
    lines.append("|------|------|------|------|------|------|------------|")
    for r in sorted(not_matched, key=lambda x: x.get("total_score", 0), reverse=True)[:20]:
        details = r.get("details", {})
        fails = [f"{k}{v}" for k, v in details.items() if v.endswith("+0")]
        lines.append(f"| {r.get('name','未知')[:8]} | {r.get('gender','?')} | {r.get('age','?')} | {r.get('education','?')} | C | {r.get('total_score')} | {', '.join(fails[:3])} |")
    if len(not_matched) > 20:
        lines.append(f"\n*...还有 {len(not_matched)-20} 人*\n")

    # ===== 赛事/技能统计 =====
    lines.append("\n---\n## 六、赛事与技能统计\n")
    lines.append(f"\n**赛事级别分布：**\n")
    lines.append(f"\n| 级别 | 人数 | 占比 |\n|------|------|------|")
    for lvl in ["国家级", "省级", "市级", "校级", "无"]:
        cnt = comp_dist.get(lvl, 0)
        lines.append(f"| {lvl} | {cnt} | {cnt/total*100:.1f}% |")

    if top_skills:
        lines.append(f"\n**高频技能 Top10：**\n")
        lines.append(f"\n| 技能 | 次数 |\n|------|------|")
        for k, v in top_skills:
            lines.append(f"| {k} | {v} |")

    return "\n".join(lines)


def process_position(position_name: str, csv_out: str, profile: dict):
    pos_dir = RESUME_BASE / position_name
    if not pos_dir.exists():
        return []

    files = sorted([f for f in os.listdir(pos_dir) if f.lower().endswith(".pdf")])
    print(f"\n[{position_name}] 共 {len(files)} 份简历")

    results = []
    for i, fname in enumerate(files):
        text = extract_text(str(pos_dir / fname))
        info = parse_resume(text, fname)
        scoring = compute_score(info, profile)
        info.update(scoring)
        results.append(info)
        if (i+1) % 20 == 0:
            print(f"  已处理 {i+1}/{len(files)}")

    # 统计
    matched = [r for r in results if r["matched"] == "符合"]
    grade_dist = Counter(r.get("grade", "C") for r in results)
    print(f"  符合面试: {len(matched)} 人 | A={grade_dist.get('A',0)} B+={grade_dist.get('B+',0)} B={grade_dist.get('B',0)} C={grade_dist.get('C',0)}")

    # 打印符合人员Top5
    print(f"\n  ▶ 符合面试条件 ({len(matched)} 人):")
    for r in sorted(matched, key=lambda x: x.get("total_score", 0), reverse=True)[:5]:
        print(f"    {r['name'][:8]:8s} {r.get('gender','?'):2s} {r.get('education','?'):4s} 经验{r.get('experience_years',0)}年 体育{'是' if r.get('sports_background') else '否'} 等级:{r['grade']} {r['total_score']}分")

    # CSV
    fieldnames = ["name","gender","age","education","major","height",
                  "experience_years","sports_background","competition_level",
                  "certificate","skills","phone","filename",
                  "grade","matched","total_score","nice_score","bonus_score",
                  "keyword_matches","details","bonus_details"]

    with open(csv_out, "w", newline="", encoding="utf-8-sig") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for r in results:
            row = {k: r.get(k, "") for k in fieldnames}
            row["skills"] = ",".join(r.get("skills", []))
            row["details"] = str(r.get("details", {}))
            row["bonus_details"] = str(r.get("bonus_details", {}))
            writer.writerow(row)

    print(f"  CSV: {csv_out}")
    return results


if __name__ == "__main__":
    positions = [
        ("IA数采形体实习生", SHAPE_PROFILE),
        ("数采操作员", DATA_PROFILE),
    ]

    for pos, profile in positions:
        print(f"\n{'='*50}\n处理: {pos}\n{'='*50}")
        csv_path = f"/Users/tree/Desktop/Ops Mind Ai/Trai-main/output_{pos}.csv"
        results = process_position(pos, csv_path, profile)

        if results:
            md = generate_md_report(results, pos, profile)
            md_path = f"/Users/tree/Desktop/Ops Mind Ai/Trai-main/岗位画像_{pos}.md"
            with open(md_path, "w", encoding="utf-8") as f:
                f.write(md)
            print(f"  报告: {md_path}")

    print(f"\n全部完成！等级标准: A≥85 / B+≥70 / B≥60 / C<60")