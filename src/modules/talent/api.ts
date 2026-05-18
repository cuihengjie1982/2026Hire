import {supabase} from '../../shared/lib/supabase';
import {invokeEdgeFunction} from '../../shared/lib/apiClient';
import {USE_MOCK_API, API_BASE_URL, getAuthToken} from '../../shared/lib/runtime';
import {type CandidateCard, type TalentStats} from './types';
import {parseResumeWithMinerU, extractResumeInfoFromMarkdown, type ParsedResumeInfo} from '../../shared/lib/mineruClient';
import {calculateResumeScore, type ScoreResult} from '../../shared/lib/resumeScorer';
import {getPositionDetail} from '../positions/api';

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
    const reParsed = extractResumeInfoFromMarkdown(rawText, (parsedInfo.photoBase64 as string) || '');
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

  // Get total count
  const {count: totalCount, error: totalError} = await supabase
    .from('candidates')
    .select('*', {count: 'exact', head: true})
    .not('original_file_name', 'is', null);

  if (totalError) throw new Error(totalError.message);

  // Get monthly new count (last 30 days)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const {count: monthlyNew, error: monthlyError} = await supabase
    .from('candidates')
    .select('*', {count: 'exact', head: true})
    .not('original_file_name', 'is', null)
    .gte('created_at', thirtyDaysAgo);

  if (monthlyError) throw new Error(monthlyError.message);

  // Get grade distribution
  const {data: gradeData, error: gradeError} = await supabase
    .from('candidates')
    .select('grade')
    .not('original_file_name', 'is', null) as { data: { grade: string }[] | null; error: Error | null };

  if (gradeError) throw new Error(gradeError.message);

  const gradeDistribution = {A: 0, B: 0, C: 0, D: 0, F: 0};
  if (gradeData) {
    for (const c of gradeData) {
      const g = (c.grade as string) || '';
      if (g in gradeDistribution) {
        gradeDistribution[g as keyof typeof gradeDistribution]++;
      }
    }
  }

  return {
    totalCount: totalCount || 0,
    monthlyNew: monthlyNew || 0,
    pendingReview: 0,
    gradeDistribution,
  };
};

export const listCandidates = async (): Promise<CandidateCard[]> => {
  if (USE_MOCK_API) {
    await new Promise(r => setTimeout(r, 120));
    return Array.from(new Map(candidatesData.map(c => [c.id, c])).values());
  }

  const {data, error} = await supabase
    .from('candidates')
    .select('*, position:positions(name), project:projects(name), tags:candidate_tags(tag)')
    .not('original_file_name', 'is', null)
    .order('created_at', {ascending: false});

  if (error) throw new Error(error.message);
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
        educationTime: aiResult.educationTime || raw.resumeParsedInfo?.educationTime,
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

  // Use invokeEdgeFunction for cascade delete
  try {
    await invokeEdgeFunction('candidate-ops', { body: { action: 'delete', id } });
  } catch (e) {
    // Fall back to direct delete
    const {error} = await supabase
      .from('candidates')
      .delete()
      .eq('id', id);

    if (error) throw new Error(error.message);
  }
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

/** Try AI-powered resume parsing, fall back to regex */
const aiParseResume = async (resumeText: string, fallback: ParsedResumeInfo): Promise<ParsedResumeInfo> => {
  if (!resumeText || resumeText.trim().length < 30) return fallback;
  try {
    const token = getAuthToken() || '';
    const resp = await fetch(`${API_BASE_URL}/api/ai/parse-resume`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? {Authorization: `Bearer ${token}`} : {}),
      },
      body: JSON.stringify({resumeText}),
    });
    if (!resp.ok) {
      console.log('[AI Parse] Not available, using regex fallback');
      return fallback;
    }
    const data = await resp.json();
    if (!data.name && !data.phone && !data.school) {
      console.log('[AI Parse] Empty result, using regex fallback');
      return fallback;
    }
    // Map AI response to ParsedResumeInfo, filling from fallback for missing fields
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
      educationTime: data.educationTime || fallback.educationTime,
      honors: Array.isArray(data.honors) ? data.honors : fallback.honors,
      availability: data.availability || fallback.availability,
      rawText: fallback.rawText,
    };
    console.log('[AI Parse] Success:', data.modelUsed, JSON.stringify(ai).slice(0, 200));
    return ai;
  } catch (e) {
    console.log('[AI Parse] Failed, using regex fallback:', (e as Error).message);
    return fallback;
  }
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

        const result = await parseResumeWithMinerU(file, MINERU_API_TOKEN);

        if (result.success && result.content_md) {
          let parsedInfo = extractResumeInfoFromMarkdown(result.content_md, result.photoBase64);
          // Attach photo from MinerU result if available
          if (result.photoBase64 && !parsedInfo.photoBase64) {
            parsedInfo.photoBase64 = result.photoBase64;
          }
          // Try AI parsing for better accuracy
          parsedInfo = await aiParseResume(result.content_md, parsedInfo);
          console.log('[Import] Final parsedInfo:', JSON.stringify(parsedInfo, null, 2));
          const candidateName = parsedInfo.name || file.name.replace(/\.(pdf|docx?|doc|png|jpe?g)$/i, '');

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
            rawResumeMd: result.content_md,
            resumeParsedInfo: parsedInfo,
            scoreResult: scoreResult || undefined,
            originalFileBase64,
            originalFileName: file.name,
          };

          // Check for duplicate and overwrite
          const dupIdx = findDuplicateIndex(candidateName, parsedInfo.email, parsedInfo.phone);
          if (dupIdx >= 0) {
            // Preserve original ID, overwrite everything else
            candidate.id = candidatesData[dupIdx].id;
            candidatesData[dupIdx] = candidate;
            duplicates++;
          } else {
            newCandidates.push(candidate);
          }
        } else {
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
            reason: result.error || '简历解析失败',
            projectId: projectId || '',
            projectName: '',
            positionId: positionId || '',
            positionName: '',
            resumeParsedInfo: result.photoBase64 ? {photoBase64: result.photoBase64} as CandidateCard['resumeParsedInfo'] : undefined,
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
      const parsed = await parseResumeWithMinerU(file, MINERU_API_TOKEN);
      const contentMd = parsed.content_md || '';
      const photoBase64 = parsed.photoBase64 || '';

      let parsedInfo = extractResumeInfoFromMarkdown(contentMd, photoBase64);
      // Attach photo from MinerU result if available
      if (photoBase64 && !parsedInfo.photoBase64) {
        parsedInfo.photoBase64 = photoBase64;
      }
      // Always try AI parsing to fill missing fields
      parsedInfo = await aiParseResume(contentMd, parsedInfo);
      const candidateName = parsedInfo.name || file.name.replace(/\.(pdf|docx?|doc|png|jpe?g)$/i, '');
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
      const importResult = await invokeEdgeFunction<{id: string; duplicate?: boolean}>('candidate-ops', {
        body: {
          action: 'import',
          candidate: {
            name: candidateName,
            email: parsedInfo.email || null,
            phone: parsedInfo.phone || null,
            location: parsedInfo.location || null,
            source: '上传简历',
            project_id: projectId || null,
            position_id: positionId || null,
            parsed_info: parsedInfo,
            grade,
            score_total: scoreTotal,
            original_file_base64: originalFileBase64 || null,
            original_file_name: originalFileName,
          },
        },
      });

      const isDuplicate = importResult.duplicate === true;
      if (isDuplicate) {
        duplicates += 1;
        // Replace existing entry in candidatesData with updated version
        const idx = candidatesData.findIndex((c) => c.id === importResult.id);
        if (idx >= 0) {
          candidatesData[idx] = {...candidatesData[idx], resumeParsedInfo: parsedInfo};
        } else {
          candidatesData = [{id: importResult.id, name: candidateName, resumeParsedInfo: parsedInfo} as CandidateCard, ...candidatesData];
        }
      } else {
        candidatesData = [{id: importResult.id, name: candidateName, resumeParsedInfo: parsedInfo} as CandidateCard, ...candidatesData];
        imported += 1;
      }

      const allTags = parsedInfo.skills.slice(0, 5);
      if (allTags.length > 0 && importResult.id) {
        await invokeEdgeFunction('candidate-ops', {
          body: { action: 'update-tags', id: importResult.id, tags: allTags },
        });
      }
    } catch (e) {
      console.error(`Failed to import ${file.name}:`, e);
      failed += 1;
    }
  }

  return {imported, failed, duplicates, results: scoreResults};
};