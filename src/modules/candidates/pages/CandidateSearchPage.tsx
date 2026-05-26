import {AnimatePresence, motion} from 'motion/react';
import {Banknote, Bell, Check, ChevronDown, Building2, Download, Grid, History, List, Loader2, Mail, MapPin, Phone, RefreshCw, Search, Sparkles, Trash2, User, X} from 'lucide-react';
import {useEffect, useState, useMemo, useRef} from 'react';
import {CandidateDetailModal} from '../../../CandidateDetailModal';
import {ResumeImportModal} from '../../talent/components/ResumeImportModal';
import {useCandidates} from '../hooks';
import {useProject} from '../../../app/contexts/ProjectContext';
import {listPositions, getPositionDetail} from '../../positions/api';
import {listCandidates, deleteCandidate, exportCandidatesCsv} from '../api';
import {reparseCandidate} from '../../talent/api';
import {addToShortlist} from '../../shortlist/api';
import {navigateToPage} from '../../../navigation';
import {type PositionSummary} from '../../positions/types';
import {type CandidateCard} from '../types';
import {calculateResumeScore} from '../../../shared/lib/resumeScorer';
import type {ScoreResult} from '../../../shared/lib/resumeScorer';
import type {ParsedResumeInfo} from '../../../shared/lib/mineruClient';
import {screenResumeWithAI, rankCandidatesWithAI, listAIModelConfigs} from '../../ai/api';
import {type AIResumeScoreResult} from '../../ai/types';
import type {PositionDetail} from '../../positions/types';

interface MatchHistory {
  id: string;
  timestamp: Date;
  type: 'ai_search' | 'smart_match' | 'ai_ranking';
  positionId: string;
  positionName: string;
  candidateCount: number;
  candidates: CandidateCard[];
  aiSearchResults?: CandidateCard[];
  computedScores?: Record<string, {fitScore: number[]; grade: string; scoreColor: string; gradeColor: string; scoreResult: ScoreResult}>;
}

function mapRecommendationToGrade(recommendation: string): string {
  switch (recommendation) {
    case '强烈推荐': return 'A';
    case '推荐': return 'B+';
    case '考虑': return 'B';
    default: return 'C';
  }
}

function getGradeColor(grade: string): string {
  switch (grade) {
    case 'A': return 'bg-emerald-500';
    case 'B+': return 'bg-blue-500';
    case 'B': return 'bg-sky-500';
    default: return 'bg-gray-400';
  }
}

function getScoreColor(score: number): string {
  if (score >= 80) return '#10B981';
  if (score >= 60) return '#3B82F6';
  if (score >= 40) return '#0EA5E9';
  return '#6B7280';
}

/**
 * Build a structured, concise recommendation reason from score result.
 * Format: (学历) + (核心经历亮点) + (匹配度/薪资/状态)
 */
/**
 * Build a human-readable recommendation reason from score result.
 * Produces structured paragraph text, not AI-readable keywords.
 */
function buildRecommendationReason(
  parsedInfo: ParsedResumeInfo,
  scoreResult: ScoreResult,
): string {
  const lines: string[] = [];

  // 学历背景
  if (parsedInfo.highestEducation || parsedInfo.school) {
    const edu = parsedInfo.highestEducation || '';
    const school = parsedInfo.school || '';
    const eduText = edu && school ? `${school} ${edu}` : (school || edu);
    lines.push(`学历：${eduText}`);
  }

  // 最近工作经历
  if (parsedInfo.workExperience && parsedInfo.workExperience.length > 0) {
    const firstJob = parsedInfo.workExperience[0];
    if (typeof firstJob === 'string' && firstJob.length > 0) {
      const short = firstJob.length > 50 ? firstJob.slice(0, 50) + '…' : firstJob;
      lines.push(`经历：${short}`);
    }
  }

  // 匹配情况
  if (scoreResult) {
    const {matchedKeywords, missingKeywords} = scoreResult;
    if (matchedKeywords && matchedKeywords.length > 0) {
      const kw = matchedKeywords.slice(0, 4).join('、');
      lines.push(`匹配关键词：${kw}`);
    }
    if (missingKeywords && missingKeywords.length > 0 && missingKeywords.length <= 3) {
      lines.push(`待补充：${missingKeywords.join('、')}`);
    }
  }

  // 当前状态
  if (parsedInfo.currentlyEmployed) {
    lines.push(`现状：${parsedInfo.currentlyEmployed}`);
  }

  return lines.length > 0 ? lines.join('\n') : '暂无详细信息';
}

// Extract last job (company + role) from rawText
const extractLastJob = (rawText?: string): {company: string; role: string} => {
  if (!rawText) return {company: '', role: ''};
  // Match patterns like "公司名称 · 职位" or "公司名称-职位"
  const patterns = [
    /([^\n\r,，]{2,20}公司)[·\-–—]([^\n\r,，]{1,15})/,
    /(?:工作经历|职业经历)[：:\s]*([^\n\r,，]{2,20})[·\-–—]([^\n\r,，]{1,15})/,
    /([^\n\r]{2,20})(?:有限公司|集团|企业)[·\-–—]?([^\n\r]{1,15})/,
  ];
  for (const pat of patterns) {
    const m = rawText.match(pat);
    if (m) return {company: m[1].trim(), role: m[2].trim()};
  }
  return {company: '', role: ''};
};

// 中国省级行政区划数据
const PROVINCES: Record<string, string[]> = {
  "北京市": ["北京"], "天津市": ["天津"], "上海市": ["上海"], "重庆市": ["重庆"],
  "河北省": ["石家庄", "唐山", "秦皇岛", "邯郸", "邢台", "保定", "张家口", "承德", "沧州", "廊坊", "衡水"],
  "山西省": ["太原", "大同", "阳泉", "长治", "晋城", "朔州", "晋中", "运城", "忻州", "临汾", "吕梁"],
  "辽宁省": ["沈阳", "大连", "鞍山", "抚顺", "本溪", "丹东", "锦州", "营口", "阜新", "辽阳", "盘锦", "铁岭", "朝阳", "葫芦岛"],
  "吉林省": ["长春", "吉林", "四平", "辽源", "通化", "白山", "松原", "白城", "延边"],
  "黑龙江省": ["哈尔滨", "齐齐哈尔", "鸡西", "鹤岗", "双鸭山", "大庆", "伊春", "佳木斯", "七台河", "牡丹江", "黑河", "绥化", "大兴安岭"],
  "江苏省": ["南京", "无锡", "徐州", "常州", "苏州", "南通", "连云港", "淮安", "盐城", "扬州", "镇江", "泰州", "宿迁"],
  "浙江省": ["杭州", "宁波", "温州", "嘉兴", "湖州", "绍兴", "金华", "衢州", "舟山", "台州", "丽水"],
  "安徽省": ["合肥", "芜湖", "蚌埠", "淮南", "马鞍山", "淮北", "铜陵", "安庆", "黄山", "滁州", "阜阳", "宿州", "六安", "亳州", "池州", "宣城"],
  "福建省": ["福州", "厦门", "莆田", "三明", "泉州", "漳州", "南平", "龙岩", "宁德"],
  "江西省": ["南昌", "景德镇", "萍乡", "九江", "新余", "鹰潭", "赣州", "吉安", "宜春", "抚州", "上饶"],
  "山东省": ["济南", "青岛", "淄博", "枣庄", "东营", "烟台", "潍坊", "济宁", "泰安", "威海", "日照", "临沂", "德州", "聊城", "滨州", "菏泽", "莱芜"],
  "河南省": ["郑州", "开封", "洛阳", "平顶山", "安阳", "鹤壁", "新乡", "焦作", "濮阳", "许昌", "漯河", "三门峡", "南阳", "商丘", "信阳", "周口", "驻马店"],
  "湖北省": ["武汉", "黄石", "十堰", "宜昌", "襄阳", "鄂州", "荆门", "孝感", "荆州", "黄冈", "咸宁", "随州", "恩施"],
  "湖南省": ["长沙", "株洲", "湘潭", "衡阳", "邵阳", "岳阳", "常德", "张家界", "益阳", "郴州", "永州", "怀化", "娄底", "湘西"],
  "广东省": ["广州", "深圳", "珠海", "汕头", "佛山", "韶关", "湛江", "肇庆", "江门", "茂名", "惠州", "梅州", "汕尾", "河源", "阳江", "清远", "东莞", "中山", "潮州", "揭阳", "云浮"],
  "海南省": ["海口", "三亚", "三沙", "儋州"],
  "四川省": ["成都", "自贡", "攀枝花", "泸州", "德阳", "绵阳", "广元", "遂宁", "内江", "乐山", "南充", "眉山", "宜宾", "广安", "达州", "雅安", "巴中", "资阳", "阿坝", "甘孜", "凉山"],
  "贵州省": ["贵阳", "六盘水", "遵义", "安顺", "毕节", "铜仁", "黔西南", "黔东南", "黔南"],
  "云南省": ["昆明", "曲靖", "玉溪", "保山", "昭通", "丽江", "普洱", "临沧", "楚雄", "红河", "文山", "西双版纳", "大理", "德宏", "怒江", "迪庆"],
  "陕西省": ["西安", "铜川", "宝鸡", "咸阳", "渭南", "延安", "汉中", "榆林", "安康", "商洛"],
  "甘肃省": ["兰州", "嘉峪关", "金昌", "白银", "天水", "武威", "张掖", "平凉", "酒泉", "庆阳", "定西", "陇南", "临夏", "甘南"],
  "青海省": ["西宁", "海东", "海北", "黄南", "海南", "果洛", "玉树", "海西"],
  "内蒙古": ["呼和浩特", "包头", "乌海", "赤峰", "通辽", "鄂尔多斯", "呼伦贝尔", "巴彦淖尔", "乌兰察布", "兴安", "锡林郭勒", "阿拉善"],
  "广西": ["南宁", "柳州", "桂林", "梧州", "北海", "防城港", "钦州", "贵港", "玉林", "百色", "贺州", "河池", "来宾", "崇左"],
  "西藏": ["拉萨", "日喀则", "昌都", "林芝", "山南", "那曲", "阿里"],
  "宁夏": ["银川", "石嘴山", "吴忠", "固原", "中卫"],
  "新疆": ["乌鲁木齐", "克拉玛依", "吐鲁番", "哈密", "昌吉", "博尔塔拉", "巴音郭楞", "阿克苏", "克孜勒苏", "喀什", "和田", "伊犁", "塔城", "阿勒泰"],
  "台湾": ["台北", "新北", "桃园", "台中", "台南", "高雄", "基隆", "新竹", "嘉义"],
  "香港": ["香港"], "澳门": ["澳门"],
};

// 大学专业大类及二级专业
const MAJOR_CATEGORIES: Record<string, string[]> = {
  "哲学": ["哲学"],
  "经济学": ["经济学", "财政学", "金融学", "经济与贸易"],
  "法学": ["法学", "政治学", "社会学", "民族学", "马克思主义理论", "公安学"],
  "教育学": ["教育学", "体育学"],
  "文学": ["中国语言文学", "外国语言文学", "新闻传播学"],
  "历史学": ["历史学"],
  "理学": ["数学", "物理学", "化学", "天文学", "地理科学", "大气科学", "海洋科学", "地球物理学", "地质学", "生物科学", "心理学", "统计学"],
  "工学": ["力学", "机械", "仪器", "材料", "能源动力", "电气", "电子信息", "自动化", "计算机", "土木", "水利", "测绘", "化工与制药", "地质", "矿业", "纺织", "轻工", "交通运输", "船舶与海洋工程", "航空航天", "兵器", "核工程", "农业工程", "林业工程", "环境科学与工程", "生物医学工程", "食品科学与工程", "建筑", "安全科学与工程", "生物工程", "公安技术", "交叉工程"],
  "农学": ["植物生产", "动物生产", "动物医学", "林学", "水产", "草学", "自然保护与环境生态"],
  "医学": ["基础医学", "临床医学", "口腔医学", "公共卫生与预防医学", "中医学", "中西医结合", "药学", "中药学", "法医学", "医学技术", "护理学"],
  "管理学": ["管理科学与工程", "工商管理", "农林经济管理", "公共管理", "图书情报与档案管理", "物流管理与工程", "工业工程", "电子商务", "旅游管理"],
  "艺术学": ["艺术理论", "音乐与舞蹈学", "戏剧与影视学", "美术学", "设计学"],
};

// 两级联动下拉选择器组件
const CascadingSelect = ({province, city, onProvinceChange, onCityChange, className = ""}: {
  province: string; city: string; onProvinceChange: (p: string) => void; onCityChange: (c: string) => void; className?: string;
}) => {
  const [provinceOpen, setProvinceOpen] = useState(false);
  const [cityOpen, setCityOpen] = useState(false);
  const [provinceSearch, setProvinceSearch] = useState("");
  const [citySearch, setCitySearch] = useState("");
  const provinceRef = useRef<HTMLDivElement>(null);
  const cityRef = useRef<HTMLDivElement>(null);
  const provinceList = Object.keys(PROVINCES);
  const filteredProvinces = provinceList.filter(p => p.includes(provinceSearch));
  const cityList = province ? (PROVINCES[province] || []) : [];
  const filteredCities = cityList.filter(c => c.includes(citySearch));
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (provinceRef.current && !provinceRef.current.contains(e.target as Node)) { setProvinceOpen(false); setProvinceSearch(""); }
      if (cityRef.current && !cityRef.current.contains(e.target as Node)) { setCityOpen(false); setCitySearch(""); }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);
  const handleProvinceSelect = (p: string) => { onProvinceChange(p); onCityChange(""); setProvinceOpen(false); setProvinceSearch(""); };
  return (
    <div className={`flex gap-2 ${className}`}>
      <div ref={provinceRef} className="relative">
        <button type="button" onClick={() => setProvinceOpen(!provinceOpen)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-[#1a4bc4] bg-white flex items-center justify-between min-w-[120px]">
          <span className={province ? "text-gray-900" : "text-gray-400"}>{province || "选择省份"}</span>
          <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${provinceOpen ? "rotate-180" : ""}`} />
        </button>
        {provinceOpen && (
          <div className="absolute top-full left-0 mt-1 w-[180px] bg-white border border-gray-200 rounded-lg shadow-lg z-30 max-h-[250px] overflow-hidden">
            <div className="p-2 border-b border-gray-100">
              <input type="text" value={provinceSearch} onChange={e => setProvinceSearch(e.target.value)} placeholder="搜索省份..." className="w-full px-2 py-1.5 border border-gray-200 rounded text-[12px] focus:outline-none focus:ring-1 focus:ring-[#1a4bc4]" autoFocus />
            </div>
            <div className="overflow-y-auto max-h-[200px]">
              {filteredProvinces.map(p => (
                <button key={p} type="button" onClick={() => handleProvinceSelect(p)} className={`w-full px-3 py-2 text-[13px] text-left hover:bg-gray-50 ${province === p ? "bg-[#1a4bc4]/5 text-[#1a4bc4]" : "text-gray-700"}`}>{p}</button>
              ))}
            </div>
          </div>
        )}
      </div>
      <div ref={cityRef} className="relative">
        <button type="button" onClick={() => { if (!province) { alert("请先选择省份"); return; } setCityOpen(!cityOpen); }} className={`w-full px-3 py-2 border border-gray-200 rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-[#1a4bc4] bg-white flex items-center justify-between min-w-[120px] ${!province ? "opacity-50 cursor-not-allowed" : ""}`}>
          <span className={city ? "text-gray-900" : "text-gray-400"}>{city || "选择城市"}</span>
          <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${cityOpen ? "rotate-180" : ""}`} />
        </button>
        {cityOpen && (
          <div className="absolute top-full left-0 mt-1 w-[180px] bg-white border border-gray-200 rounded-lg shadow-lg z-30 max-h-[250px] overflow-hidden">
            <div className="p-2 border-b border-gray-100">
              <input type="text" value={citySearch} onChange={e => setCitySearch(e.target.value)} placeholder="搜索城市..." className="w-full px-2 py-1.5 border border-gray-200 rounded text-[12px] focus:outline-none focus:ring-1 focus:ring-[#1a4bc4]" autoFocus />
            </div>
            <div className="overflow-y-auto max-h-[200px]">
              {filteredCities.map(c => (
                <button key={c} type="button" onClick={() => { onCityChange(c); setCityOpen(false); setCitySearch(""); }} className={`w-full px-3 py-2 text-[13px] text-left hover:bg-gray-50 ${city === c ? "bg-[#1a4bc4]/5 text-[#1a4bc4]" : "text-gray-700"}`}>{c}</button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// 专业两级联动选择器
const MajorSelect = ({category, major, onCategoryChange, onMajorChange, className = ""}: {
  category: string; major: string; onCategoryChange: (c: string) => void; onMajorChange: (m: string) => void; className?: string;
}) => {
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [majorOpen, setMajorOpen] = useState(false);
  const [categorySearch, setCategorySearch] = useState("");
  const [majorSearch, setMajorSearch] = useState("");
  const categoryRef = useRef<HTMLDivElement>(null);
  const majorRef = useRef<HTMLDivElement>(null);
  const categoryList = Object.keys(MAJOR_CATEGORIES);
  const filteredCategories = categoryList.filter(c => c.includes(categorySearch));
  const majorList = category ? (MAJOR_CATEGORIES[category] || []) : [];
  const filteredMajors = majorList.filter(m => m.includes(majorSearch));
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (categoryRef.current && !categoryRef.current.contains(e.target as Node)) { setCategoryOpen(false); setCategorySearch(""); }
      if (majorRef.current && !majorRef.current.contains(e.target as Node)) { setMajorOpen(false); setMajorSearch(""); }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);
  const handleCategorySelect = (c: string) => { onCategoryChange(c); onMajorChange(""); setCategoryOpen(false); setCategorySearch(""); };
  return (
    <div className={`flex gap-2 ${className}`}>
      <div ref={categoryRef} className="relative">
        <button type="button" onClick={() => setCategoryOpen(!categoryOpen)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-[#1a4bc4] bg-white flex items-center justify-between min-w-[120px]">
          <span className={category ? "text-gray-900" : "text-gray-400"}>{category || "选择大类"}</span>
          <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${categoryOpen ? "rotate-180" : ""}`} />
        </button>
        {categoryOpen && (
          <div className="absolute top-full left-0 mt-1 w-[180px] bg-white border border-gray-200 rounded-lg shadow-lg z-30 max-h-[250px] overflow-hidden">
            <div className="p-2 border-b border-gray-100">
              <input type="text" value={categorySearch} onChange={e => setCategorySearch(e.target.value)} placeholder="搜索大类..." className="w-full px-2 py-1.5 border border-gray-200 rounded text-[12px] focus:outline-none focus:ring-1 focus:ring-[#1a4bc4]" autoFocus />
            </div>
            <div className="overflow-y-auto max-h-[200px]">
              {filteredCategories.map(c => (
                <button key={c} type="button" onClick={() => handleCategorySelect(c)} className={`w-full px-3 py-2 text-[13px] text-left hover:bg-gray-50 ${category === c ? "bg-[#1a4bc4]/5 text-[#1a4bc4]" : "text-gray-700"}`}>{c}</button>
              ))}
            </div>
          </div>
        )}
      </div>
      <div ref={majorRef} className="relative">
        <button type="button" onClick={() => { if (!category) { alert("请先选择专业大类"); return; } setMajorOpen(!majorOpen); }} className={`w-full px-3 py-2 border border-gray-200 rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-[#1a4bc4] bg-white flex items-center justify-between min-w-[120px] ${!category ? "opacity-50 cursor-not-allowed" : ""}`}>
          <span className={major ? "text-gray-900" : "text-gray-400"}>{major || "选择具体专业"}</span>
          <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${majorOpen ? "rotate-180" : ""}`} />
        </button>
        {majorOpen && (
          <div className="absolute top-full left-0 mt-1 w-[180px] bg-white border border-gray-200 rounded-lg shadow-lg z-30 max-h-[250px] overflow-hidden">
            <div className="p-2 border-b border-gray-100">
              <input type="text" value={majorSearch} onChange={e => setMajorSearch(e.target.value)} placeholder="搜索专业..." className="w-full px-2 py-1.5 border border-gray-200 rounded text-[12px] focus:outline-none focus:ring-1 focus:ring-[#1a4bc4]" autoFocus />
            </div>
            <div className="overflow-y-auto max-h-[200px]">
              {filteredMajors.map(m => (
                <button key={m} type="button" onClick={() => { onMajorChange(m); setMajorOpen(false); setMajorSearch(""); }} className={`w-full px-3 py-2 text-[13px] text-left hover:bg-gray-50 ${major === m ? "bg-[#1a4bc4]/5 text-[#1a4bc4]" : "text-gray-700"}`}>{m}</button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export const CandidateSearchPage = () => {
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [selectedCandidate, setSelectedCandidate] = useState<CandidateCard | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [selectedGrades, setSelectedGrades] = useState<Set<string>>(new Set());
  const {data: candidatesData, setData, error, isLoading, refresh} = useCandidates();
  const {projects} = useProject();
  // When true, smart match scoring skips recalculation (viewing history preserves scores)
  const [suppressSmartMatchEffect, setSuppressSmartMatchEffect] = useState(false);

  // AI Search modal state
  const [showAISearchModal, setShowAISearchModal] = useState(false);
  const [aiSearchQuery, setAiSearchQuery] = useState('');
  const [aiSearchActive, setAiSearchActive] = useState(false);
  const [aiSearchResults, setAiSearchResults] = useState<CandidateCard[]>([]);
  const [isAISearching, setIsAISearching] = useState(false);
  const [smartMatchActive, setSmartMatchActive] = useState(false);
  const [isAIRanking, setIsAIRanking] = useState(false);

  // Whether any search has been performed (AI search or smart match)
  const hasSearched = aiSearchActive || smartMatchActive;

  // Position selection state
  const [positions, setPositions] = useState<PositionSummary[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [selectedPositionId, setSelectedPositionId] = useState<string>('');
  const [positionDetail, setPositionDetail] = useState<PositionDetail | null>(null);
  const [computedScores, setComputedScores] = useState<Record<string, {fitScore: number[]; grade: string; scoreColor: string; gradeColor: string; scoreResult: ScoreResult}>>({});
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [searchText, setSearchText] = useState('');
  const [sortOption, setSortOption] = useState<'relevance' | 'newest' | 'score'>('relevance');
  const [showMoreFilters, setShowMoreFilters] = useState(false);
  const [experienceFilter, setExperienceFilter] = useState('all');
  const [provinceFilter, setProvinceFilter] = useState('');
  const [cityFilter, setCityFilter] = useState('');
  const [educationFilter, setEducationFilter] = useState('all');
  const [majorCategoryFilter, setMajorCategoryFilter] = useState('');
  const [majorFilter, setMajorFilter] = useState('');
  const [matchTimeWindow, setMatchTimeWindow] = useState<'all' | 'week' | 'month' | 'custom'>('all');
  const [matchDateFrom, setMatchDateFrom] = useState('');
  const [matchDateTo, setMatchDateTo] = useState('');
  const [historyTimeWindow, setHistoryTimeWindow] = useState<'all' | 'week' | '3days'>('week');
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Match history
  const [matchHistory, setMatchHistory] = useState<MatchHistory[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [historyFilterPosition, setHistoryFilterPosition] = useState('');

  const HISTORY_KEY = 'em-box.match-history';

  // Load match history from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(HISTORY_KEY);
      if (saved) setMatchHistory(JSON.parse(saved));
    } catch {}
  }, []);

  const saveMatchHistory = (item: Omit<MatchHistory, 'id' | 'timestamp'>) => {
    const newItem: MatchHistory = {
      ...item,
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      timestamp: new Date(),
    };
    setMatchHistory(prev => {
      const updated = [newItem, ...prev].slice(0, 10);
      try { localStorage.setItem(HISTORY_KEY, JSON.stringify(updated)); } catch {}
      return updated;
    });
  };

  const deleteMatchHistoryItem = (id: string) => {
    setMatchHistory(prev => {
      const updated = prev.filter(h => h.id !== id);
      try { localStorage.setItem(HISTORY_KEY, JSON.stringify(updated)); } catch {}
      return updated;
    });
  };

  const clearMatchHistory = () => {
    setMatchHistory([]);
    try { localStorage.removeItem(HISTORY_KEY); } catch {}
  };

  const viewMatchHistory = (item: MatchHistory) => {
    // Restore full match results from history: candidates list + scores + position
    // Suppress auto-recalculation so saved scores are preserved
    setSuppressSmartMatchEffect(true);
    setSelectedPositionId(item.positionId);
    // Show all graded candidates (A, B+, B, C) to match the original match view
    setSelectedGrades(new Set(['A', 'B+', 'B', 'C']));
    setSortOption('score');
    setData(item.candidates);
    setComputedScores(item.computedScores || {});
    if (item.type === 'ai_search' && item.aiSearchResults?.length) {
      setAiSearchResults(item.aiSearchResults);
      setAiSearchActive(true);
      setSmartMatchActive(false);
    } else {
      setSmartMatchActive(true);
      setAiSearchActive(false);
      setAiSearchResults([]);
    }
    showToast(`查看历史：${item.positionName} · ${item.candidateCount}人`);
  };

  const filteredHistory = useMemo(() => {
    if (!historyFilterPosition) return matchHistory;
    return matchHistory.filter(h => h.positionId === historyFilterPosition);
  }, [matchHistory, historyFilterPosition]);

  const showToast = (message: string) => {
    setToastMessage(message);
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = setTimeout(() => setToastMessage(null), 3000);
  };

  const handleAISearch = async () => {
    if (!aiSearchQuery.trim()) return;
    setIsAISearching(true);
    setAiSearchActive(true);
    try {
      const allCandidates = await listCandidates();

      // Check if AI-powered screening is available
      let useAI = false;
      let activeConfig: {id: string} | null = null;
      try {
        const configs = await listAIModelConfigs();
        activeConfig = configs.find(c => c.is_active) ?? null;
        const hasPrompt = positionDetail?.aiPrompt || aiSearchQuery.trim();
        useAI = !!(activeConfig && hasPrompt);
      } catch {
        useAI = false;
      }

      if (useAI && activeConfig) {
        // AI-powered screening
        const prompt = positionDetail?.aiPrompt || aiSearchQuery.trim();
        const scoredResults = await Promise.all(
          allCandidates.map(async (candidate) => {
            if (!candidate.resumeParsedInfo?.rawText) {
              // Fall back to keyword matching for candidates without parsed resume
              const query = aiSearchQuery.toLowerCase();
              const searchText = [
                candidate.name, candidate.location,
                ...candidate.tags, ...candidate.roles,
                candidate.source, candidate.reason,
              ].filter(Boolean).join(' ').toLowerCase();
              const queryWords = query.split(/\s+/).filter(w => w.length > 1);
              const matchCount = queryWords.filter(word => searchText.includes(word)).length;
              if (matchCount === 0) return null;
              return {...candidate, _matchScore: matchCount / queryWords.length};
            }
            try {
              const aiResult = await screenResumeWithAI({
                candidateId: candidate.id,
                positionId: selectedPositionId || undefined,
                positionName: positionDetail?.position?.name,
                aiPrompt: prompt,
                scoringRules: positionDetail?.scoringRules || [],
                aiModelConfigId: activeConfig!.id,
                resumeText: candidate.resumeParsedInfo.rawText,
              });
              return {
                ...candidate,
                _aiResult: aiResult,
                fitScore: [aiResult.totalScore],
                grade: mapRecommendationToGrade(aiResult.recommendation),
                gradeColor: getGradeColor(mapRecommendationToGrade(aiResult.recommendation)),
                scoreColor: getScoreColor(aiResult.totalScore),
                reason: aiResult.overallAssessment || `AI 评估: ${aiResult.totalScore}分`,
              } as CandidateCard & {_aiResult?: AIResumeScoreResult};
            } catch {
              return null;
            }
          }),
        );

        const valid = scoredResults.filter((c): c is NonNullable<typeof c> => c !== null)
          .sort((a, b) => (b.fitScore?.[0] || 0) - (a.fitScore?.[0] || 0));

        setAiSearchResults(valid);
        saveMatchHistory({
          type: 'ai_search',
          positionId: selectedPositionId,
          positionName: positions.find(p => p.id === selectedPositionId)?.name || '',
          candidateCount: valid.length,
          candidates: valid,
          aiSearchResults: valid,
          computedScores: {},
        });
      } else {
        // Fallback: keyword matching
        const query = aiSearchQuery.toLowerCase();
        const scoredResults = allCandidates
          .map((candidate) => {
            const searchText = [
              candidate.name, candidate.location,
              ...candidate.tags, ...candidate.roles,
              candidate.source, candidate.reason,
              candidate.resumeParsedInfo?.skills?.join(' '),
              candidate.resumeParsedInfo?.workExperience?.join(' '),
              candidate.resumeParsedInfo?.education,
            ].filter(Boolean).join(' ').toLowerCase();

            const queryWords = query.split(/\s+/).filter(w => w.length > 1);
            const matchCount = queryWords.filter(word => searchText.includes(word)).length;
            if (matchCount === 0) return null;
            return {...candidate, _matchScore: matchCount / queryWords.length};
          })
          .filter((c): c is NonNullable<typeof c> => c !== null)
          .sort((a, b) => (b._matchScore || 0) - (a._matchScore || 0));

        setAiSearchResults(scoredResults);
        saveMatchHistory({
          type: 'ai_search',
          positionId: selectedPositionId,
          positionName: positions.find(p => p.id === selectedPositionId)?.name || '',
          candidateCount: scoredResults.length,
          candidates: scoredResults,
          aiSearchResults: scoredResults,
          computedScores: {},
        });
      }

      setSortOption('score');
      setTimeout(() => {
        document.querySelector('.flex-1')?.scrollIntoView({behavior: 'smooth', block: 'start'});
      }, 100);
    } catch (e) {
      console.error('AI search failed:', e);
      showToast('搜索失败，请重试');
    } finally {
      setIsAISearching(false);
    }
  };

  const handleAIRank = async () => {
    if (!selectedPositionId || !positionDetail) {
      showToast('请先选择岗位');
      return;
    }
    const candidatesToRank = candidatesData || [];
    const withResume = candidatesToRank.filter(c => c.resumeParsedInfo?.rawText);
    if (withResume.length < 2) {
      showToast('至少需要 2 位有简历解析数据的候选人才能进行 AI 排名');
      return;
    }

    // Check AI model config
    let activeConfig: {id: string} | null = null;
    try {
      const configs = await listAIModelConfigs();
      activeConfig = configs.find(c => c.is_active) ?? null;
    } catch { /* ignore */ }
    if (!activeConfig) {
      showToast('请先在 AI 代理 > 模型配置中激活一个 AI 模型');
      return;
    }

    setIsAIRanking(true);
    try {
      const result = await rankCandidatesWithAI({
        candidates: withResume.map(c => ({id: c.id, resumeText: c.resumeParsedInfo!.rawText})),
        positionName: positionDetail?.position?.name,
        aiPrompt: positionDetail?.aiPrompt || '',
        scoringRules: positionDetail?.scoringRules || [],
        aiModelConfigId: activeConfig.id,
      });

      // Update the displayed candidates with AI ranking scores
      const rankedMap = new Map<string, {rank: number; score: number; reasoning: string}>();
      result.ranking.forEach(r => {
        const candidateId = withResume[r.candidateIndex]?.id;
        if (candidateId) {
          rankedMap.set(candidateId, {rank: r.rank, score: r.totalScore, reasoning: r.reasoning});
        }
      });

      setComputedScores(prev => {
        const updated = {...prev};
        rankedMap.forEach((info, id) => {
          updated[id] = {
            fitScore: [info.score],
            grade: mapRecommendationToGrade(info.score >= 80 ? '强烈推荐' : info.score >= 60 ? '推荐' : info.score >= 40 ? '考虑' : '不推荐'),
            scoreColor: getScoreColor(info.score),
            gradeColor: '',
            scoreResult: {
              totalScore: info.score,
              grade: '',
              gradeColor: '',
              scoreColor: getScoreColor(info.score),
              dimensionScores: [],
              matchedKeywords: [],
              missingKeywords: [],
            },
          };
        });
        return updated;
      });

      setSortOption('score');
      setSmartMatchActive(true);
      showToast(`AI 排名完成：${result.analysisSummary || `已评估 ${withResume.length} 位候选人`}`);
      // Save to history with current computedScores
      setTimeout(() => {
        const candidatesToSave = (candidatesData || []).map(c => {
          const score = computedScores[c.id];
          const reason = score?.scoreResult ? buildRecommendationReason(c.resumeParsedInfo, score.scoreResult) : c.reason;
          return {...c, fitScore: score?.fitScore || c.fitScore, grade: score?.grade || c.grade, scoreColor: score?.scoreColor || c.scoreColor, gradeColor: score?.gradeColor || c.gradeColor, reason};
        });
        saveMatchHistory({
          type: 'ai_ranking',
          positionId: selectedPositionId,
          positionName: positions.find(p => p.id === selectedPositionId)?.name || '',
          candidateCount: candidatesToSave.length,
          candidates: candidatesToSave,
          aiSearchResults: [],
          computedScores: computedScores,
        });
      }, 0);
    } catch (e) {
      console.error('AI ranking failed:', e);
      showToast('AI 排名失败，请检查 AI 模型配置');
    } finally {
      setIsAIRanking(false);
    }
  };

  useEffect(() => {
    return () => {
      if (toastTimeoutRef.current) {
        clearTimeout(toastTimeoutRef.current);
      }
    };
  }, []);

  const loadPositions = async (projectId: string | null) => {
    try {
      const allPositions = await listPositions();
      if (projectId) {
        const filtered = allPositions.filter((p) => p.projectId === projectId);
        setPositions(filtered);
      } else {
        setPositions(allPositions);
      }
    } catch (e) {
      console.error('Failed to load positions:', e);
    }
  };

  useEffect(() => {
    setPositions([]);
    setSelectedPositionId('');
    setPositionDetail(null);
    setComputedScores({});
    void loadPositions(selectedProjectId || null);
  }, [selectedProjectId]);

  // Load position detail when position is selected
  useEffect(() => {
    if (!selectedPositionId) {
      setPositionDetail(null);
      setComputedScores({});
      return;
    }

    getPositionDetail(selectedPositionId)
      .then((detail) => {
        if (!detail) {
          console.warn('Position detail not found for id:', selectedPositionId);
          return;
        }
        console.log('Position detail loaded:', detail.position?.name, 'scoringRules:', detail.scoringRules?.length, 'gradeRules:', detail.gradeRules?.length);
        setPositionDetail(detail);
      })
      .catch(() => {
        setPositionDetail(null);
        setComputedScores({});
      });
  }, [selectedPositionId]);

  // Recalculate scores when smart match is activated
  useEffect(() => {
    if (!smartMatchActive) return;
    if (suppressSmartMatchEffect) return; // skip during history view
    if (!selectedPositionId || !positionDetail) return;
    if (!candidatesData || candidatesData.length === 0) return;

    console.log('[SmartMatch] Scoring candidates with positionDetail:', positionDetail.position?.name);
    console.log('[SmartMatch] scoringRules:', JSON.stringify(positionDetail.scoringRules));
    console.log('[SmartMatch] gradeRules:', JSON.stringify(positionDetail.gradeRules));
    console.log('[SmartMatch] candidates count:', candidatesData.length);

    const newScores: Record<string, {fitScore: number[]; grade: string; scoreColor: string; gradeColor: string; scoreResult: ScoreResult}> = {};
    candidatesData.forEach((candidate) => {
      if (candidate.resumeParsedInfo) {
        const scoreResult = calculateResumeScore(candidate.resumeParsedInfo, positionDetail);
        console.log('[SmartMatch] Candidate:', candidate.name, '-> score:', scoreResult?.totalScore, 'grade:', scoreResult?.grade, 'matchedKW:', scoreResult?.matchedKeywords);
        if (scoreResult) {
          newScores[candidate.id] = {
            fitScore: [scoreResult.totalScore],
            grade: scoreResult.grade,
            scoreColor: scoreResult.scoreColor,
            gradeColor: scoreResult.gradeColor,
            scoreResult,
          };
        }
      }
    });
    console.log('[SmartMatch] Computed scores for', Object.keys(newScores).length, 'candidates');
    setComputedScores(newScores);
  }, [candidatesData, selectedPositionId, positionDetail, smartMatchActive]);

  const toggleGrade = (grade: string) => {
    const newGrades = new Set(selectedGrades);
    if (newGrades.has(grade)) {
      newGrades.delete(grade);
    } else {
      newGrades.add(grade);
    }
    setSelectedGrades(newGrades);
  };

  const handleAddToShortlist = async (candidate: {id: string; name: string; roles: string[]; fitScore: number[]; grade: string}) => {
    if (!selectedPositionId) {
      showToast('请先选择岗位');
      return;
    }
    if (!selectedProjectId) {
      showToast('请先选择项目');
      return;
    }

    const position = positions.find((p) => p.id === selectedPositionId);
    const project = projects.find((p) => p.id === selectedProjectId);

    if (!position) {
      showToast('岗位信息有误，请重新选择');
      return;
    }
    if (!project) {
      showToast('项目信息有误，请重新选择');
      return;
    }

    try {
      await addToShortlist({
        candidateId: candidate.id,
        candidateName: candidate.name,
        role: candidate.roles.join(' / '),
        positionId: position.id,
        positionName: position.name,
        projectId: project.id,
        projectName: project.name,
        fitScore: candidate.fitScore[0] || 0,
        grade: candidate.grade,
      });
      showToast(`已加入「${candidate.name}」至入围名单`);
    } catch (e) {
      console.error('Failed to add to shortlist:', e);
      showToast('添加失败，请重试');
    }
  };

  const handleDeleteCandidate = async (candidate: CandidateCard) => {
    if (!window.confirm(`确定要删除候选人「${candidate.name}」吗？此操作不可撤销。`)) return;
    try {
      await deleteCandidate(candidate.id);
      // Refresh the candidate list (triggers re-fetch in both mock and real modes)
      refresh();
      showToast(`已删除候选人：${candidate.name}`);
    } catch (e) {
      console.error('Failed to delete candidate:', e);
      showToast('删除失败，请重试');
    }
  };

  const handleReparseCandidate = async (candidate: CandidateCard) => {
    try {
      const updated = await reparseCandidate(candidate.id);
      if (updated) {
        // Update local state with new candidate data
        setData(prev => prev.map(c => c.id === candidate.id ? updated : c));
        showToast(`已重新解析：${updated.name || candidate.name}`);
      }
    } catch (e) {
      console.error('Failed to reparse candidate:', e);
      showToast('重新解析失败');
    }
  };

  const filteredCandidates = useMemo(() => {
    let result = candidatesData || [];

    // If smart match is active and we have computed scores, apply them
    if (smartMatchActive && selectedPositionId && Object.keys(computedScores).length > 0) {
      result = result.map((c) => {
        const computed = computedScores[c.id];
        if (computed) {
          // Build structured recommendation reason
          const reason = computed.scoreResult
            ? buildRecommendationReason(c.resumeParsedInfo, computed.scoreResult)
            : (c.reason || '');
          return {
            ...c,
            fitScore: computed.fitScore,
            grade: computed.grade,
            scoreColor: computed.scoreColor,
            gradeColor: computed.gradeColor,
            scoreResult: computed.scoreResult,
            reason,
          };
        }
        return c;
      });
    }

    // Filter by search text (match against candidate name)
    if (searchText.trim()) {
      const query = searchText.trim().toLowerCase();
      result = result.filter((c) => c.name.toLowerCase().includes(query));
    }

    // Filter by selected project
    if (selectedProjectId) {
      result = result.filter((c) => c.projectId === selectedProjectId);
    }

    // Note: position filter is NOT applied here - we show all candidates and score them against the selected position

    // Filter by selected grades
    if (selectedGrades.size > 0) {
      result = result.filter((c) => selectedGrades.has(c.grade));
    }

    // Filter by location (province + city)
    if (cityFilter) {
      result = result.filter((c) => c.location.includes(cityFilter));
    } else if (provinceFilter) {
      result = result.filter((c) => c.location.includes(provinceFilter));
    }

    // Filter by education
    if (educationFilter !== 'all') {
      result = result.filter((c) => c.resumeParsedInfo?.education?.includes(educationFilter));
    }

    // Filter by major (matched against skills or work experience)
    if (majorFilter) {
      const majorLower = majorFilter.toLowerCase();
      result = result.filter((c) => {
        const skills = c.resumeParsedInfo?.skills?.join(' ').toLowerCase() || '';
        const workExp = c.resumeParsedInfo?.workExperience?.join(' ').toLowerCase() || '';
        const tags = c.tags.join(' ').toLowerCase();
        return skills.includes(majorLower) || workExp.includes(majorLower) || tags.includes(majorLower);
      });
    } else if (majorCategoryFilter) {
      const categoryLower = majorCategoryFilter.toLowerCase();
      result = result.filter((c) => {
        const skills = c.resumeParsedInfo?.skills?.join(' ').toLowerCase() || '';
        const workExp = c.resumeParsedInfo?.workExperience?.join(' ').toLowerCase() || '';
        const tags = c.tags.join(' ').toLowerCase();
        return skills.includes(categoryLower) || workExp.includes(categoryLower) || tags.includes(categoryLower);
      });
    }

    // Sort
    if (sortOption === 'newest') {
      result = [...result].sort((a, b) => b.id.localeCompare(a.id));
    } else if (sortOption === 'score') {
      result = [...result].sort((a, b) => (b.fitScore[0] ?? 0) - (a.fitScore[0] ?? 0));
    }
    // 'relevance' keeps the default order

    // If AI search is active, replace results with AI search results
    if (aiSearchActive && aiSearchResults.length > 0) {
      result = aiSearchResults;
    }

    return result;
  }, [candidatesData, selectedGrades, searchText, sortOption, selectedProjectId, selectedPositionId, educationFilter, provinceFilter, cityFilter, majorCategoryFilter, majorFilter, computedScores, aiSearchActive, aiSearchResults, smartMatchActive]);

  return (
    <>
      <AnimatePresence>
        {selectedCandidate && <CandidateDetailModal isOpen={!!selectedCandidate} onClose={() => setSelectedCandidate(null)} candidate={selectedCandidate} positionDetail={positionDetail} />}
      </AnimatePresence>
      <ResumeImportModal isOpen={isImportModalOpen} onClose={() => setIsImportModalOpen(false)} onComplete={() => { setIsImportModalOpen(false); refresh(); }} />
      <motion.div initial={{opacity: 0, y: 10}} animate={{opacity: 1, y: 0}} exit={{opacity: 0, y: -10}} className="mx-auto flex flex-col h-full bg-slate-50 dark:bg-gray-800 relative max-w-[1500px] w-full">
        {/* Toast Notification */}
        {toastMessage && (
          <motion.div
            initial={{opacity: 0, y: -20}}
            animate={{opacity: 1, y: 0}}
            exit={{opacity: 0, y: -20}}
            className="fixed top-4 right-4 z-50 bg-gray-900 text-white px-4 py-3 rounded-lg shadow-lg text-[13px] font-medium flex items-center gap-2"
          >
            {toastMessage}
            <button onClick={() => setToastMessage(null)}><X className="w-4 h-4" /></button>
          </motion.div>
        )}

        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 sticky top-0 z-10">
          <div className="flex items-center text-sm">
            <span className="text-gray-400 dark:text-gray-500">首页</span>
            <span className="mx-2 text-gray-300 dark:text-gray-600">/</span>
            <span className="text-gray-900 dark:text-white font-medium">候选人搜索</span>
          </div>
          <div className="flex items-center space-x-4">
            <span className="text-[13px] text-gray-500 dark:text-gray-400">
              导入候选人请前往{' '}
              <button
                type="button"
                onClick={() => navigateToPage('talent')}
                className="text-[#1a4bc4] hover:underline"
              >
                人才库
              </button>
            </span>
            <button
              onClick={async () => {
                try { await exportCandidatesCsv(); showToast("候选人数据已导出"); }
                catch (e: unknown) { showToast(e instanceof Error ? e.message : "导出失败"); }
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[13px] text-[#1a4bc4] border border-blue-200 dark:border-gray-700 rounded-lg hover:bg-blue-50 dark:hover:bg-gray-700/30 transition-colors"
            >
              <Download className="w-4 h-4" />
              导出 CSV
            </button>
            <button onClick={() => showToast('暂无新通知')} className="relative p-2 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors ml-2">
              <Bell className="w-5 h-5" />
              <span className="absolute top-1.5 right-2 w-2 h-2 bg-red-500 rounded-full border-2 border-white dark:border-gray-800"></span>
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto w-full mx-auto flex">
          <div className="flex-1 p-5 pb-14">
            <div className="bg-white dark:bg-gray-800 p-5 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm mb-5">
              <div className="relative mb-4">
                <textarea
                  value={aiSearchQuery}
                  onChange={(e) => setAiSearchQuery(e.target.value)}
                  placeholder="用自然语言描述你需要的候选人，例如：有武术背景、能接受面部动捕的MWV演员，擅长舞蹈表演"
                  className="w-full px-4 py-3 pr-32 rounded-xl border-2 border-purple-200 dark:border-gray-600 shadow-sm focus:border-purple-500 focus:ring-2 focus:ring-purple-200 outline-none text-[14px] text-gray-900 dark:text-white bg-white dark:bg-gray-800 placeholder:text-gray-400 dark:placeholder:text-gray-500 resize-none"
                  rows={2}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && e.ctrlKey) {
                      handleAISearch();
                    }
                  }}
                />
                <button
                  onClick={handleAISearch}
                  disabled={isAISearching || !aiSearchQuery.trim()}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-5 py-2 rounded-lg flex items-center shadow-sm text-[13px] font-medium transition-all"
                >
                  {isAISearching ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      匹配中...
                    </>
                  ) : (
                    <>
                      AI 搜索 <Sparkles className="w-4 h-4 ml-1.5" />
                    </>
                  )}
                </button>
              </div>
              <p className="text-[12px] text-gray-400 dark:text-gray-500 -mt-1">按 Ctrl + Enter 快速搜索 · 在人才库中根据关键词匹配候选人</p>
              <div className="flex flex-wrap items-center gap-3">
                <select
                  value={selectedProjectId}
                  onChange={(e) => setSelectedProjectId(e.target.value)}
                  className="px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-[#1a4bc4] bg-white dark:bg-gray-800 dark:text-white min-w-[160px]"
                >
                  <option value="">全部项目</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
                <select
                  value={selectedPositionId}
                  onChange={(e) => setSelectedPositionId(e.target.value)}
                  className="px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-[#1a4bc4] bg-white dark:bg-gray-800 dark:text-white min-w-[160px]"
                >
                  <option value="">全部岗位</option>
                  {positions.map((position) => (
                    <option key={position.id} value={position.id}>
                      {position.name}
                    </option>
                  ))}
                </select>
                <select
                  value={matchTimeWindow}
                  onChange={e => {
                    setMatchTimeWindow(e.target.value as any);
                    if (e.target.value === 'custom') {
                      // default to last 30 days
                      const to = new Date();
                      const from = new Date();
                      from.setDate(from.getDate() - 30);
                      setMatchDateFrom(from.toISOString().slice(0, 10));
                      setMatchDateTo(to.toISOString().slice(0, 10));
                    }
                  }}
                  className="px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-[#1a4bc4] bg-white dark:bg-gray-800 dark:text-white min-w-[110px]"
                >
                  <option value="all">全部时间</option>
                  <option value="week">近一周</option>
                  <option value="month">近一月</option>
                  <option value="custom">自定义</option>
                </select>
                {matchTimeWindow === 'custom' && (
                  <div className="flex items-center gap-1">
                    <input
                      type="date"
                      value={matchDateFrom}
                      onChange={e => setMatchDateFrom(e.target.value)}
                      className="px-2 py-1.5 border border-gray-200 dark:border-gray-700 rounded-lg text-[12px] focus:outline-none focus:ring-1 focus:ring-[#1a4bc4] bg-white dark:bg-gray-800 dark:text-white"
                    />
                    <span className="text-[12px] text-gray-400 dark:text-gray-500">至</span>
                    <input
                      type="date"
                      value={matchDateTo}
                      onChange={e => setMatchDateTo(e.target.value)}
                      className="px-2 py-1.5 border border-gray-200 dark:border-gray-700 rounded-lg text-[12px] focus:outline-none focus:ring-1 focus:ring-[#1a4bc4] bg-white dark:bg-gray-800 dark:text-white"
                    />
                  </div>
                )}
                <button
                  onClick={async () => {
                    if (!selectedPositionId) {
                      showToast('请先选择岗位');
                      return;
                    }
                    // Ensure positionDetail is loaded
                    if (!positionDetail) {
                      showToast('正在加载岗位详情，请稍候...');
                      return;
                    }
                    // Activate smart match: filter to show only A, B+, B, C grades and sort by score
                    setSmartMatchActive(true);
                    setSelectedGrades(new Set(['A', 'B+', 'B', 'C']));
                    setSortOption('score');

                    // Score all candidates directly
                    console.log('[SmartMatch] Scoring candidates with positionDetail:', positionDetail.position?.name);
                    console.log('[SmartMatch] scoringRules:', JSON.stringify(positionDetail.scoringRules));
                    console.log('[SmartMatch] gradeRules:', JSON.stringify(positionDetail.gradeRules));
                    console.log('[SmartMatch] candidates count:', candidatesData.length, 'matchTimeWindow:', matchTimeWindow, 'matchDateFrom:', matchDateFrom, 'matchDateTo:', matchDateTo);

                    const newScores: Record<string, {fitScore: number[]; grade: string; scoreColor: string; gradeColor: string; scoreResult: ScoreResult}> = {};
                    if (candidatesData && candidatesData.length > 0) {
                      // Debug: check first candidate's resumeParsedInfo
                      const firstWithResume = candidatesData.find(c => c.resumeParsedInfo);
                      if (firstWithResume) {
                        console.log('[SmartMatch] Sample candidate resumeParsedInfo:', JSON.stringify({
                          name: firstWithResume.name,
                          skills: firstWithResume.resumeParsedInfo?.skills,
                          workExperience: firstWithResume.resumeParsedInfo?.workExperience,
                          education: firstWithResume.resumeParsedInfo?.education,
                          rawTextLength: firstWithResume.resumeParsedInfo?.rawText?.length
                        }, null, 2));
                      } else {
                        console.log('[SmartMatch] No candidate has resumeParsedInfo!');
                      }

                      candidatesData.forEach((candidate) => {
                        // Filter by time window for imported candidates
                        if (matchTimeWindow !== 'all' && candidate.id.startsWith('imported-')) {
                          const parts = candidate.id.split('-');
                          const ts = parseInt(parts[1] || '0');
                          const now = Date.now();
                          if (matchTimeWindow === 'week') {
                            if (ts < now - 7 * 24 * 60 * 60 * 1000) return;
                          } else if (matchTimeWindow === 'month') {
                            if (ts < now - 30 * 24 * 60 * 60 * 1000) return;
                          } else if (matchTimeWindow === 'custom' && matchDateFrom && matchDateTo) {
                            const fromMs = new Date(matchDateFrom).getTime();
                            const toMs = new Date(matchDateTo).getTime() + 86400000; // include end date
                            if (ts < fromMs || ts > toMs) return;
                          }
                        }
                        if (candidate.resumeParsedInfo) {
                          const scoreResult = calculateResumeScore(candidate.resumeParsedInfo, positionDetail);
                          console.log('[SmartMatch] Candidate:', candidate.name, '-> score:', scoreResult?.totalScore, 'grade:', scoreResult?.grade, 'matchedKW:', scoreResult?.matchedKeywords);
                          if (scoreResult) {
                            newScores[candidate.id] = {
                              fitScore: [scoreResult.totalScore],
                              grade: scoreResult.grade,
                              scoreColor: scoreResult.scoreColor,
                              gradeColor: scoreResult.gradeColor,
                              scoreResult,
                            };
                          }
                        }
                      });
                    }
                    console.log('[SmartMatch] Computed scores for', Object.keys(newScores).length, 'candidates');
                    setComputedScores(newScores);
                    setSuppressSmartMatchEffect(false); // re-enable auto-scoring for future matches

                    // Save to history (only scored candidates)
                    const scoredCandidates = Object.keys(newScores).map(id => {
                      const c = candidatesData.find(c => c.id === id);
                      if (!c) return null;
                      const score = newScores[id];
                      const reason = score?.scoreResult ? buildRecommendationReason(c.resumeParsedInfo, score.scoreResult) : c.reason;
                      return {...c, fitScore: score.fitScore, grade: score.grade, scoreColor: score.scoreColor, gradeColor: score.gradeColor, reason};
                    }).filter(Boolean) as CandidateCard[];

                    saveMatchHistory({
                      type: 'smart_match',
                      positionId: selectedPositionId,
                      positionName: positions.find(p => p.id === selectedPositionId)?.name || '',
                      candidateCount: scoredCandidates.length,
                      candidates: scoredCandidates,
                      aiSearchResults: [],
                      computedScores: newScores,
                    });

                    showToast(`智能匹配完成：找到 ${scoredCandidates.length} 位候选人，已保存到历史记录`);

                    // Scroll to results area
                    setTimeout(() => {
                      document.querySelector('.flex-1')?.scrollIntoView({behavior: 'smooth', block: 'start'});
                    }, 100);
                  }}
                  className="bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white px-5 py-2 rounded-lg flex items-center shadow-sm text-[13px] font-semibold transition-all hover:shadow-md active:scale-[0.98]"
                >
                  <Sparkles className="w-4 h-4 mr-1.5" />
                  智能匹配
                </button>
                {positionDetail?.aiPrompt && (
                  <button
                    onClick={handleAIRank}
                    disabled={isAIRanking}
                    className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white px-5 py-2 rounded-lg flex items-center shadow-sm text-[13px] font-semibold transition-all hover:shadow-md active:scale-[0.98] disabled:opacity-50"
                  >
                    {isAIRanking ? (
                      <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                    ) : (
                      <Sparkles className="w-4 h-4 mr-1.5" />
                    )}
                    AI 智能排名
                  </button>
                )}
                <span onClick={() => setShowMoreFilters(!showMoreFilters)} className={`cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/30 px-3 py-1.5 rounded-md transition-colors ${showMoreFilters ? 'text-[#1a4bc4]' : 'text-gray-400 dark:text-gray-500'}`}>+ 更多筛选</span>
              </div>
              {showMoreFilters && (
                <div className="flex items-center gap-4 mt-3">
                  <select
                    value={experienceFilter}
                    onChange={(e) => setExperienceFilter(e.target.value)}
                    className="px-3 py-2 border border-gray-200 rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-[#1a4bc4] bg-white min-w-[140px]"
                  >
                    <option value="all">全部经验</option>
                    <option value="0-1">0-1年</option>
                    <option value="1-3">1-3年</option>
                    <option value="3-5">3-5年</option>
                    <option value="5+">5年以上</option>
                  </select>
                  <CascadingSelect
                    province={provinceFilter}
                    city={cityFilter}
                    onProvinceChange={setProvinceFilter}
                    onCityChange={setCityFilter}
                  />
                  <select
                    value={educationFilter}
                    onChange={(e) => setEducationFilter(e.target.value)}
                    className="px-3 py-2 border border-gray-200 rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-[#1a4bc4] bg-white min-w-[140px]"
                  >
                    <option value="all">全部学历</option>
                    <option value="高中">高中</option>
                    <option value="大专">大专</option>
                    <option value="本科">本科</option>
                    <option value="硕士">硕士</option>
                    <option value="博士">博士</option>
                  </select>
                  <MajorSelect
                    category={majorCategoryFilter}
                    major={majorFilter}
                    onCategoryChange={setMajorCategoryFilter}
                    onMajorChange={setMajorFilter}
                  />
                </div>
              )}

              {/* Match History Panel */}
              {matchHistory.length > 0 && (
                <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm mb-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <History className="w-4 h-4 text-gray-500" />
                      <span className="font-bold text-[13px] text-gray-900">匹配历史</span>
                      <span className="text-[11px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">{matchHistory.length}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {/* Time window filter */}
                      <div className="flex items-center bg-gray-100 rounded-lg p-0.5">
                        {[
                          {value: '3days', label: '近3条'},
                          {value: 'week', label: '近一周'},
                          {value: 'all', label: '全部'},
                        ].map(opt => (
                          <button
                            key={opt.value}
                            onClick={() => setHistoryTimeWindow(opt.value as any)}
                            className={`px-2 py-1 text-[11px] rounded-md transition-colors ${
                              historyTimeWindow === opt.value
                                ? 'bg-white shadow-sm text-[#1a4bc4] font-medium'
                                : 'text-gray-500 hover:text-gray-700'
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                      {positions.length > 0 && (
                        <select
                          value={historyFilterPosition}
                          onChange={e => setHistoryFilterPosition(e.target.value)}
                          className="px-2 py-1 border border-gray-200 rounded-lg text-[11px] focus:outline-none focus:ring-1 focus:ring-[#1a4bc4] bg-white"
                        >
                          <option value="">全部岗位</option>
                          {positions.map(p => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                          ))}
                        </select>
                      )}
                      <button onClick={clearMatchHistory} className="text-[11px] text-gray-400 hover:text-red-500 transition-colors">全部清除</button>
                    </div>
                  </div>

                  {/* Time-window filtered + collapsed/expanded view */}
                  {(() => {
                    const now = Date.now();
                    const isRecent = (ts: Date) => {
                      const d = ts instanceof Date ? ts.getTime() : new Date(ts).getTime();
                      if (historyTimeWindow === '3days') return true; // show all, limit in display
                      if (historyTimeWindow === 'week') return now - d < 7 * 24 * 60 * 60 * 1000;
                      return true;
                    };

                    const filtered = filteredHistory.filter(h => isRecent(h.timestamp));
                    const displayItems = historyTimeWindow === '3days' && !historyExpanded
                      ? filtered.slice(0, 3)
                      : filtered;

                    const hasMore = filtered.length > 3 && !historyExpanded;

                    return (
                      <>
                        <div className="space-y-2 max-h-[240px] overflow-y-auto">
                          {displayItems.length === 0 ? (
                            <p className="text-[12px] text-gray-400 text-center py-3">暂无历史记录</p>
                          ) : displayItems.map(item => (
                            <div key={item.id} className="border border-gray-100 rounded-lg px-3 py-2.5 hover:bg-gray-50 transition-colors">
                              <div className="flex items-start justify-between">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                                    <span className="text-[11px] text-gray-400">
                                      {new Date(item.timestamp).toLocaleString('zh-CN', {month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'})}
                                    </span>
                                    <span className="text-[11px] text-gray-300">·</span>
                                    <span className="text-[11px] text-gray-600 font-medium truncate">{item.positionName}</span>
                                    <span className="text-[11px] text-gray-300">·</span>
                                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                                      item.type === 'ai_search' ? 'bg-violet-50 text-violet-600' :
                                      item.type === 'smart_match' ? 'bg-purple-50 text-purple-600' :
                                      'bg-amber-50 text-amber-600'
                                    }`}>
                                      {item.type === 'ai_search' ? 'AI搜索' : item.type === 'smart_match' ? '智能匹配' : 'AI排名'}
                                    </span>
                                  </div>
                                  <div className="text-[11px] text-gray-500">
                                    {item.candidateCount}人
                                    {item.computedScores && Object.keys(item.computedScores).length > 0 && (
                                      <span className="ml-2">
                                        · 均分 {Math.round(Object.values(item.computedScores as Record<string, {fitScore: number[]}>).reduce((s, c) => s + (c.fitScore?.[0] || 0), 0) / Object.keys(item.computedScores).length)}分
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <div className="flex items-center gap-1.5 ml-2 flex-shrink-0">
                                  <button
                                    onClick={() => viewMatchHistory(item)}
                                    className="text-[11px] text-[#1a4bc4] hover:text-[#0c2b7a] font-medium transition-colors px-2 py-1 rounded hover:bg-[#1a4bc4]/5"
                                  >查看</button>
                                  <button
                                    onClick={() => deleteMatchHistoryItem(item.id)}
                                    className="text-[11px] text-gray-400 hover:text-red-500 transition-colors p-1 rounded hover:bg-red-50"
                                  ><Trash2 className="w-3.5 h-3.5" /></button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                        {hasMore && (
                          <button
                            onClick={() => setHistoryExpanded(true)}
                            className="w-full text-center text-[12px] text-[#1a4bc4] hover:underline py-1.5 mt-1"
                          >
                            查看更多 ({filtered.length - 3} 条)
                          </button>
                        )}
                        {historyExpanded && filtered.length > 3 && (
                          <button
                            onClick={() => setHistoryExpanded(false)}
                            className="w-full text-center text-[12px] text-gray-400 hover:text-gray-600 py-1.5 mt-1"
                          >
                            收起
                          </button>
                        )}
                      </>
                    );
                  })()}
                </div>
              )}
            </div>
            <div className="flex flex-col lg:flex-row gap-5">
              <div className="w-full lg:w-[228px] flex-shrink-0 space-y-7 bg-white p-4 rounded-xl border border-gray-200 h-fit">
                <div>
                  <h3 className="font-bold text-gray-900 mb-3 text-[14px]">AI 评级</h3>
                  <div className="flex flex-wrap gap-2">
                    {['A', 'B+', 'B', 'C'].map((grade) => (
                      <button
                        key={grade}
                        onClick={() => toggleGrade(grade)}
                        className={`w-8 h-8 rounded text-[12px] font-bold transition-colors ${
                          selectedGrades.has(grade)
                            ? grade === 'A' ? 'bg-[#10B981] text-white' : grade === 'B+' ? 'bg-[#1a4bc4] text-white' : grade === 'B' ? 'bg-[#3b82f6] text-white' : 'bg-[#0EA5E9] text-white'
                            : 'bg-gray-100 text-gray-400'
                        }`}
                      >
                        {grade}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex-1">
                {!hasSearched ? (
                  /* Empty initial state — no search performed yet */
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex flex-col items-center justify-center py-20 px-6"
                  >
                    <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-violet-100 to-purple-100 flex items-center justify-center mb-6">
                      <Search className="w-10 h-10 text-violet-500" />
                    </div>
                    <h2 className="text-xl font-bold text-gray-900 mb-2">搜索候选人</h2>
                    <p className="text-sm text-gray-500 text-center max-w-md mb-8">
                      使用上方的 <span className="font-medium text-violet-600">AI 搜索</span> 用自然语言描述需求，
                      或选择岗位后点击 <span className="font-medium text-violet-600">智能匹配</span> 自动评分筛选
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full max-w-lg">
                      <div className="bg-white border border-gray-200 rounded-xl p-4 text-center">
                        <div className="w-10 h-10 rounded-lg bg-violet-50 flex items-center justify-center mx-auto mb-2">
                          <Sparkles className="w-5 h-5 text-violet-500" />
                        </div>
                        <div className="text-sm font-semibold text-gray-900 mb-1">AI 自然语言搜索</div>
                        <div className="text-xs text-gray-500">用日常语言描述你想要的候选人特征</div>
                      </div>
                      <div className="bg-white border border-gray-200 rounded-xl p-4 text-center">
                        <div className="w-10 h-10 rounded-lg bg-purple-50 flex items-center justify-center mx-auto mb-2">
                          <User className="w-5 h-5 text-purple-500" />
                        </div>
                        <div className="text-sm font-semibold text-gray-900 mb-1">智能匹配评分</div>
                        <div className="text-xs text-gray-500">选择岗位后自动评分并筛选候选人</div>
                      </div>
                    </div>
                  </motion.div>
                ) : (
                  <>
                    <div className="flex items-center justify-between mb-4">
                      <div className="font-bold text-[18px] text-gray-900">
                        找到 <span className="text-black">{filteredCandidates.length}</span> 名候选人
                        {aiSearchActive && <span className="text-[13px] font-normal text-gray-400 ml-2">· AI 搜索</span>}
                        {smartMatchActive && <span className="text-[13px] font-normal text-gray-400 ml-2">· 智能匹配</span>}
                      </div>
                      <div className="flex items-center space-x-3 text-[13px]">
                        <select
                          value={sortOption}
                          onChange={(e) => setSortOption(e.target.value as 'relevance' | 'newest' | 'score')}
                          className="flex items-center space-x-2 text-gray-600 bg-white border border-gray-200 px-3 py-1.5 rounded-lg cursor-pointer hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#1a4bc4] text-[13px] appearance-none pr-8"
                        >
                          <option value="relevance">相关度排序</option>
                          <option value="newest">时间最新</option>
                          <option value="score">评分最高</option>
                        </select>
                        <div className="flex items-center bg-gray-100 rounded-lg p-1">
                          <button onClick={() => setViewMode('grid')} className={`p-1 px-2.5 rounded-md transition-colors ${viewMode === 'grid' ? 'bg-white shadow-sm text-[#1a4bc4]' : 'text-gray-500 hover:text-gray-700'}`}><Grid className="w-4 h-4" /></button>
                          <button onClick={() => setViewMode('list')} className={`p-1 px-2.5 rounded-md transition-colors ${viewMode === 'list' ? 'bg-white shadow-sm text-[#1a4bc4]' : 'text-gray-500 hover:text-gray-700'}`}><List className="w-4 h-4" /></button>
                        </div>
                      </div>
                    </div>

                    {isLoading ? (
                      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-10 flex items-center justify-center text-gray-500">
                        <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                        正在加载候选人数据...
                      </div>
                    ) : error ? (
                      <div className="bg-red-50 border border-red-200 text-red-600 rounded-xl p-6">
                        候选人数据加载失败：{error}
                      </div>
                    ) : filteredCandidates.length === 0 ? (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="bg-white rounded-xl border border-gray-200 shadow-sm p-12 flex flex-col items-center justify-center text-center"
                      >
                        <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
                          <Search className="w-8 h-8 text-gray-400" />
                        </div>
                        <h3 className="text-lg font-bold text-gray-900 mb-1">未找到匹配的候选人</h3>
                        <p className="text-sm text-gray-500 max-w-sm">
                          {aiSearchActive
                            ? '尝试调整搜索关键词，使用更宽泛的描述重新搜索'
                            : '当前岗位条件下没有匹配的候选人，尝试更换岗位或调整筛选条件'}
                        </p>
                      </motion.div>
                    ) : viewMode === 'grid' ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                        {filteredCandidates.map((candidate) => {
                          const info = candidate.resumeParsedInfo;
                          const initials = candidate.name
                            ? candidate.name.trim().split(/\s+/).slice(0, 2).map(p => p[0]).join('')
                            : '??';
                          const photoUrl = candidate.resumeParsedInfo?.photoBase64 || '';
                          const {company: lastCompany, role: lastRole} = extractLastJob(info?.rawText);
                          const lastWorkDisplay = [lastCompany, lastRole].filter(Boolean).join(' · ') || '—';
                          const statusColor = info?.currentlyEmployed === '在职' ? 'text-emerald-600 bg-emerald-50' : 'text-amber-600 bg-amber-50';
                          return (
                          <motion.div
                            key={candidate.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 hover:shadow-md transition-shadow flex flex-col"
                          >
                            {/* 基本信息行 */}
                            <div className="flex gap-3 mb-3">
                              {/* 头像 */}
                              <div className="flex-shrink-0">
                                {photoUrl ? (
                                  <img src={photoUrl} alt="" className="w-[52px] h-[64px] rounded-lg object-cover border border-gray-200" />
                                ) : (
                                  <div className="w-[52px] h-[64px] rounded-lg bg-[#1a4bc4]/10 flex items-center justify-center border border-gray-200">
                                    <span className="text-[#1a4bc4] text-base font-bold">{initials}</span>
                                  </div>
                                )}
                              </div>

                              {/* 姓名 + 基本信息 */}
                              <div className="flex-1 min-w-0 space-y-1">
                                <div className="flex items-center gap-2">
                                  <span className="font-bold text-gray-900 text-[15px]">{candidate.name}</span>
                                  {info?.currentlyEmployed && (
                                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${statusColor}`}>{info.currentlyEmployed}</span>
                                  )}
                                </div>
                                <div className="text-[11px] text-gray-600">
                                  {info?.ageOrBirth && <span>年龄: {info.ageOrBirth}</span>}
                                  {info?.gender && <span className="ml-2">| {info.gender}</span>}
                                </div>
                                <div className="flex items-center gap-1 text-[11px] text-gray-600">
                                  <Phone className="w-3 h-3 text-gray-400" />
                                  <span className="truncate">{info?.phone || '—'}</span>
                                </div>
                                <div className="flex items-center gap-1 text-[11px] text-gray-600">
                                  <Mail className="w-3 h-3 text-gray-400" />
                                  <span className="truncate">{info?.email || '—'}</span>
                                </div>
                              </div>

                              {/* FIT SCORE 圆形徽章 */}
                              <div className="flex-shrink-0 text-center">
                                <div className="w-14 h-14 rounded-full bg-red-500 flex items-center justify-center text-xl font-black text-white shadow">
                                  {candidate.fitScore?.[0] || 0}
                                </div>
                                <div className="text-[10px] text-gray-600 mt-1 font-bold">FIT SCORE</div>
                              </div>
                            </div>

                            {/* 教育信息行 */}
                            {(info?.school || info?.highestEducation || info?.major || info?.educationTime) && (
                              <div className="border-t border-gray-100 pt-3 mb-3">
                                <div className="text-[10px] text-gray-400 font-medium mb-2 tracking-wider">教育信息</div>
                                <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-gray-600">
                                  {info?.school && <span>学校: {info.school}</span>}
                                  {info?.highestEducation && <span>学历: {info.highestEducation}</span>}
                                  {info?.major && <span>专业: {info.major}</span>}
                                  {info?.educationTime && <span>时间: {info.educationTime}</span>}
                                </div>
                              </div>
                            )}

                            {/* 相关信息行 */}
                            <div className="border-t border-gray-100 pt-3 mb-3">
                              <div className="text-[10px] text-gray-400 font-medium mb-2 tracking-wider">相关信息</div>
                              <div className="space-y-1 text-[11px] text-gray-600">
                                {lastWorkDisplay !== '—' && (
                                  <div className="flex items-start gap-1">
                                    <Building2 className="w-3 h-3 text-gray-400 flex-shrink-0 mt-0.5" />
                                    <span>{lastWorkDisplay}</span>
                                  </div>
                                )}
                                {candidate.honors && candidate.honors.length > 0 && (
                                  <div className="flex flex-wrap gap-1">
                                    {candidate.honors.slice(0, 4).map((h, i) => (
                                      <span key={i} className="px-1.5 py-0.5 bg-amber-50 text-amber-700 rounded text-[10px]">{h}</span>
                                    ))}
                                  </div>
                                )}
                                <div className="flex flex-wrap gap-x-3 gap-y-1">
                                  {info?.expectedSalary && (
                                    <span className="flex items-center gap-1">
                                      <Banknote className="w-3 h-3 text-gray-400" />
                                      {info.expectedSalary}
                                    </span>
                                  )}
                                  {info?.location && (
                                    <span className="flex items-center gap-1">
                                      <MapPin className="w-3 h-3 text-gray-400" />
                                      {info.location}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* 推荐理由 */}
                            {(candidate.reason || candidate._aiResult?.overallAssessment) && (
                              <div className="bg-gray-50 rounded-lg px-3 py-2 mb-3">
                                <div className="text-[10px] font-bold text-gray-500 mb-1">推荐理由</div>
                                <div className="text-[12px] text-gray-700 whitespace-pre-line leading-relaxed">
                                  {candidate._aiResult?.overallAssessment || candidate.reason}
                                </div>
                              </div>
                            )}

                            {/* 操作按钮 */}
                            <div className="flex gap-2 mt-auto">
                              <button
                                onClick={() => handleAddToShortlist(candidate)}
                                className="flex-1 bg-[#1a4bc4] hover:bg-[#0c2b7a] text-white py-2 rounded-lg text-[12px] font-medium transition-colors"
                              >
                                加入名单
                              </button>
                              <button
                                onClick={() => setSelectedCandidate(candidate)}
                                className="flex-1 border border-gray-200 hover:bg-gray-50 text-gray-700 py-2 rounded-lg text-[12px] font-medium transition-colors"
                              >
                                查看详情
                              </button>
                              <button
                                onClick={() => handleReparseCandidate(candidate)}
                                className="px-2.5 py-2 border border-blue-200 text-blue-500 rounded-lg hover:bg-blue-50 transition-colors"
                                title="重新解析"
                              >
                                <RefreshCw className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleDeleteCandidate(candidate)}
                                className="px-2.5 py-2 border border-red-200 text-red-500 rounded-lg hover:bg-red-50 transition-colors"
                                title="删除"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </motion.div>
                          );
                        })}
                      </div>
                    ) : (
                      /* List view */
                      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-x-auto">
                        <table className="w-full min-w-[1100px]">
                          <thead className="bg-gray-50 border-b border-gray-200">
                            <tr className="text-left text-[12px] text-gray-500 font-medium">
                              <th className="px-4 py-3 min-w-[160px]">基本信息</th>
                              <th className="px-4 py-3 min-w-[180px]">教育信息</th>
                              <th className="px-4 py-3 min-w-[160px]">相关信息</th>
                              <th className="px-4 py-3 text-center min-w-[80px]">FIT SCORE</th>
                              <th className="px-4 py-3 min-w-[180px]">推荐理由</th>
                              <th className="px-4 py-3 text-right min-w-[140px]">操作</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {filteredCandidates.map((candidate) => {
                              const info = candidate.resumeParsedInfo;
                              const {company: lastCompany, role: lastRole} = extractLastJob(info?.rawText);
                              const lastWorkDisplay = [lastCompany, lastRole].filter(Boolean).join(' · ') || '—';
                              const statusColor = info?.currentlyEmployed === '在职' ? 'text-emerald-600 bg-emerald-50' : 'text-amber-600 bg-amber-50';
                              return (
                              <tr key={candidate.id} className="hover:bg-gray-50 transition-colors">
                                <td className="px-4 py-3">
                                  <div className="font-bold text-[14px] text-gray-900">{candidate.name}</div>
                                  <div className="text-[11px] text-gray-500 mt-0.5">
                                    {info?.ageOrBirth || '—'}{info?.gender ? ` | ${info.gender}` : ''}
                                    {info?.currentlyEmployed && (
                                      <span className={`ml-1.5 text-[10px] px-1 py-0.5 rounded-full font-medium ${statusColor}`}>{info.currentlyEmployed}</span>
                                    )}
                                  </div>
                                  <div className="text-[11px] text-gray-400 mt-0.5 flex items-center gap-1">
                                    <Phone className="w-3 h-3" />{info?.phone || '—'}
                                  </div>
                                  <div className="text-[11px] text-gray-400 mt-0.5 flex items-center gap-1">
                                    <Mail className="w-3 h-3" />{info?.email || '—'}
                                  </div>
                                </td>
                                <td className="px-4 py-3">
                                  <div className="text-[12px] text-gray-700">{info?.school || '—'}</div>
                                  <div className="text-[11px] text-gray-500 mt-0.5">{info?.highestEducation || '—'} | {info?.major || '—'}</div>
                                  <div className="text-[11px] text-gray-400 mt-0.5">{info?.educationTime || '—'}</div>
                                </td>
                                <td className="px-4 py-3">
                                  <div className="text-[12px] text-gray-700">{lastWorkDisplay}</div>
                                  <div className="flex flex-wrap gap-1 mt-1">
                                    {(candidate.honors || []).slice(0, 2).map((h, i) => (
                                      <span key={i} className="text-[10px] px-1.5 py-0.5 bg-amber-50 text-amber-700 rounded">{h}</span>
                                    ))}
                                  </div>
                                  <div className="flex items-center gap-2 mt-1 text-[11px] text-gray-500">
                                    {info?.expectedSalary && (
                                      <span className="flex items-center gap-0.5"><Banknote className="w-3 h-3" />{info.expectedSalary}</span>
                                    )}
                                    {info?.location && (
                                      <span className="flex items-center gap-0.5"><MapPin className="w-3 h-3" />{info.location}</span>
                                    )}
                                  </div>
                                </td>
                                <td className="px-4 py-3 text-center">
                                  <div className="w-10 h-10 rounded-full bg-red-500 flex items-center justify-center text-lg font-black text-white mx-auto">
                                    {candidate.fitScore?.[0] || 0}
                                  </div>
                                </td>
                                <td className="px-4 py-3">
                                  <div className="text-[12px] text-gray-600 line-clamp-2 max-w-[180px]">
                                    {candidate._aiResult?.overallAssessment || candidate.reason || '—'}
                                  </div>
                                </td>
                                <td className="px-4 py-3 text-right">
                                  <div className="flex items-center justify-end gap-2">
                                    <button onClick={() => handleAddToShortlist(candidate)} className="px-3 py-1.5 bg-[#1a4bc4] hover:bg-[#0c2b7a] text-white rounded-lg text-[12px] font-medium transition-colors">加入名单</button>
                                    <button onClick={() => setSelectedCandidate(candidate)} className="px-3 py-1.5 border border-gray-200 hover:bg-gray-50 text-gray-700 rounded-lg text-[12px] font-medium transition-colors">详情</button>
                                    <button
                                      onClick={() => handleReparseCandidate(candidate)}
                                      className="px-2 py-1.5 border border-blue-200 text-blue-500 rounded-lg hover:bg-blue-50 transition-colors"
                                      title="重新解析"
                                    >
                                      <RefreshCw className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      onClick={() => handleDeleteCandidate(candidate)}
                                      className="px-2 py-1.5 border border-red-200 text-red-500 rounded-lg hover:bg-red-50 transition-colors"
                                      title="删除"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </>
  );
};
