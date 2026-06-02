import React, {useState, useCallback, useEffect, useRef} from 'react';
import {ArrowLeft, GraduationCap, BookOpen, Shield, Mic} from 'lucide-react';
import {useNavigate} from 'react-router-dom';
import {VideoPlayer, type VideoPlayerHandle} from './VideoPlayer';
import {LearningTabPanel} from './LearningTabPanel';
import {AISummaryTab} from './tabs/AISummaryTab';
import {TranscriptTab} from './tabs/TranscriptTab';
import {NotesTab} from './tabs/NotesTab';
import {AIQAChatTab} from './tabs/AIQAChatTab';
import {TopicTagBar, type TopicSegment as TopicSegmentUI} from './TopicTagBar';
import {TopicCardList} from './TopicCardList';
import {TranscriptRecorder} from './TranscriptRecorder';
import {generateTopics, updateCourse, type TopicSegment} from '../../api';
import type {TrainingCourse} from '../../types';

const TOPIC_COLORS = [
  '#4F46E5', '#059669', '#D97706', '#DC2626',
  '#7C3AED', '#0891B2', '#DB2777', '#65A30D',
];

interface CourseSection {
  sectionTitle: string;
  contentType: 'text' | 'video' | 'link';
  contentUrl?: string;
  text?: string;
}

interface PortalEnrollment {
  id: string;
  candidate_id: string;
  candidate_name: string;
  course_id: string;
  course_title: string;
  course_description: string;
  difficulty: string;
  duration_minutes: number;
  status: string;
  enrolled_at: string;
  progress_pct: number;
  final_score: number | null;
  content: CourseSection[];
  materials: {title: string; type: string; url?: string}[];
}

type TabId = 'summary' | 'transcript' | 'notes' | 'qa';

export const VideoLearningAssistant: React.FC<{
  enrollment?: PortalEnrollment;
  candidateId?: string;
  token?: string;
  course?: TrainingCourse;
  onCourseUpdated?: (course: TrainingCourse) => void;
}> = ({enrollment, candidateId, token, course, onCourseUpdated}) => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabId>('summary');
  const [currentVideoTime, setCurrentVideoTime] = useState(0);
  const [seekTo, setSeekTo] = useState<number | undefined>(undefined);
  const [videoDuration, setVideoDuration] = useState(0);
  const [topicSegments, setTopicSegments] = useState<TopicSegmentUI[]>([]);
  const [topicsLoading, setTopicsLoading] = useState(false);
  const [showRecorder, setShowRecorder] = useState(false);
  const [localCourse, setLocalCourse] = useState<TrainingCourse | null>(course ?? null);
  const playerRef = useRef<VideoPlayerHandle>(null);

  // Use localCourse if available (updated after transcript save), otherwise props
  const effectiveCourse = localCourse ?? course;
  const isPreviewMode = !!effectiveCourse;

  const contentSections: CourseSection[] = isPreviewMode
    ? (effectiveCourse!.content ?? [])
    : (enrollment!.content ?? []);

  const courseTitle = isPreviewMode ? effectiveCourse!.title : enrollment!.course_title;
  const courseDescription = isPreviewMode ? effectiveCourse!.description : enrollment!.course_description;
  const durationMinutes = isPreviewMode ? effectiveCourse!.durationMinutes : enrollment!.duration_minutes;
  const subtitle = isPreviewMode ? '管理员预览' : enrollment!.candidate_name;

  const videoSection = contentSections.find(s => s.contentType === 'video');
  const videoUrl = videoSection?.contentUrl ?? '';

  const transcriptText = contentSections
    .filter(s => s.contentType === 'text' && s.text)
    .map(s => s.text!)
    .join('\n');

  // Auto-generate topics when transcript is available
  useEffect(() => {
    if (!transcriptText) return;
    let cancelled = false;
    setTopicsLoading(true);
    generateTopics(transcriptText, courseTitle, videoDuration || durationMinutes * 60)
      .then(rawTopics => {
        if (cancelled) return;
        const mapped: TopicSegmentUI[] = rawTopics.map((t, i) => ({
          id: `topic-${i}`,
          title: t.title,
          startTime: t.startTime,
          endTime: t.endTime,
          color: TOPIC_COLORS[i % TOPIC_COLORS.length],
        }));
        setTopicSegments(mapped);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setTopicsLoading(false); });
    return () => { cancelled = true; };
  }, [transcriptText, courseTitle, videoDuration, durationMinutes]);

  const handleTimeUpdate = useCallback((time: number) => {
    setCurrentVideoTime(time);
  }, []);

  const handleDurationChange = useCallback((dur: number) => {
    setVideoDuration(dur);
  }, []);

  const handleSeek = useCallback((time: number) => {
    setSeekTo(time);
  }, []);

  // Save transcript to course
  const handleTranscriptGenerated = async (transcript: string) => {
    if (!effectiveCourse) return;

    // Add/update text section in course content
    const existingTextIdx = contentSections.findIndex(s => s.contentType === 'text');
    const newContent = [...contentSections];
    if (existingTextIdx >= 0) {
      newContent[existingTextIdx] = {...newContent[existingTextIdx], text: transcript};
    } else {
      newContent.push({sectionTitle: '文字稿', contentType: 'text', text: transcript});
    }

    try {
      const updated = await updateCourse(effectiveCourse.id, {content: newContent} as Partial<TrainingCourse>);
      setLocalCourse(updated);
      onCourseUpdated?.(updated);
      setShowRecorder(false);
    } catch (e) {
      console.error('Failed to save transcript:', e);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <div className={`p-1.5 rounded-lg ${isPreviewMode ? 'bg-amber-100' : 'bg-indigo-100'}`}>
              {isPreviewMode
                ? <Shield className="w-5 h-5 text-amber-600" />
                : <GraduationCap className="w-5 h-5 text-indigo-600" />
              }
            </div>
            <div>
              <h1 className="font-semibold text-gray-900 text-sm">{courseTitle}</h1>
              <p className="text-xs text-gray-400">{subtitle}</p>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {isPreviewMode && (
              <span className="text-xs px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full">预览模式</span>
            )}
            <span className="text-xs text-gray-400 flex items-center gap-1">
              <BookOpen className="w-3.5 h-3.5" />
              {durationMinutes} 分钟
            </span>
          </div>
        </div>
      </div>

      {/* Main content: video + tabs */}
      <div className="flex-1 max-w-7xl mx-auto w-full p-4">
        <div className="flex gap-4 h-[calc(100vh-120px)]">
          {/* Left: Video player */}
          <div className="w-[60%] flex flex-col gap-3 overflow-y-auto">
            {videoUrl ? (
              <VideoPlayer
                ref={playerRef}
                src={videoUrl}
                onTimeUpdate={handleTimeUpdate}
                onDurationChange={handleDurationChange}
                externalSeek={seekTo}
                topicSegments={topicSegments}
              />
            ) : (
              <div className="aspect-video bg-gray-900 rounded-xl flex items-center justify-center shrink-0">
                <div className="text-center text-white/60 space-y-2">
                  <BookOpen className="w-12 h-12 mx-auto opacity-40" />
                  <p className="text-sm">暂无视频内容</p>
                </div>
              </div>
            )}

            {/* AI Topic Tags */}
            {(topicSegments.length > 0 || topicsLoading) && (
              <TopicTagBar
                topics={topicSegments}
                currentVideoTime={currentVideoTime}
                onSeek={handleSeek}
                loading={topicsLoading}
                onSearchTopic={(keyword) => {
                  const match = topicSegments.find(t =>
                    t.title.includes(keyword) || keyword.includes(t.title)
                  );
                  if (match) handleSeek(match.startTime);
                }}
              />
            )}

            {/* Topic card list with mini progress bars */}
            {topicSegments.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 p-3">
                <TopicCardList
                  topics={topicSegments}
                  currentVideoTime={currentVideoTime}
                  duration={videoDuration}
                  onSeek={handleSeek}
                />
              </div>
            )}

            {/* Transcript Recorder */}
            {showRecorder ? (
              <TranscriptRecorder
                videoRef={{current: playerRef.current?.getVideoElement() ?? null}}
                onTranscriptGenerated={handleTranscriptGenerated}
                onClose={() => setShowRecorder(false)}
              />
            ) : (
              <div className="flex gap-2">
                <button
                  onClick={() => setActiveTab('notes')}
                  className="flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-200 rounded-lg text-xs text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  + 添加笔记（当前 {Math.floor(currentVideoTime / 60)}:{String(Math.floor(currentVideoTime % 60)).padStart(2, '0')}）
                </button>
                {isPreviewMode && videoUrl && (
                  <button
                    onClick={() => setShowRecorder(true)}
                    className="flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-200 rounded-lg text-xs text-gray-600 hover:bg-red-50 hover:border-red-200 hover:text-red-600 transition-colors"
                  >
                    <Mic className="w-3.5 h-3.5" />
                    录制文字稿
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Right: Tab panel */}
          <div className="w-[40%] flex flex-col">
            <LearningTabPanel
              activeTab={activeTab}
              onTabChange={setActiveTab}
              summaryTab={
                <AISummaryTab content={transcriptText} courseTitle={courseTitle} />
              }
              transcriptTab={
                <TranscriptTab sections={contentSections} onSeek={handleSeek} currentVideoTime={currentVideoTime} />
              }
              notesTab={
                <NotesTab
                  enrollmentId={isPreviewMode ? effectiveCourse!.id : enrollment!.id}
                  candidateId={isPreviewMode ? 'admin-preview' : (candidateId ?? '')}
                  currentVideoTime={currentVideoTime}
                  onSeek={handleSeek}
                  previewMode={isPreviewMode}
                />
              }
              qaTab={
                <AIQAChatTab
                  transcript={transcriptText}
                  courseTitle={courseTitle}
                  currentVideoTime={currentVideoTime}
                />
              }
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default VideoLearningAssistant;
