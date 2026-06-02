import React, {useState, useCallback} from 'react';
import {ArrowLeft, GraduationCap, BookOpen, Shield} from 'lucide-react';
import {useNavigate} from 'react-router-dom';
import {VideoPlayer} from './VideoPlayer';
import {LearningTabPanel} from './LearningTabPanel';
import {AISummaryTab} from './tabs/AISummaryTab';
import {TranscriptTab} from './tabs/TranscriptTab';
import {NotesTab} from './tabs/NotesTab';
import {AIQAChatTab} from './tabs/AIQAChatTab';
import type {TrainingCourse} from '../../types';

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
}> = ({enrollment, candidateId, token, course}) => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabId>('summary');
  const [currentVideoTime, setCurrentVideoTime] = useState(0);
  const [seekTo, setSeekTo] = useState<number | undefined>(undefined);

  const isPreviewMode = !!course;

  const contentSections: CourseSection[] = isPreviewMode
    ? (course!.content ?? [])
    : (enrollment!.content ?? []);

  const courseTitle = isPreviewMode ? course!.title : enrollment!.course_title;
  const courseDescription = isPreviewMode ? course!.description : enrollment!.course_description;
  const durationMinutes = isPreviewMode ? course!.durationMinutes : enrollment!.duration_minutes;
  const subtitle = isPreviewMode ? '管理员预览' : enrollment!.candidate_name;

  const videoSection = contentSections.find(s => s.contentType === 'video');
  const videoUrl = videoSection?.contentUrl ?? '';

  const transcriptText = contentSections
    .filter(s => s.contentType === 'text' && s.text)
    .map(s => s.text!)
    .join('\n');

  const handleTimeUpdate = useCallback((time: number) => {
    setCurrentVideoTime(time);
  }, []);

  const handleSeek = useCallback((time: number) => {
    setSeekTo(time);
  }, []);

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
          <div className="w-[60%] flex flex-col gap-3">
            {videoUrl ? (
              <VideoPlayer
                src={videoUrl}
                onTimeUpdate={handleTimeUpdate}
                externalSeek={seekTo}
              />
            ) : (
              <div className="aspect-video bg-gray-900 rounded-xl flex items-center justify-center">
                <div className="text-center text-white/60 space-y-2">
                  <BookOpen className="w-12 h-12 mx-auto opacity-40" />
                  <p className="text-sm">暂无视频内容</p>
                </div>
              </div>
            )}

            {/* Video section info */}
            {videoSection && (
              <div className="bg-white rounded-xl border border-gray-200 p-3">
                <p className="text-sm font-medium text-gray-800">{videoSection.sectionTitle}</p>
                {courseDescription && (
                  <p className="text-xs text-gray-500 mt-1">{courseDescription}</p>
                )}
              </div>
            )}

            {/* Quick actions */}
            <div className="flex gap-2">
              <button
                onClick={() => setActiveTab('notes')}
                className="flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-200 rounded-lg text-xs text-gray-600 hover:bg-gray-50 transition-colors"
              >
                + 添加笔记（当前 {Math.floor(currentVideoTime / 60)}:{String(Math.floor(currentVideoTime % 60)).padStart(2, '0')}）
              </button>
            </div>
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
                  enrollmentId={isPreviewMode ? course!.id : enrollment!.id}
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
