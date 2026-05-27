import {USE_MOCK_API, API_BASE_URL, getAuthToken} from '../../shared/lib/runtime';

const efetch = async <T>(path: string, method = 'GET', body?: unknown): Promise<T> => {
  const base = USE_MOCK_API ? '' : API_BASE_URL;
  const res = await fetch(`${base}/functions/v1/embox-api${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${getAuthToken() ?? ''}`,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || `API error ${res.status}`);
  return data as T;
};
import {type CandidateCard, type TalentStats} from './types';
import {extractResumeInfoFromMarkdown, type ParsedResumeInfo} from '../../shared/lib/mineruClient';
import {calculateResumeScore, type ScoreResult} from '../../shared/lib/resumeScorer';
import {getPositionDetail} from '../positions/api';
import {parseResume, type PipelineConfig} from '../../shared/lib/resumePipeline';

// MinerU API token - loaded from environment variables
const MINERU_API_TOKEN = import.meta.env.VITE_MINERU_API_TOKEN || '';

// localStorage key for persisted imported candidates
const IMPORTED_CANDIDATES_KEY = 'em-box.imported-candidates';
const DATA_VERSION_KEY = 'em-box.data-version';
const CURRENT_DATA_VERSION = '2'; // Bump to clear old fixture data

// Load candidates from localStorage, start empty if none
const loadCandidatesFromStorage = (): CandidateCard[] => {
  try {
    // Clear data from older versions (e.g. fixture data)
    const version = localStorage.getItem(DATA_VERSION_KEY);
    if (version !== CURRENT_DATA_VERSION) {
      localStorage.removeItem(IMPORTED_CANDIDATES_KEY);
      localStorage.setItem(DATA_VERSION_KEY, CURRENT_DATA_VERSION);
      return [];
    }

    const stored = localStorage.getItem(IMPORTED_CANDIDATES_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    }
  } catch (e) {
    console.error('Failed to load from localStorage:', e);
  }
  return [];
};

const saveCandidatesToStorage = (candidates: CandidateCard[]) => {
  try {
    localStorage.setItem(IMPORTED_CANDIDATES_KEY, JSON.stringify(candidates));
  } catch (e) {
    console.error('Failed to save to localStorage:', e);
  }
};

let candidatesData = loadCandidatesFromStorage();

const mapGradeVisuals = (grade: string) => {
  const gradeColorMap: Record<string, string> = {A: 'bg-emerald-500', 'B+': 'bg-blue-500', B: 'bg-blue-400', C: 'bg-yellow-500', D: 'bg-orange-500', F: 'bg-red-500'};
  const scoreColorMap: Record<string, string> = {A: 'border-emerald-500', 'B+': 'border-blue-500', B: 'border-blue-400', C: 'border-yellow-500', D: 'border-orange-500', F: 'border-red-500'};
  return {
    gradeColor: gradeColorMap[grade] || 'bg-[#0EA5E9]',
    scoreColor: scoreColorMap[grade] || 'border-[#0EA5E9]',
  };
};

const buildCandidateCardFromServer = (raw: Record<string, unknown>): CandidateCard => {
  let parsedInfo = (raw.parsed_info || raw.parsedInfo || {}) as Record<string, unknown>;

  // Re-parse from rawText if critical fields are missing or look incorrect
  const rawText = (parsedInfo.rawText as string) || '';
  // City names that might be mistakenly stored as name
  const likelyCityName = ['深圳', '广州', '上海', '北京', '成都', '武汉', '杭州', '南京', '西安', '重庆'].includes(parsedInfo.name as string);
  const needsReparse = rawText && (
    !parsedInfo.gender || !parsedInfo.ageOrBirth || !parsedInfo.email ||
    !parsedInfo.name || parsedInfo.name === '个人优势' || parsedInfo.name === '基本信息' ||
    likelyCityName ||
    !parsedInfo.school || (parsedInfo.school as string).includes('：') ||
    !parsedInfo.major || (parsedInfo.major as string).length < 2
  );
  if (needsReparse) {
    const reParsed = extractResumeInfoFromMarkdown(rawText);
    // Fix name if missing or clearly wrong (including city names mistakenly stored as name)
    const currentName = parsedInfo.name as string;
    const needsNameFix = !currentName || currentName.length < 2 || ['个人优势', '基本信息', '简历'].includes(currentName) || likelyCityName;
    if (needsNameFix && reParsed.name && reParsed.name.length >= 2 && !likelyCityName) {
      parsedInfo.name = reParsed.name;
    }
    if (!parsedInfo.gender && reParsed.gender) parsedInfo.gender = reParsed.gender;
    if (!parsedInfo.ageOrBirth && reParsed.ageOrBirth) parsedInfo.ageOrBirth = reParsed.ageOrBirth;
    if (!parsedInfo.email && reParsed.email) parsedInfo.email = reParsed.email;
    if (!parsedInfo.phone && reParsed.phone) parsedInfo.phone = reParsed.phone;
    if (!parsedInfo.expectedSalary && reParsed.expectedSalary) parsedInfo.expectedSalary = reParsed.expectedSalary;
    if (!parsedInfo.currentlyEmployed && reParsed.currentlyEmployed) parsedInfo.currentlyEmployed = reParsed.currentlyEmployed;
    if (!parsedInfo.highestEducation && reParsed.highestEducation) parsedInfo.highestEducation = reParsed.highestEducation;
    if (!parsedInfo.major && reParsed.major) parsedInfo.major = reParsed.major;
    // Fix school if missing or contains garbage (like "课程：JAVA")
    if ((!parsedInfo.school || (parsedInfo.school as string).includes('：')) && reParsed.school) parsedInfo.school = reParsed.school;
    if (!parsedInfo.location && reParsed.location) parsedInfo.location = reParsed.location;
    if (!parsedInfo.photoBase64 && reParsed.photoBase64) parsedInfo.photoBase64 = reParsed.photoBase64;
    if (!parsedInfo.availability && reParsed.availability) parsedInfo.availability = reParsed.availability;
    const existingSkills = (Array.isArray(parsedInfo.skills) ? parsedInfo.skills : []) as string[];
    if (existingSkills.length === 0 && reParsed.skills.length > 0) parsedInfo.skills = reParsed.skills;
    const existingWork = (Array.isArray(parsedInfo.workExperience) ? parsedInfo.workExperience : []) as string[];
    if (existingWork.length === 0 && reParsed.workExperience.length > 0) parsedInfo.workExperience = reParsed.workExperience;
  }

  const skills = (Array.isArray(parsedInfo.skills) ? parsedInfo.skills : []) as string[];
  const workExp = (Array.isArray(parsedInfo.workExperience) ? parsedInfo.workExperience : []) as string[];
  const tags = (Array.isArray(raw.tags) ? raw.tags : []) as string[];
  const positionName = (raw.position_name as string) || '';
  const projectName = (raw.project_name as string) || '';
  const scoreTotal = Number(raw.score_total || raw.scoreTotal) || 0;
  const hasScore = scoreTotal > 0;
  const grade = hasScore ? ((raw.grade as string) || 'C') : '';
  const {gradeColor, scoreColor} = mapGradeVisuals(grade);

  return {
    id: raw.id as string,
    name: (parsedInfo.name as string) || (raw.name as string) || '',
    location: (raw.location as string) || (parsedInfo.location as string) || '',
    source: (raw.source as string) || '上传简历',
    sourceColor: 'text-[#0EA5E9] bg-[#E0F2FE]',
    roles: positionName ? [positionName] : (workExp.length > 0 ? workExp.slice(0, 1) : []),
    tags: tags.length > 0 ? tags : skills.slice(0, 5),
    fitScore: hasScore ? [scoreTotal] : [],
    scoreColor: hasScore ? scoreColor : '',
    grade,
    gradeColor: hasScore ? gradeColor : '',
    reason: parsedInfo.email ? `邮箱: ${parsedInfo.email}` : (parsedInfo.phone ? `电话: ${parsedInfo.phone}` : ''),
    projectId: (raw.project_id as string) || '',
    projectName,
    positionId: (raw.position_id as string) || '',
    positionName,
    resumeParsedInfo: parsedInfo as unknown as CandidateCard['resumeParsedInfo'],
    originalFileBase64: (raw.original_file_base64 as string) || undefined,
    originalFileName: (raw.original_file_name as string) || undefined,
  };
};

export const getTalentStats = async (): Promise<TalentStats> => {
  if (USE_MOCK_API) {
    await new Promise(r => setTimeout(r, 120));
    return {
      totalCount: candidatesData.length,
      monthlyNew: candidatesData.filter(c => {
        if (!c.id.startsWith('imported-')) return false;
        const ts = parseInt(c.id.split('-')[1] || '0');
        const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
        return ts > thirtyDaysAgo;
      }).length,
      pendingReview: 0,
      gradeDistribution: {A: 0, B: 0, C: 0, D: 0, F: 0},
    };
  }

  // Use Edge Function for stats
  const stats = await efetch<{totalCount: number; monthlyNew: number; gradeDistribution: Record<string, number>}>('/candidate-ops/stats');

  const gradeDistribution = {A: 0, B: 0, C: 0, D: 0, F: 0};
  for (const [grade, count] of Object.entries(stats.gradeDistribution ?? {})) {
    const g = grade?.toUpperCase?.() ?? grade;
    if (g in gradeDistribution) {
      gradeDistribution[g as keyof typeof gradeDistribution] = count;
    }
  }

  return {
    totalCount: stats.totalCount || 0,
    monthlyNew: stats.monthlyNew || 0,
    pendingReview: 0,
    gradeDistribution,
  };
};

export const listCandidates = async (): Promise<CandidateCard[]> => {
  if (USE_MOCK_API) {
    await new Promise(r => setTimeout(r, 120));
    return Array.from(new Map(candidatesData.map(c => [c.id, c])).values());
  }

  const data = await efetch<Record<string, unknown>[]>('/candidate-ops');
  return Array.from(new Map((data ?? []).map(r => [r.id as string, r])).values()).map(buildCandidateCardFromServer);
};

export const reparseCandidate = async (id: string): Promise<CandidateCard | null> => {
  const idx = candidatesData.findIndex(c => c.id === id);
  if (idx < 0) return null;
  const raw = candidatesData[idx];
  const rawText = (raw.resumeParsedInfo?.rawText as string) || '';
  if (!rawText) return raw;

  try {
    const aiResult = await aiParseResume(rawText, raw.resumeParsedInfo as any);
    const updated: CandidateCard = {
      ...raw,
      resumeParsedInfo: {
        ...raw.resumeParsedInfo,
        name: aiResult.name || raw.resumeParsedInfo?.name,
        gender: aiResult.gender || raw.resumeParsedInfo?.gender,
        ageOrBirth: aiResult.ageOrBirth || raw.resumeParsedInfo?.ageOrBirth,
        highestEducation: aiResult.highestEducation || raw.resumeParsedInfo?.highestEducation,
        school: aiResult.school || raw.resumeParsedInfo?.school,
        major: aiResult.major || raw.resumeParsedInfo?.major,
        location: aiResult.location || raw.resumeParsedInfo?.location,
        email: aiResult.email || raw.resumeParsedInfo?.email,
        phone: aiResult.phone || raw.resumeParsedInfo?.phone,
        expectedSalary: aiResult.expectedSalary || raw.resumeParsedInfo?.expectedSalary,
        currentlyEmployed: aiResult.currentlyEmployed || raw.resumeParsedInfo?.currentlyEmployed,
        photoBase64: aiResult.photoBase64 || raw.resumeParsedInfo?.photoBase64,
        honors: aiResult.honors?.length ? aiResult.honors : raw.resumeParsedInfo?.honors,
        skills: aiResult.skills?.length ? aiResult.skills : raw.resumeParsedInfo?.skills,
        workExperience: aiResult.workExperience?.length ? aiResult.workExperience : raw.resumeParsedInfo?.workExperience,
      },
    };
    candidatesData[idx] = updated;
    saveCandidatesToStorage(candidatesData);
    return updated;
  } catch (e) {
    console.error('[Reparse] Failed:', e);
    return raw;
  }
};

export const deleteCandidate = async (id: string): Promise<void> => {
  if (USE_MOCK_API) {
    await new Promise(r => setTimeout(r, 120));
    candidatesData = candidatesData.filter((c) => c.id !== id);
    saveCandidatesToStorage(candidatesData);
    return;
  }

  await efetch(`/candidate-ops/${id}`, 'DELETE');
  candidatesData = candidatesData.filter((c) => c.id !== id);
};

// Check if a candidate is a duplicate by matching name + phone or name + email
const findDuplicateIndex = (name: string, email?: string, phone?: string): number => {
  return candidatesData.findIndex((existing) => {
    const nameMatch = existing.name === name || existing.name === name.replace(/\s+/g, '');
    if (!nameMatch) return false;
    // If both have email, match by email
    if (email && existing.resumeParsedInfo?.email) {
      return existing.resumeParsedInfo.email === email;
    }
    // If both have phone, match by phone
    if (phone && existing.resumeParsedInfo?.phone) {
      return existing.resumeParsedInfo.phone === phone;
    }
    // Name match alone is sufficient if no other identifiers
    return true;
  });
};

/** Try AI-powered resume parsing via Edge Function, fall back to regex */
const aiParseResume = async (resumeText: string, fallback: ParsedResumeInfo): Promise<ParsedResumeInfo> => {
  if (!resumeText || resumeText.trim().length < 30) return fallback;

  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
	      const token = getAuthToken() || '';
	      // Dev: Vite proxy → Express. Prod: Edge Function → /ai-proxy
	      const base = USE_MOCK_API ? '' : API_BASE_URL;
	      const isLocalDev = base.includes('localhost') || base.includes('127.0.0.1');
	      const aiUrl = isLocalDev
	        ? `${base}/api/ai/parse-resume`
	        : `${base}/functions/v1/embox-api/ai-proxy`;
      const resp = await fetch(aiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? {'Authorization': `Bearer ${token}`} : {}),
        },
        body: JSON.stringify({resumeText}),
      });
      if (!resp.ok && resp.status !== 408) {
        console.log(`[AI Parse] HTTP ${resp.status}, using regex fallback`);
        return fallback;
      }
      if (resp.status === 408) {
        console.log('[AI Parse] AI timeout (408), using regex fallback');
        return fallback;
      }
      const data = await resp.json();
      if (!data.name && !data.phone && !data.school) {
        console.log('[AI Parse] Empty result, using regex fallback');
        return fallback;
      }
      // aiProxy works reliably → use real AI extraction
      const ai: ParsedResumeInfo = {
        name: data.name || fallback.name,
        email: data.email || fallback.email,
        phone: data.phone || fallback.phone,
        location: data.location || fallback.location,
        education: fallback.education,
        workExperience: Array.isArray(data.workExperience)
          ? data.workExperience.map((e: Record<string, string>) => [e.period, e.company, e.role, e.desc].filter(Boolean).join(' '))
          : fallback.workExperience,
        skills: Array.isArray(data.skills) ? data.skills : fallback.skills,
        expectedSalary: data.expectedSalary || fallback.expectedSalary,
        currentlyEmployed: data.currentlyEmployed || fallback.currentlyEmployed,
        photoBase64: data.photoBase64 || fallback.photoBase64,
        gender: data.gender || fallback.gender,
        ageOrBirth: data.ageOrBirth || fallback.ageOrBirth,
        highestEducation: data.highestEducation || fallback.highestEducation,
        school: data.school || fallback.school,
        major: data.major || fallback.major,
        honors: Array.isArray(data.honors) ? data.honors : fallback.honors,
        availability: data.availability || fallback.availability,
        rawText: fallback.rawText,
      };
      console.log('[AI Parse] Success:', data.modelUsed);
      return ai;
    } catch (e) {
      const msg = (e as Error).message || String(e);
      const isRetryable = msg.includes('connection') || msg.includes('network') || msg.includes('fetch') ||
        msg.includes('ECONNRESET') || msg.includes('ETIMEDOUT') || msg.includes('timeout');
      console.warn(`[AI Parse] Attempt ${attempt}/${maxAttempts} failed (${isRetryable ? 'retryable' : 'fatal'}): ${msg}`);
      if (!isRetryable || attempt === maxAttempts) {
        console.log('[AI Parse] Using regex fallback');
        return fallback;
      }
      // Wait before retry (1s, 2s, 4s...)
      await new Promise(r => setTimeout(r, attempt * 1000));
    }
  }
  return fallback;
};

export const importResumes = async (
  files: File[],
  projectId?: string,
  positionId?: string,
): Promise<{imported: number; failed: number; duplicates: number; results?: ScoreResult[]}> => {
  if (USE_MOCK_API) {
    await new Promise(r => setTimeout(r, 2500));
    const newCandidates: CandidateCard[] = [];
    const scoreResults: ScoreResult[] = [];
    let duplicates = 0;

    // Get position details if positionId is provided
    let positionDetail = null;
    if (positionId) {
      try {
        positionDetail = await getPositionDetail(positionId);
      } catch (e) {
        console.error('Failed to get position details:', e);
      }
    }

    for (const file of files) {
      try {
        // Read original file as base64 for PDF download
        let originalFileBase64 = '';
        try {
          const arrayBuffer = await file.arrayBuffer();
          const bytes = new Uint8Array(arrayBuffer);
          let binary = '';
          const chunkSize = 8192;
          for (let i = 0; i < bytes.length; i += chunkSize) {
            const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
            binary += String.fromCharCode(...chunk);
          }
          originalFileBase64 = btoa(binary);
        } catch (e) {
          console.warn('Failed to read file as base64:', e);
        }

        // Smart routing pipeline: auto-selects TEXT_PATH or VISION_PATH
        const pipelineResult = await parseResume(file, {
          mineruToken: MINERU_API_TOKEN,
          authToken: getAuthToken(),
        });

        const {parsedInfo, contentMd, photoBase64, metadata} = pipelineResult;
        const candidateName = parsedInfo.name || file.name.replace(/\.(pdf|docx?|doc|png|jpe?g)$/i, '');

        // Populate rawText so AI agents can process this candidate
        parsedInfo.rawText = contentMd || '';

        console.log(`[Import] ${file.name}: route=${metadata.route}, quality=${metadata.qualityScore}(${metadata.qualityLevel}), ` +
          `${metadata.totalDurationMs}ms, stages=${metadata.stagesUsed.join('→')}`);

        // Calculate score if position details available
        let scoreResult: ScoreResult | null = null;
        if (positionDetail) {
          scoreResult = calculateResumeScore(parsedInfo, positionDetail);
          if (scoreResult) scoreResults.push(scoreResult);
        }

        const positionName = positionDetail?.position.name || '';

        const candidate: CandidateCard = {
          id: `imported-${Date.now()}-${newCandidates.length}`,
          name: candidateName,
          location: parsedInfo.location || '',
          source: '上传简历',
          sourceColor: 'text-[#0EA5E9] bg-[#E0F2FE]',
          roles: positionName ? [positionName] : [],
          tags: parsedInfo.skills.length > 0 ? parsedInfo.skills.slice(0, 5) : [],
          fitScore: scoreResult ? [scoreResult.totalScore] : [],
          scoreColor: scoreResult?.scoreColor || '',
          grade: scoreResult?.grade || '',
          gradeColor: scoreResult?.gradeColor || '',
          reason: parsedInfo.email ? `邮箱: ${parsedInfo.email}` : (parsedInfo.phone ? `电话: ${parsedInfo.phone}` : ''),
          projectId: projectId || '',
          projectName: '',
          positionId: positionId || '',
          positionName,
          rawResumeMd: contentMd,
          resumeParsedInfo: parsedInfo,
          scoreResult: scoreResult || undefined,
          originalFileBase64,
          originalFileName: file.name,
        };

        // Check for duplicate and overwrite
        const dupIdx = findDuplicateIndex(candidateName, parsedInfo.email, parsedInfo.phone);
        if (dupIdx >= 0) {
          candidate.id = candidatesData[dupIdx].id;
          candidatesData[dupIdx] = candidate;
          duplicates++;
        } else {
          newCandidates.push(candidate);
        }
      } catch (e) {
        console.error(`Failed to parse ${file.name}:`, e);
        const candidateName = file.name.replace(/\.(pdf|docx?|doc|png|jpe?g)$/i, '');
        const candidate: CandidateCard = {
          id: `imported-${Date.now()}-${newCandidates.length}`,
          name: candidateName,
          location: '',
          source: '上传简历',
          sourceColor: 'text-[#0EA5E9] bg-[#E0F2FE]',
          roles: [],
          tags: [],
          fitScore: [],
          scoreColor: '',
          grade: '',
          gradeColor: '',
          reason: '简历解析失败',
          projectId: projectId || '',
          projectName: '',
          positionId: positionId || '',
          positionName: '',
        };

        const dupIdx = findDuplicateIndex(candidateName);
        if (dupIdx >= 0) {
          candidate.id = candidatesData[dupIdx].id;
          candidatesData[dupIdx] = candidate;
          duplicates++;
        } else {
          newCandidates.push(candidate);
        }
      }
    }

    // Prepend new candidates (non-duplicates)
    candidatesData = [...newCandidates, ...candidatesData];
    saveCandidatesToStorage(candidatesData);
    return {imported: files.length - duplicates, failed: 0, duplicates, results: scoreResults};
  }

  const scoreResults: ScoreResult[] = [];
  let imported = 0;
  let failed = 0;
  let duplicates = 0;

  let positionDetail = null;
  if (positionId) {
    try {
      positionDetail = await getPositionDetail(positionId);
    } catch (e) {
      console.error('Failed to get position details:', e);
    }
  }

  for (const file of files) {
    try {
      // Smart routing pipeline: auto-selects TEXT_PATH or VISION_PATH
      const pipelineResult = await parseResume(file, {
        mineruToken: MINERU_API_TOKEN,
        authToken: getAuthToken(),
      });

      const {parsedInfo, contentMd, photoBase64, metadata} = pipelineResult;
      const candidateName = parsedInfo.name || file.name.replace(/\.(pdf|docx?|doc|png|jpe?g)$/i, '');

      // Populate rawText so AI agents can process this candidate
      parsedInfo.rawText = contentMd || '';

      console.log(`[Import] ${file.name}: route=${metadata.route}, quality=${metadata.qualityScore}(${metadata.qualityLevel}), ` +
        `${metadata.totalDurationMs}ms, stages=${metadata.stagesUsed.join('→')}`);

      const scoreResult = positionDetail ? calculateResumeScore(parsedInfo, positionDetail) : null;
      if (scoreResult) scoreResults.push(scoreResult);

      const grade = scoreResult?.grade || '';
      const scoreTotal = scoreResult?.totalScore ?? 0;

      // Read original file as base64 for PDF download
      let originalFileBase64 = '';
      let originalFileName = file.name;
      try {
        const arrayBuffer = await file.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);
        let binary = '';
        const chunkSize = 8192;
        for (let i = 0; i < bytes.length; i += chunkSize) {
          const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
          binary += String.fromCharCode(...chunk);
        }
        originalFileBase64 = btoa(binary);
      } catch (e) {
        console.warn('Failed to read file as base64:', e);
      }

      // Call edge function for import
      const importResult = await efetch<{imported: number; results: Array<Record<string, unknown>>}>('/candidate-ops/import', 'POST', [{
        name: candidateName,
        email: parsedInfo.email || null,
        phone: parsedInfo.phone || null,
        location: parsedInfo.location || null,
        source: '上传简历',
        projectId: projectId || null,
        positionId: positionId || null,
        parsed_info: parsedInfo,
        grade,
        score_total: scoreTotal,
        original_file_base64: originalFileBase64 || null,
        original_file_name: originalFileName,
      }]);

      const firstResult = importResult.results?.[0] as Record<string, unknown> | undefined;
      const importedId = firstResult?.id as string | undefined;
      const isDuplicate = firstResult?.duplicate === true;
      if (isDuplicate) {
        duplicates += 1;
        if (importedId) {
          const idx = candidatesData.findIndex((c) => c.id === importedId);
          if (idx >= 0) {
            candidatesData[idx] = {...candidatesData[idx], resumeParsedInfo: parsedInfo};
          }
        }
      } else {
        if (importedId && !candidatesData.find(c => c.id === importedId)) {
          candidatesData = [{id: importedId, name: candidateName, resumeParsedInfo: parsedInfo} as CandidateCard, ...candidatesData];
        }
        imported += 1;
      }

      const allTags = parsedInfo.skills.slice(0, 5);
      if (allTags.length > 0 && importedId) {
        await efetch(`/candidate-ops/${importedId}/tags`, 'POST', { tags: allTags });
      }
    } catch (e) {
      console.error(`Failed to import ${file.name}:`, e);
      failed += 1;
    }
  }

  return {imported, failed, duplicates, results: scoreResults};
};