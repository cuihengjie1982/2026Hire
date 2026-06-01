import {useEffect, useState} from 'react';
import {useSearchParams} from 'react-router-dom';
import {Loader2, AlertCircle} from 'lucide-react';
import {USE_MOCK_API, API_BASE_URL} from '../../../shared/lib/runtime';
import {VideoLearningAssistant} from '../components/VideoLearningAssistant/VideoLearningAssistant';

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

  const [data, setData] = useState<PortalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!enrollmentId || !candidateId) {
      setError('缺少必要参数 (enrollmentId, cid)');
      setLoading(false);
      return;
    }

    const qs = new URLSearchParams();
    if (token) qs.set('token', token);
    qs.set('enrollmentId', enrollmentId);
    const queryString = qs.toString();

    const base = USE_MOCK_API ? '' : API_BASE_URL;
    const url = USE_MOCK_API
      ? `/api/training/portal/${encodeURIComponent(candidateId)}?${queryString}`
      : `${base}/functions/v1/embox-api/training/portal/${encodeURIComponent(candidateId)}?${queryString}`;

    fetch(url)
      .then(r => {
        if (!r.ok) throw new Error(r.status === 403 ? '访问被拒绝' : '加载失败');
        return r.json();
      })
      .then((result: PortalData) => {
        setData(result);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [enrollmentId, candidateId, token]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center space-y-3">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto" />
          <p className="text-gray-600">{error || '加载失败'}</p>
        </div>
      </div>
    );
  }

  return (
    <VideoLearningAssistant
      enrollment={data.enrollment}
      candidateId={candidateId}
      token={token}
    />
  );
};

export default VideoLearningPlayerPage;