import React, { useEffect, useRef, useState } from 'react';
import { Box, LogOut, Mic, Video, Volume2, Settings, CheckCircle2, Circle, ChevronRight, Clock, AlertCircle, PlayCircle, ShieldAlert, WifiOff, Loader2, RotateCcw, Send, ChevronDown, ArrowLeft } from 'lucide-react';
import { navigateToPage } from './navigation';
import {listInterviewTemplates, getInterviewTemplateDetail, updateSessionStatus, submitAnswerAudio, aggregateInterviewResults, createInterviewResult} from './modules/interviews/api';
import {createInterviewApprovalRequest} from './modules/approvals/api';
import {type InterviewQuestion, type ScoringConfig, type GradeRule, type AnswerScoreResult} from './modules/interviews/types';

type QuestionItem = {id: number; title: string; text: string; timeLimit: number};

const formatTime = (seconds: number) => {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

type OverlayState = 'none' | 'countdown' | 'recording' | 'review' | 'saved' | 'completed' | 'permission' | 'network';
type ScoringStatus = 'idle' | 'uploading' | 'transcribing' | 'scoring' | 'completed' | 'failed';

export const AIVideoInterviewPage = () => {
  const [questions, setQuestions] = useState<QuestionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [templateName, setTemplateName] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [currentQuestionIdx, setCurrentQuestionIdx] = useState(0);
  const [timeLeft, setTimeLeft] = useState(0);
  const [recordTime, setRecordTime] = useState(0);
  const [countdown, setCountdown] = useState(3);
  const [showTips, setShowTips] = useState(false);

  const [overlayState, setOverlayState] = useState<OverlayState>('none');
  const [remakesLeft, setRemakesLeft] = useState(2);
  const [micEnabled, setMicEnabled] = useState(true);
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [resultSaved, setResultSaved] = useState(false);
  const [scoringConfig, setScoringConfig] = useState<ScoringConfig | null>(null);
  const [gradeRules, setGradeRules] = useState<GradeRule[]>([]);
  // Session context from URL params (set by interview management page)
  const [sessionContext, setSessionContext] = useState<{
    sessionId: string; candidateId: string; candidateName: string; candidateEmail: string;
  } | null>(null);
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const submitTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Full template questions with IDs, scoring guides, etc.
  const [templateQuestions, setTemplateQuestions] = useState<InterviewQuestion[]>([]);

  // MediaRecorder for real audio capture
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const [selectedMimeType, setSelectedMimeType] = useState<string>('audio/webm');

  // Web Speech API for free real-time transcription
  const speechRecognitionRef = useRef<SpeechRecognition | null>(null);
  const currentTranscriptRef = useRef<string>('');
  const [speechSupported] = useState(() =>
    !!(window.SpeechRecognition || window.webkitSpeechRecognition),
  );

  // Per-question scoring state
  const [answerScores, setAnswerScores] = useState<Map<number, AnswerScoreResult>>(new Map());
  const [scoringStatus, setScoringStatus] = useState<ScoringStatus>('idle');

  // Real audio waveform via Web Audio API
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const waveformAnimRef = useRef<number>(0);
  const [waveformData, setWaveformData] = useState<number[]>(Array.from({length: 40}, () => 0.05));

  // Camera stream
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  // Start camera on mount
  useEffect(() => {
    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({video: true, audio: true});
        mediaStreamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (e) {
        console.warn('Camera access denied or unavailable:', e);
        setOverlayState('permission');
      }
    };
    startCamera();

    return () => {
      // Cleanup: stop recorder, speech recognition, and camera tracks
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      if (speechRecognitionRef.current) {
        try { speechRecognitionRef.current.stop(); } catch { /* */ }
      }
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(t => t.stop());
      }
    };
  }, []);

  // Toggle camera track on/off
  useEffect(() => {
    if (mediaStreamRef.current) {
      const videoTracks = mediaStreamRef.current.getVideoTracks();
      videoTracks.forEach(t => { t.enabled = cameraEnabled; });
    }
  }, [cameraEnabled]);

  // Toggle mic track on/off
  useEffect(() => {
    if (mediaStreamRef.current) {
      const audioTracks = mediaStreamRef.current.getAudioTracks();
      audioTracks.forEach(t => { t.enabled = micEnabled; });
    }
  }, [micEnabled]);

  // Detect supported MIME type for MediaRecorder
  useEffect(() => {
    const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];
    for (const t of types) {
      if (MediaRecorder.isTypeSupported(t)) {
        setSelectedMimeType(t);
        return;
      }
    }
    // Fallback: let browser decide
    setSelectedMimeType('');
  }, []);

  // Detect Web Speech API support
  useEffect(() => {
    // Speech API is detected in useState initializer above
  }, []);

  // Load questions from interview template
  useEffect(() => {
    const loadQuestions = async () => {
      try {
        const params = new URLSearchParams(window.location.search);
        const templateId = params.get('templateId');

        // Read session context from URL params
        const sessionId = params.get('sessionId') || '';
        const candidateId = params.get('candidateId') || '';
        const candidateName = params.get('candidateName') || '';
        const candidateEmail = params.get('candidateEmail') || '';
        if (sessionId) {
          setSessionContext({ sessionId, candidateId, candidateName, candidateEmail });
        }

        if (templateId) {
          const detail = await getInterviewTemplateDetail(templateId);
          if (detail && detail.questions.length > 0) {
            setTemplateName(detail.template.name);
            setScoringConfig(detail.template.scoringConfig ?? null);
            setGradeRules(detail.template.gradeRules ?? []);
            setTemplateQuestions(detail.questions);
            setQuestions(detail.questions.map((q: InterviewQuestion, i: number) => ({
              id: i + 1, title: q.title, text: q.prompt, timeLimit: q.timeLimitSeconds,
            })));
            setTimeLeft(detail.questions[0].timeLimitSeconds);
            return;
          }
        }

        // Fallback: try ALL templates until we find one with questions
        const templates = await listInterviewTemplates();
        for (const tpl of templates) {
          const detail = await getInterviewTemplateDetail(tpl.id);
          if (detail && detail.questions.length > 0) {
            setTemplateName(detail.template.name);
            setScoringConfig(detail.template.scoringConfig ?? null);
            setGradeRules(detail.template.gradeRules ?? []);
            setTemplateQuestions(detail.questions);
            setQuestions(detail.questions.map((q: InterviewQuestion, i: number) => ({
              id: i + 1, title: q.title, text: q.prompt, timeLimit: q.timeLimitSeconds,
            })));
            setTimeLeft(detail.questions[0].timeLimitSeconds);
            return;
          }
        }
      } catch (e) {
        console.error('Failed to load interview questions:', e);
      } finally {
        setLoading(false);
      }
    };
    loadQuestions();
  }, []);

  const currentQ = questions[currentQuestionIdx];

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-[#1E1B2E] flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 text-[#6366F1] animate-spin mx-auto mb-4" />
          <p className="text-gray-400">正在加载面试题目...</p>
        </div>
      </div>
    );
  }

  // No questions available
  if (questions.length === 0) {
    return (
      <div className="min-h-screen bg-[#1E1B2E] flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-white mb-2">暂无面试题目</h2>
          <p className="text-gray-400 mb-6">请先在 AI 面试中心配置面试模板并添加题目</p>
          <button
            onClick={() => navigateToPage('ai-interview')}
            className="bg-[#6366F1] hover:bg-[#4F46E5] text-white px-6 py-2.5 rounded-lg font-medium transition-colors"
          >
            前往 AI 面试中心
          </button>
        </div>
      </div>
    );
  }

  const handleStartRecording = () => {
    setOverlayState('countdown');
    setCountdown(3);
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    countdownIntervalRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
          setOverlayState('recording');
          setIsRecording(true);
          setRecordTime(0);
          // Start MediaRecorder on audio-only stream
          startMediaRecorder();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const startMediaRecorder = () => {
    if (!mediaStreamRef.current) return;
    // Create audio-only stream for recording
    const audioTracks = mediaStreamRef.current.getAudioTracks();
    if (audioTracks.length === 0) return;
    const audioStream = new MediaStream(audioTracks);

    const options: MediaRecorderOptions = {};
    if (selectedMimeType) options.mimeType = selectedMimeType;

    try {
      const recorder = new MediaRecorder(audioStream, options);
      audioChunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      recorder.start(1000); // collect chunks every second
      mediaRecorderRef.current = recorder;
    } catch (e) {
      console.warn('MediaRecorder creation failed, trying without options:', e);
      try {
        const recorder = new MediaRecorder(audioStream);
        audioChunksRef.current = [];
        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) audioChunksRef.current.push(e.data);
        };
        recorder.start(1000);
        mediaRecorderRef.current = recorder;
      } catch (e2) {
        console.error('MediaRecorder not available:', e2);
      }
    }

    // Start Web Speech API for real-time transcription (free)
    startSpeechRecognition();
    // Start real audio waveform visualization
    startWaveformAnimation();
  };

  const startSpeechRecognition = () => {
    const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Ctor) return;

    currentTranscriptRef.current = '';
    const recognition = new Ctor();
    recognition.lang = 'zh-CN';
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      let finalText = '';
      for (let i = 0; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          finalText += event.results[i][0].transcript;
        }
      }
      if (finalText) {
        currentTranscriptRef.current = finalText;
      }
    };

    recognition.onerror = (event) => {
      console.warn('Speech recognition error:', event.error);
    };

    recognition.onend = () => {
      // Auto-restart if still recording (Chrome stops after silence)
      if (isRecording && speechRecognitionRef.current) {
        try {
          speechRecognitionRef.current.start();
        } catch { /* already started */ }
      }
    };

    try {
      recognition.start();
      speechRecognitionRef.current = recognition;
    } catch (e) {
      console.warn('Speech recognition start failed:', e);
    }
  };

  const stopSpeechRecognition = (): string => {
    const transcript = currentTranscriptRef.current;
    if (speechRecognitionRef.current) {
      try {
        speechRecognitionRef.current.stop();
      } catch { /* not started */ }
      speechRecognitionRef.current = null;
    }
    currentTranscriptRef.current = '';
    return transcript;
  };

  const startWaveformAnimation = () => {
    if (!mediaStreamRef.current) return;
    try {
      const audioCtx = new AudioContext();
      const source = audioCtx.createMediaStreamSource(mediaStreamRef.current);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 128;
      source.connect(analyser);
      audioContextRef.current = audioCtx;
      analyserRef.current = analyser;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const animate = () => {
        analyser.getByteFrequencyData(dataArray);
        // Sample 40 bars from the frequency data
        const step = Math.floor(dataArray.length / 40);
        const bars: number[] = [];
        for (let i = 0; i < 40; i++) {
          const val = dataArray[i * step] / 255;
          bars.push(Math.max(val, 0.05));
        }
        setWaveformData(bars);
        waveformAnimRef.current = requestAnimationFrame(animate);
      };
      animate();
    } catch (e) {
      console.warn('AudioContext/AnalyserNode not available:', e);
    }
  };

  const stopWaveformAnimation = () => {
    if (waveformAnimRef.current) {
      cancelAnimationFrame(waveformAnimRef.current);
      waveformAnimRef.current = 0;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    setWaveformData(Array.from({length: 40}, () => 0.05));
  };

  const handleStopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    // Stop speech recognition and capture transcript
    stopSpeechRecognition();
    // Stop waveform animation
    stopWaveformAnimation();
    setIsRecording(false);
    setOverlayState('review');
  };

  const handleRemake = () => {
    if (remakesLeft <= 0) return;
    setRemakesLeft((prev) => prev - 1);
    audioChunksRef.current = [];
    currentTranscriptRef.current = '';
    if (speechRecognitionRef.current) {
      try { speechRecognitionRef.current.stop(); } catch { /* */ }
      speechRecognitionRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setOverlayState('none');
    handleStartRecording();
  };

  const handleSubmitAnswer = async () => {
    // Assemble audio blob from recorded chunks
    const mimeType = selectedMimeType || 'audio/webm';
    const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
    // Capture transcript from Web Speech API (may be empty if not supported)
    const speechTranscript = currentTranscriptRef.current;
    currentTranscriptRef.current = '';

    setOverlayState('saved');

    // If we have a transcript from Web Speech API, we can skip Whisper on server
    // Even with small audio, if we have a transcript we can still score
    if (audioBlob.size < 1000 && !speechTranscript) {
      console.warn('Audio blob too small and no transcript available');
      setScoringStatus('failed');
      proceedToNext();
      return;
    }

    // Upload, transcribe, and score
    setScoringStatus(speechTranscript ? 'scoring' : 'uploading');

    try {
      const tq = templateQuestions[currentQuestionIdx];
      const result = await submitAnswerAudio({
        sessionId: sessionContext?.sessionId || '',
        questionId: tq?.id || '',
        questionTitle: currentQ?.title || '',
        questionPrompt: currentQ?.text || '',
        audioDuration: recordTime,
        scoringGuide: tq?.scoringGuide,
        linkedDimensions: tq?.linkedDimensions,
        audioBlob,
        transcript: speechTranscript || undefined,
      });

      setAnswerScores(prev => new Map(prev).set(currentQuestionIdx, result));
      setScoringStatus(result.status === 'completed' ? 'completed' : 'failed');
    } catch (e) {
      console.error('Failed to score answer:', e);
      setScoringStatus('failed');
    }

    proceedToNext();
  };

  const proceedToNext = () => {
    if (submitTimeoutRef.current) clearTimeout(submitTimeoutRef.current);
    submitTimeoutRef.current = setTimeout(() => {
      if (currentQuestionIdx < questions.length - 1) {
        const nextIdx = currentQuestionIdx + 1;
        setCurrentQuestionIdx(nextIdx);
        setTimeLeft(questions[nextIdx].timeLimit);
        setRemakesLeft(2);
        setOverlayState('none');
        setShowTips(false);
        setScoringStatus('idle');
        audioChunksRef.current = [];
      } else {
        setOverlayState('completed');
      }
    }, 1500);
  };

  const handleNextQuestion = () => {
    if (currentQuestionIdx < questions.length - 1) {
      const nextIdx = currentQuestionIdx + 1;
      setCurrentQuestionIdx(nextIdx);
      setTimeLeft(questions[nextIdx].timeLimit);
      setRemakesLeft(2);
      setOverlayState('none');
      setShowTips(false);
    } else {
      setOverlayState('completed');
    }
  };

  const handleTimeUp = () => {
    setIsRecording(false);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    handleSubmitAnswer();
  };

  const handleExit = () => {
    navigateToPage('ai-interview');
  };

  const computeGradeFromRules = (score: number): { grade: 'excellent' | 'good' | 'qualified' | 'pending' | 'rejected'; label: string } => {
    if (gradeRules.length > 0) {
      const matched = gradeRules.find(r => score >= r.minScore && score <= r.maxScore);
      if (matched) {
        const g = matched.grade.toUpperCase().trim();
        if (g === 'A' || g === 'A+' || g === 'S') return { grade: 'excellent', label: matched.label || '表现优秀，推荐录用' };
        if (g === 'B+') return { grade: 'good', label: matched.label || '表现良好，建议考虑' };
        if (g === 'B') return { grade: 'qualified', label: matched.label || '基本合格，可以录用' };
        return { grade: 'pending', label: matched.label || '未达到推荐标准' };
      }
    }
    if (score >= 80) return { grade: 'excellent', label: '表现优秀，强烈推荐录用' };
    if (score >= 70) return { grade: 'good', label: '表现良好，建议进入下一轮' };
    if (score >= 60) return { grade: 'qualified', label: '基本合格，可考虑录用' };
    return { grade: 'pending', label: '未达到录用标准' };
  };

  const saveResult = async () => {
    if (resultSaved || saving) return;
    setSaving(true);
    try {
      let result;

      if (sessionContext?.sessionId) {
        // Full flow: aggregate AI scores from backend
        // Backend auto-creates the approval request, no need to create again
        result = await aggregateInterviewResults(sessionContext.sessionId);

        try {
          await updateSessionStatus(sessionContext.sessionId, 'submitted');
        } catch (e) {
          console.warn('Failed to update session status:', e);
        }
      } else {
        // Preview/direct flow: no session — compute from local answer scores
        const allScores: AnswerScoreResult[] = Array.from(answerScores.values());
        const completedScores = allScores.filter(s => s.status === 'completed' && s.score != null);
        const avgScore = completedScores.length > 0
          ? completedScores.reduce((sum, s) => sum + (s.score ?? 0), 0) / completedScores.length
          : 0;

        let dimensions: { name: string; score: number; weight: number }[];
        if (scoringConfig && scoringConfig.dimensions.length > 0) {
          dimensions = scoringConfig.dimensions.map(d => ({
            name: d.name,
            score: Math.round(avgScore * d.maxScore / 100),
            weight: d.maxScore,
          }));
        } else {
          dimensions = [
            { name: '专业能力', score: Math.round(avgScore), weight: 30 },
            { name: '沟通表达', score: Math.round(avgScore * 0.95), weight: 25 },
            { name: '应变能力', score: Math.round(avgScore * 0.9), weight: 25 },
            { name: '综合素质', score: Math.round(avgScore * 0.92), weight: 20 },
          ];
        }

        const totalScore = Math.min(100, Math.round(
          (scoringConfig?.baseScore || 0) + dimensions.reduce((sum, d) => sum + d.score * (d.weight / 100), 0),
        ));
        const { grade, label } = computeGradeFromRules(totalScore);
        const totalDuration = Math.round(questions.reduce((sum, q) => sum + q.timeLimit, 0) / 60);

        result = await createInterviewResult({
          sessionId: '',
          candidateId: '',
          candidateName: sessionContext?.candidateName || '预览面试',
          candidateEmail: sessionContext?.candidateEmail || 'preview@example.com',
          position: '',
          templateName: templateName || 'AI面试',
          totalScore,
          grade,
          gradeLabel: label,
          dimensions,
          duration: totalDuration,
        });
      }

      setResultSaved(true);
    } catch (e) {
      console.error('Failed to save interview result:', e);
    } finally {
      setSaving(false);
    }
  };

  const handleRestart = () => {
    setCurrentQuestionIdx(0);
    setTimeLeft(questions[0].timeLimit);
    setRemakesLeft(2);
    setOverlayState('none');
    setIsRecording(false);
    setRecordTime(0);
    setShowTips(false);
    setScoringStatus('idle');
    setAnswerScores(new Map());
    audioChunksRef.current = [];
    currentTranscriptRef.current = '';
    if (speechRecognitionRef.current) {
      try { speechRecognitionRef.current.stop(); } catch { /* */ }
      speechRecognitionRef.current = null;
    }
  };

  // Progress percentage
  const progressPct = ((currentQuestionIdx) / questions.length) * 100;

  // Total interview time
  const totalTime = questions.reduce((sum, q) => sum + q.timeLimit, 0);
  const elapsedTotalTime = questions.slice(0, currentQuestionIdx).reduce((sum, q) => sum + q.timeLimit, 0) + recordTime;

  return (
    <div className="h-screen bg-[#1E1B2E] flex flex-col font-sans overflow-hidden">
      {/* Hidden hooks */}
      <ErrorStateShortcuts setOverlayState={setOverlayState} />
      <RecordingTimer
        isRecording={isRecording}
        setTimeLeft={setTimeLeft}
        setRecordTime={setRecordTime}
        onTimeUp={handleTimeUp}
      />

      {/* Top Bar */}
      <div className="h-14 bg-[#151225] flex items-center justify-between px-5 border-b border-white/5 flex-shrink-0">
        <div className="flex items-center">
          <button
            onClick={() => navigateToPage('ai-interview')}
            className="p-1.5 rounded-lg hover:bg-white/10 transition-colors text-white/40 hover:text-white/70 mr-2"
            title="返回面试中心"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="w-7 h-7 bg-gradient-to-br from-[#6366F1] to-[#8B5CF6] rounded-lg flex items-center justify-center mr-2.5">
            <Box className="w-4 h-4 text-white" />
          </div>
          <span className="text-white font-bold text-sm">EM-BOX AI面试间</span>
          {templateName && <span className="text-white/40 text-xs ml-3">| {templateName}</span>}
        </div>

        {/* Progress indicator in top bar */}
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <div className="w-32 bg-white/10 rounded-full h-1.5">
              <div
                className="bg-gradient-to-r from-[#6366F1] to-[#8B5CF6] h-1.5 rounded-full transition-all duration-500"
                style={{width: `${progressPct}%`}}
              />
            </div>
            <span className="text-white/50 text-xs">{Math.round(progressPct)}%</span>
          </div>
          <span className="text-white/40 text-xs">{formatTime(elapsedTotalTime)} / {formatTime(totalTime)}</span>
          <div className="w-px h-5 bg-white/10" />
          <button onClick={handleExit} className="p-1.5 rounded-lg hover:bg-white/10 transition-colors text-white/40 hover:text-white/70" title="退出面试">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left - Video / Camera Area */}
        <div className="flex-1 relative bg-[#0F0D1A] flex items-center justify-center">
          {/* Live camera feed */}
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className={`absolute inset-0 w-full h-full object-cover ${cameraEnabled ? '' : 'hidden'}`}
          />
          {/* Camera off placeholder */}
          {!cameraEnabled && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <div className="w-20 h-20 rounded-full bg-[#6366F1]/20 flex items-center justify-center mx-auto mb-4">
                  <Video className="w-10 h-10 text-[#6366F1]/60" />
                </div>
                <p className="text-white/30 text-sm">摄像头已关闭</p>
              </div>
            </div>
          )}
          {/* Audio Waveform */}
          {isRecording && (
            <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 flex items-end space-x-0.5 h-10">
              {waveformData.map((h, i) => (
                <div
                  key={i}
                  className="w-1 bg-[#6366F1] rounded-full"
                  style={{
                    height: `${h * 40}px`,
                    opacity: 0.4 + Math.random() * 0.6,
                    animation: `pulse ${0.3 + Math.random() * 0.7}s ease-in-out infinite alternate`,
                  }}
                />
              ))}
            </div>
          )}

          {/* Video Controls */}
          <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 flex items-center space-x-2 bg-black/50 backdrop-blur-sm rounded-full px-4 py-2">
            <button
              onClick={() => setMicEnabled(!micEnabled)}
              className={`p-1.5 rounded-full hover:bg-white/10 transition-colors ${micEnabled ? 'text-green-400' : 'text-red-400'}`}
              title={micEnabled ? '关闭麦克风' : '开启麦克风'}
            >
              <Mic className="w-4 h-4" />
            </button>
            <button
              onClick={() => setCameraEnabled(!cameraEnabled)}
              className={`p-1.5 rounded-full hover:bg-white/10 transition-colors ${cameraEnabled ? 'text-green-400' : 'text-red-400'}`}
              title={cameraEnabled ? '关闭摄像头' : '开启摄像头'}
            >
              <Video className="w-4 h-4" />
            </button>
            <button
              onClick={() => setAudioEnabled(!audioEnabled)}
              className={`p-1.5 rounded-full hover:bg-white/10 transition-colors ${audioEnabled ? 'text-green-400' : 'text-red-400'}`}
              title={audioEnabled ? '静音' : '取消静音'}
            >
              <Volume2 className="w-4 h-4" />
            </button>
            <div className="w-px h-4 bg-white/10" />
            <button
              onClick={() => setShowSettings(!showSettings)}
              className={`p-1.5 rounded-full hover:bg-white/10 transition-colors ${showSettings ? 'text-[#6366F1]' : 'text-white/60 hover:text-white'}`}
              title="设置"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>

          {/* Recording Indicator */}
          {isRecording && (
            <div className="absolute top-4 left-4 flex items-center space-x-2 bg-red-600/90 backdrop-blur-sm text-white px-3 py-1.5 rounded-full text-xs font-medium">
              <span className="w-2 h-2 bg-white rounded-full animate-pulse" />
              <span>REC</span>
            </div>
          )}

          {/* Countdown Overlay */}
          {overlayState === 'countdown' && (
            <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-10">
              <div className="text-center">
                <div className="text-[120px] font-black text-white leading-none animate-pulse">{countdown}</div>
                <p className="text-white/50 text-sm mt-6">准备开始录制...</p>
              </div>
            </div>
          )}

          {/* Review Overlay */}
          {overlayState === 'review' && (
            <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-10">
              <div className="bg-[#1E1B2E] border border-white/10 rounded-2xl shadow-2xl p-8 max-w-sm w-full text-center">
                <CheckCircle2 className="w-14 h-14 text-[#10B981] mx-auto mb-4" />
                <h3 className="text-xl font-bold text-white mb-2">录制完成</h3>
                <p className="text-white/50 text-sm mb-1">录制时长: {formatTime(recordTime)}</p>
                <p className="text-white/40 text-xs mb-6">剩余重录次数: {remakesLeft} 次</p>
                <div className="flex flex-col space-y-2.5">
                  <button
                    onClick={handleSubmitAnswer}
                    className="w-full bg-[#6366F1] hover:bg-[#4F46E5] text-white py-2.5 rounded-lg font-medium transition-colors flex items-center justify-center space-x-2"
                  >
                    <Send className="w-4 h-4" />
                    <span>确认提交</span>
                  </button>
                  {remakesLeft > 0 && (
                    <button
                      onClick={handleRemake}
                      className="w-full bg-white/5 border border-white/10 hover:bg-white/10 text-white/70 py-2.5 rounded-lg font-medium transition-colors flex items-center justify-center space-x-2"
                    >
                      <RotateCcw className="w-4 h-4" />
                      <span>重新录制 ({remakesLeft}次)</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Saved / Scoring Overlay */}
          {overlayState === 'saved' && (
            <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-10">
              <div className="text-center">
                {scoringStatus === 'uploading' && (
                  <>
                    <Loader2 className="w-16 h-16 text-[#6366F1] mx-auto mb-4 animate-spin" />
                    <p className="text-white text-lg font-medium">正在上传回答...</p>
                  </>
                )}
                {scoringStatus === 'transcribing' && (
                  <>
                    <Loader2 className="w-16 h-16 text-[#6366F1] mx-auto mb-4 animate-spin" />
                    <p className="text-white text-lg font-medium">AI 正在识别语音...</p>
                  </>
                )}
                {scoringStatus === 'scoring' && (
                  <>
                    <Loader2 className="w-16 h-16 text-[#6366F1] mx-auto mb-4 animate-spin" />
                    <p className="text-white text-lg font-medium">AI 正在评分...</p>
                  </>
                )}
                {scoringStatus === 'completed' && (
                  <>
                    <CheckCircle2 className="w-16 h-16 text-[#10B981] mx-auto mb-4" />
                    <p className="text-white text-lg font-medium">答案已保存并评分</p>
                  </>
                )}
                {scoringStatus === 'failed' && (
                  <>
                    <AlertCircle className="w-16 h-16 text-amber-400 mx-auto mb-4" />
                    <p className="text-white text-lg font-medium">评分暂时不可用</p>
                    <p className="text-white/50 text-sm mt-2">答案已保存，可稍后评分</p>
                  </>
                )}
                {scoringStatus === 'idle' && (
                  <>
                    <CheckCircle2 className="w-16 h-16 text-[#10B981] mx-auto mb-4" />
                    <p className="text-white text-lg font-medium">答案已保存</p>
                  </>
                )}
                <p className="text-white/50 text-sm mt-2">正在准备下一题...</p>
              </div>
            </div>
          )}

          {/* Completed Overlay */}
          {overlayState === 'completed' && (
            <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-10">
              <div className="bg-[#1E1B2E] border border-white/10 rounded-2xl shadow-2xl p-8 max-w-sm w-full text-center">
                <div className="w-20 h-20 bg-gradient-to-br from-[#6366F1] to-[#8B5CF6] rounded-full flex items-center justify-center mx-auto mb-6">
                  {saving ? (
                    <Loader2 className="w-10 h-10 text-white animate-spin" />
                  ) : resultSaved ? (
                    <CheckCircle2 className="w-10 h-10 text-white" />
                  ) : (
                    <CheckCircle2 className="w-10 h-10 text-white" />
                  )}
                </div>
                <h3 className="text-2xl font-bold text-white mb-2">面试完成</h3>
                <p className="text-white/50 text-sm mb-2">您已完成所有 {questions.length} 道面试题目</p>
                {saving && (
                  <p className="text-[#6366F1] text-sm mb-4 flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    正在汇总面试结果...
                  </p>
                )}
                {resultSaved && (
                  <p className="text-emerald-400 text-sm mb-4">面试结果已保存并提交审批</p>
                )}
                {!saving && !resultSaved && (
                  <p className="text-white/30 text-xs mb-4">点击下方按钮保存结果</p>
                )}
                <div className="flex flex-col space-y-2.5">
                  {!resultSaved && (
                    <button
                      onClick={saveResult}
                      disabled={saving}
                      className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-2.5 rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                      保存结果并提交审批
                    </button>
                  )}
                  {resultSaved && (
                    <button
                      onClick={() => navigateToPage('approvals')}
                      className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-2.5 rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                    >
                      查看审批状态
                    </button>
                  )}
                  <button
                    onClick={handleExit}
                    className="w-full bg-[#6366F1] hover:bg-[#4F46E5] text-white py-2.5 rounded-lg font-medium transition-colors"
                  >
                    返回面试中心
                  </button>
                  <button
                    onClick={handleRestart}
                    className="w-full bg-white/5 border border-white/10 hover:bg-white/10 text-white/70 py-2.5 rounded-lg font-medium transition-colors"
                  >
                    重新面试
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Permission Error Overlay */}
          {overlayState === 'permission' && (
            <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-10">
              <div className="bg-[#1E1B2E] border border-white/10 rounded-2xl shadow-2xl p-8 max-w-sm w-full text-center">
                <ShieldAlert className="w-12 h-12 text-[#F59E0B] mx-auto mb-4" />
                <h3 className="text-xl font-bold text-white mb-2">权限不足</h3>
                <p className="text-white/50 text-sm mb-6">请允许摄像头和麦克风权限以进行面试录制</p>
                <button
                  onClick={async () => {
                    try {
                      const stream = await navigator.mediaDevices.getUserMedia({video: true, audio: true});
                      mediaStreamRef.current = stream;
                      if (videoRef.current) videoRef.current.srcObject = stream;
                      setOverlayState('none');
                    } catch {
                      // Stay on permission overlay
                    }
                  }}
                  className="bg-[#6366F1] hover:bg-[#4F46E5] text-white px-6 py-2.5 rounded-lg font-medium transition-colors"
                >
                  重新授权
                </button>
              </div>
            </div>
          )}

          {/* Network Error Overlay */}
          {overlayState === 'network' && (
            <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-10">
              <div className="bg-[#1E1B2E] border border-white/10 rounded-2xl shadow-2xl p-8 max-w-sm w-full text-center">
                <WifiOff className="w-12 h-12 text-red-500 mx-auto mb-4" />
                <h3 className="text-xl font-bold text-white mb-2">网络连接中断</h3>
                <p className="text-white/50 text-sm mb-6">请检查网络连接后重试</p>
                <button
                  onClick={() => {
                    setReconnecting(true);
                    setTimeout(() => {
                      setReconnecting(false);
                      setOverlayState('none');
                    }, 1500);
                  }}
                  disabled={reconnecting}
                  className="bg-[#6366F1] hover:bg-[#4F46E5] text-white px-6 py-2.5 rounded-lg font-medium transition-colors flex items-center justify-center space-x-2 disabled:opacity-50"
                >
                  {reconnecting && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>{reconnecting ? '正在重新连接...' : '重新连接'}</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Right - Question Panel */}
        <div className="w-[420px] bg-white border-l border-gray-200 flex flex-col flex-shrink-0">
          {/* Question Header */}
          <div className="p-6 border-b border-gray-100">
            <div className="flex items-center space-x-2 mb-4">
              <span className="text-sm font-medium text-[#6366F1] bg-[#6366F1]/10 px-2.5 py-1 rounded">
                Q{currentQuestionIdx + 1}
              </span>
              <span className="text-gray-400 text-sm">/ 共 {questions.length} 题</span>
            </div>
            <h2 className="text-gray-900 font-bold text-xl mb-3">{currentQ?.title}</h2>
            <p className="text-gray-600 text-base leading-relaxed">{currentQ?.text}</p>
          </div>

          {/* Timer Display */}
          <div className="px-5 py-4 border-b border-gray-100">
            <div className="flex items-center justify-between">
              <span className="text-gray-400 text-xs">答题时长</span>
              <span className={`text-2xl font-mono font-bold ${timeLeft <= 30 ? 'text-red-500' : 'text-gray-900'}`}>
                {formatTime(timeLeft)}
              </span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-1.5 mt-2">
              <div
                className={`h-1.5 rounded-full transition-all duration-1000 ${timeLeft <= 30 ? 'bg-red-500' : 'bg-[#6366F1]'}`}
                style={{width: `${currentQ ? (timeLeft / currentQ.timeLimit) * 100 : 0}%`}}
              />
            </div>
          </div>

          {/* Tips Section */}
          <div className="px-5 py-3 border-b border-gray-100">
            <button
              onClick={() => setShowTips(!showTips)}
              className="flex items-center space-x-2 text-gray-400 hover:text-gray-600 text-xs transition-colors"
            >
              <ChevronDown className={`w-3 h-3 transition-transform ${showTips ? 'rotate-180' : ''}`} />
              <span>答题提示</span>
            </button>
            {showTips && (
              <div className="mt-2 text-gray-500 text-xs leading-relaxed bg-gray-50 rounded-lg p-3">
                请在录制前认真阅读题目要求，确保回答内容完整。建议先思考再作答，注意控制时间。
              </div>
            )}
          </div>

          {/* Question List */}
          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            <p className="text-gray-400 text-sm mb-3 px-1">题目列表</p>
            {questions.map((q, idx) => {
              const score = answerScores.get(idx);
              return (
                <button
                  key={q.id}
                  onClick={() => {
                    if (idx <= currentQuestionIdx) {
                      setCurrentQuestionIdx(idx);
                      setTimeLeft(q.timeLimit);
                      setRemakesLeft(2);
                      setOverlayState('none');
                      setIsRecording(false);
                      setShowTips(false);
                    }
                  }}
                  className={`w-full flex items-center px-4 py-3 rounded-lg text-base transition-all text-left ${
                    idx === currentQuestionIdx
                      ? 'bg-[#6366F1]/10 text-[#6366F1] font-medium border border-[#6366F1]/20'
                      : idx < currentQuestionIdx
                        ? 'text-gray-500 hover:bg-gray-50'
                        : 'text-gray-300 cursor-not-allowed'
                  }`}
                >
                  <span className="mr-3 flex-shrink-0">
                    {idx < currentQuestionIdx ? (
                      score?.status === 'completed' ? (
                        <div className="flex items-center">
                          <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                          {score.score != null && (
                            <span className="ml-1 text-xs text-emerald-600 font-medium">{Math.round(score.score)}</span>
                          )}
                        </div>
                      ) : score?.status === 'failed' ? (
                        <AlertCircle className="w-5 h-5 text-amber-400" />
                      ) : (
                        <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                      )
                    ) : idx === currentQuestionIdx ? (
                      <PlayCircle className="w-5 h-5 text-[#6366F1]" />
                    ) : (
                      <Circle className="w-5 h-5" />
                    )}
                  </span>
                  <span className="truncate flex-1">Q{idx + 1} {q.title}</span>
                  <span className="text-gray-400 ml-3 flex-shrink-0 text-sm">{formatTime(q.timeLimit)}</span>
                </button>
              );
            })}
          </div>

          {/* Action Buttons */}
          <div className="p-4 border-t border-gray-100 space-y-2.5">
            {!isRecording && overlayState === 'none' && (
              <button
                onClick={handleStartRecording}
                className="w-full bg-[#6366F1] hover:bg-[#4F46E5] text-white py-3 rounded-lg font-medium transition-colors flex items-center justify-center space-x-2"
              >
                <Mic className="w-4 h-4" />
                <span>开始录制</span>
              </button>
            )}
            {isRecording && (
              <button
                onClick={handleStopRecording}
                className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 py-3 rounded-lg font-medium transition-colors flex items-center justify-center space-x-2"
              >
                <span className="w-3 h-3 bg-red-500 rounded-sm" />
                <span>停止录制</span>
              </button>
            )}
            {overlayState === 'none' && !isRecording && (
              <div className="flex items-center justify-between">
                {currentQuestionIdx < questions.length - 1 ? (
                  <button
                    onClick={handleNextQuestion}
                    className="flex items-center space-x-1 text-gray-400 hover:text-gray-600 text-xs font-medium transition-colors"
                  >
                    <span>跳过此题</span>
                    <ChevronRight className="w-3 h-3" />
                  </button>
                ) : (
                  <button
                    onClick={() => setOverlayState('completed')}
                    className="flex items-center space-x-1 text-emerald-600 hover:text-emerald-700 text-xs font-medium transition-colors"
                  >
                    <span>结束面试</span>
                  </button>
                )}
                <span className="text-gray-300 text-xs">
                  当前第 {currentQuestionIdx + 1} 题 / 共 {questions.length} 题
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// Extracted component for keyboard shortcuts (Ctrl+1 permission, Ctrl+2 network, Ctrl+0 reset)
function ErrorStateShortcuts({setOverlayState}: {setOverlayState: (s: OverlayState) => void}) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === '1') setOverlayState('permission');
      if (e.ctrlKey && e.key === '2') setOverlayState('network');
      if (e.ctrlKey && e.key === '0') setOverlayState('none');
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setOverlayState]);
  return null;
}

// Extracted component for recording timer
function RecordingTimer({
  isRecording,
  setTimeLeft,
  setRecordTime,
  onTimeUp,
}: {
  isRecording: boolean;
  setTimeLeft: React.Dispatch<React.SetStateAction<number>>;
  setRecordTime: React.Dispatch<React.SetStateAction<number>>;
  onTimeUp: () => void;
}) {
  const onTimeUpRef = useRef(onTimeUp);
  onTimeUpRef.current = onTimeUp;

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    if (isRecording) {
      timer = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            if (timer) clearInterval(timer);
            onTimeUpRef.current();
            return 0;
          }
          return prev - 1;
        });
        setRecordTime((prev) => prev + 1);
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isRecording, setTimeLeft, setRecordTime]);

  return null;
}
