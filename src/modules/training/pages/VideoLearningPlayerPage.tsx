import {useEffect, useState} from 'react';
import {useSearchParams} from 'react-router-dom';
import {Loader2, AlertCircle} from 'lucide-react';
import {USE_MOCK_API} from '../../../shared/lib/runtime';
import {buildEdgeFunctionUrl} from '../../../shared/lib/apiClient';
import {VideoLearningAssistant} from '../components/VideoLearningAssistant/VideoLearningAssistant';
import {listCourses} from '../api';
import type {TrainingCourse} from '../types';

interface PortalEnrollment {
  id: string;
  candidate_id: string;
  candidate_name: string;
  course_id: string;
  course_title: string;
  course_description: string;
  difficulty: string;
  duration_minutes: number;
  status: 'enrolled' | 'in_progress' | 'completed' | 'failed';
  enrolled_at: string;
  progress_pct: number;
  final_score: number | null;
  content: {sectionTitle: string; contentType: string; text?: string; contentUrl?: string}[];
  materials: {title: string; type: string; url?: string}[];
}

interface PortalData {
  candidate: {id: string; name: string};
  enrollment: PortalEnrollment;
}

export const VideoLearningPlayerPage = () => {
  const [searchParams] = useSearchParams();
  const enrollmentId = searchParams.get('enrollmentId') ?? '';
  const candidateId = searchParams.get('cid') ?? '';
  const token = searchParams.get('token') ?? '';
  const courseId = searchParams.get('courseId') ?? '';

  const [portalData, setPortalData] = useState<PortalData | null>(null);
  const [course, setCourse] = useState<TrainingCourse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    // Admin preview mode: load course by courseId
    if (courseId && !enrollmentId) {
      (async () => {
        try {
          const result = await listCourses();
          const found = result.items.find((c: TrainingCourse) => c.id === courseId);
          if (!found) { setError('课程不存在'); setLoading(false); return; }
          setCourse(found);
        } catch (e) {
          setError(e instanceof Error ? e.message : '加载失败');
        } finally {
          setLoading(false);
        }
      })();
      return;
    }

    // Candidate mode: load via portal endpoint
    if (!enrollmentId || !candidateId) {
      setError('缺少必要参数 (enrollmentId, cid)');
      setLoading(false);
      return;
    }

    const qs = new URLSearchParams();
    if (token) qs.set('token', token);
    qs.set('enrollmentId', enrollmentId);
    const queryString = qs.toString();

    const url = USE_MOCK_API
      ? `/api/training/portal/${encodeURIComponent(candidateId)}?${queryString}`
      : `${buildEdgeFunctionUrl(`/training/portal/${encodeURIComponent(candidateId)}`)}?${queryString}`;

    fetch(url)
      .then(r => {
        if (!r.ok) throw new Error(r.status === 403 ? '访问被拒绝' : '加载失败');
        return r.json();
      })
      .then((result: PortalData) => {
        setPortalData(result);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [enrollmentId, candidateId, token, courseId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-surface-muted flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-fg-faint" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-surface-muted flex items-center justify-center">
        <div className="text-center space-y-3">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto" />
          <p className="text-fg-secondary">{error}</p>
        </div>
      </div>
    );
  }

  // Admin preview mode
  if (course) {
    return <VideoLearningAssistant course={course} />;
  }

  // Candidate mode
  if (!portalData) {
    return (
      <div className="min-h-screen bg-surface-muted flex items-center justify-center">
        <div className="text-center space-y-3">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto" />
          <p className="text-fg-secondary">加载失败</p>
        </div>
      </div>
    );
  }

  return (
    <VideoLearningAssistant
      enrollment={portalData.enrollment}
      candidateId={candidateId}
      token={token}
    />
  );
};

export default VideoLearningPlayerPage;
