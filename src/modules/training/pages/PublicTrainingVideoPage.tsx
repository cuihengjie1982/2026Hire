import {useEffect, useState} from 'react';
import {useSearchParams} from 'react-router-dom';
import {AlertCircle, Loader2} from 'lucide-react';
import {getPublicTrainingCourse} from '../api';
import type {TrainingCourse} from '../types';
import {VideoLearningAssistant} from '../components/VideoLearningAssistant/VideoLearningAssistant';

export const PublicTrainingVideoPage = () => {
  const [searchParams] = useSearchParams();
  const courseId = searchParams.get('courseId') ?? '';
  const token = searchParams.get('token') ?? '';
  const [course, setCourse] = useState<TrainingCourse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!courseId || !token) {
      setError('培训链接缺少必要参数');
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    getPublicTrainingCourse(courseId, token)
      .then((result) => {
        if (!cancelled) setCourse(result);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : '链接无效或课程不存在');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [courseId, token]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (error || !course) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-6">
        <div className="text-center space-y-3 max-w-sm">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto" />
          <h1 className="text-lg font-semibold text-gray-900">培训链接不可用</h1>
          <p className="text-sm text-gray-500">{error || '请联系管理员获取新的培训链接'}</p>
        </div>
      </div>
    );
  }

  return <VideoLearningAssistant course={course} publicMode />;
};

export default PublicTrainingVideoPage;
