import React, {useRef, useState, useEffect, useImperativeHandle, forwardRef} from 'react';

interface TopicSegment {
  id: string;
  title: string;
  startTime: number;
  endTime: number;
  color: string;
}

interface VideoPlayerProps {
  src: string;
  onTimeUpdate?: (time: number) => void;
  onDurationChange?: (duration: number) => void;
  externalSeek?: number;
  topicSegments?: TopicSegment[];
  nativeControls?: boolean;
}

export interface VideoPlayerHandle {
  getVideoElement: () => HTMLVideoElement | null;
}

export const VideoPlayer = forwardRef<VideoPlayerHandle, VideoPlayerProps>(({
  src,
  onTimeUpdate,
  onDurationChange,
  externalSeek,
  topicSegments = [],
  nativeControls = false,
}, ref) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useImperativeHandle(ref, () => ({
    getVideoElement: () => videoRef.current ?? null,
  }));
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [showControls, setShowControls] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const hideTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setErrorMessage('');
  }, [src]);

  useEffect(() => {
    if (externalSeek !== undefined && videoRef.current && Math.abs(videoRef.current.currentTime - externalSeek) > 1) {
      videoRef.current.currentTime = externalSeek;
    }
  }, [externalSeek]);

  const formatTime = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = Math.floor(s % 60);
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      const t = videoRef.current.currentTime;
      setCurrentTime(t);
      onTimeUpdate?.(t);
    }
  };

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
      onDurationChange?.(videoRef.current.duration);
      setErrorMessage('');
    }
  };

  const togglePlay = () => {
    if (videoRef.current) {
      if (playing) videoRef.current.pause();
      else {
        const playResult = videoRef.current.play();
        playResult?.catch(() => {
          setErrorMessage('浏览器暂时无法自动播放，请点击视频自带播放按钮或直接打开视频。');
        });
      }
    }
  };

  const handleVideoError = () => {
    const errorCode = videoRef.current?.error?.code;
    if (errorCode === MediaError.MEDIA_ERR_NETWORK) {
      setErrorMessage('视频网络加载失败，请检查网络后重试，或点击直接打开视频。');
      return;
    }
    if (errorCode === MediaError.MEDIA_ERR_DECODE) {
      setErrorMessage('当前浏览器无法解码这个视频，请点击直接打开视频，或重新上传 H.264 MP4 视频。');
      return;
    }
    if (errorCode === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED) {
      setErrorMessage('当前浏览器不支持这个视频地址或格式，请重新上传 MP4 视频。');
      return;
    }
    setErrorMessage('视频加载失败，请刷新页面后重试，或点击直接打开视频。');
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const t = parseFloat(e.target.value);
    if (videoRef.current) videoRef.current.currentTime = t;
    setCurrentTime(t);
  };

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !muted;
      setMuted(!muted);
    }
  };

  const changeVolume = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseFloat(e.target.value);
    if (videoRef.current) videoRef.current.volume = v;
    setVolume(v);
  };

  const changePlaybackRate = (rate: number) => {
    if (videoRef.current) videoRef.current.playbackRate = rate;
    setPlaybackRate(rate);
  };

  const skip = (delta: number) => {
    if (videoRef.current) videoRef.current.currentTime += delta;
  };

  const showControlsTemporarily = () => {
    setShowControls(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => setShowControls(false), 3000);
  };

  const progressPct = duration > 0 ? (currentTime / duration) * 100 : 0;

  // Find current active topic for tooltip
  const activeTopic = topicSegments.find(t => currentTime >= t.startTime && currentTime < t.endTime);

  return (
    <div
      className="relative w-full bg-black rounded-xl overflow-hidden group"
      onMouseMove={showControlsTemporarily}
      onMouseLeave={() => playing && setShowControls(false)}
    >
      <video
        key={src}
        ref={videoRef}
        src={src}
        controls={nativeControls}
        playsInline
        preload="metadata"
        className="w-full aspect-video object-contain bg-black"
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onCanPlay={() => setErrorMessage('')}
        onError={handleVideoError}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onClick={nativeControls ? undefined : togglePlay}
      />

      {/* Controls overlay */}
      {!nativeControls && (
      <div className={`absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/80 via-transparent to-transparent transition-opacity duration-300 ${showControls || !playing ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
        {/* Progress bar */}
        <div className="px-4 pt-4 pb-2">
          <div className="relative w-full group/progress">
            {/* Topic-colored progress bar background */}
            <div className="w-full h-1.5 bg-white/20 rounded-full overflow-hidden cursor-pointer relative"
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const pct = (e.clientX - rect.left) / rect.width;
                if (videoRef.current) videoRef.current.currentTime = pct * duration;
              }}>

              {/* Topic segments as colored bands */}
              {duration > 0 && topicSegments.map(topic => {
                const left = (topic.startTime / duration) * 100;
                const width = Math.max(0.5, ((topic.endTime - topic.startTime) / duration) * 100);
                const isActive = currentTime >= topic.startTime && currentTime < topic.endTime;
                return (
                  <div
                    key={topic.id}
                    className="absolute top-0 h-full rounded-sm transition-opacity"
                    style={{
                      left: `${left}%`,
                      width: `${width}%`,
                      backgroundColor: isActive ? topic.color : `${topic.color}80`,
                      opacity: isActive ? 1 : 0.6,
                    }}
                  />
                );
              })}

              {/* Current position indicator */}
              <div
                className="absolute top-0 h-full bg-white/30 rounded-full"
                style={{width: `${progressPct}%`}}
              />
            </div>

            {/* Hidden range input for precise seek */}
            <input
              type="range"
              min="0"
              max={duration || 100}
              value={currentTime}
              onChange={handleSeek}
              className="absolute inset-0 w-full h-1.5 opacity-0 cursor-pointer"
            />

            {/* Active topic tooltip on progress bar */}
            {activeTopic && duration > 0 && (
              <div
                className="absolute -top-6 px-2 py-0.5 rounded text-[10px] text-white whitespace-nowrap pointer-events-none"
                style={{
                  left: `${Math.min(95, Math.max(5, (currentTime / duration) * 100))}%`,
                  transform: 'translateX(-50%)',
                  backgroundColor: activeTopic.color,
                }}
              >
                {activeTopic.title}
              </div>
            )}
          </div>
          <div className="flex items-center justify-between mt-1 text-white text-xs">
            <span>{formatTime(currentTime)} / {formatTime(duration)}</span>
            {playbackRate !== 1 && <span className="text-yellow-400">{playbackRate}x</span>}
          </div>
        </div>

        {/* Control buttons */}
        <div className="flex items-center gap-2 px-4 pb-3">
          <button onClick={togglePlay} className="text-white hover:text-red-400 transition-colors">
            {playing ? (
              <svg viewBox="0 0 24 24" className="w-6 h-6 fill-current"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
            ) : (
              <svg viewBox="0 0 24 24" className="w-6 h-6 fill-current"><polygon points="5,3 19,12 5,21"/></svg>
            )}
          </button>
          <button onClick={() => skip(-10)} className="text-white hover:text-red-400 transition-colors text-xs font-bold">-10s</button>
          <button onClick={() => skip(10)} className="text-white hover:text-red-400 transition-colors text-xs font-bold">+10s</button>
          <div className="flex items-center gap-1 ml-2">
            <button onClick={toggleMute} className="text-white hover:text-red-400 transition-colors">
              {muted || volume === 0 ? (
                <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current"><polygon points="11,5 6,9 2,9 2,15 6,15 11,19"/><line x1="23" y1="9" x2="17" y2="15" stroke="currentColor" strokeWidth="2"/><line x1="17" y1="9" x2="23" y2="15" stroke="currentColor" strokeWidth="2"/></svg>
              ) : (
                <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current"><polygon points="11,5 6,9 2,9 2,15 6,15 11,19"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07" stroke="currentColor" strokeWidth="2" fill="none"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14" stroke="currentColor" strokeWidth="2" fill="none"/></svg>
              )}
            </button>
            <input type="range" min="0" max="1" step="0.05" value={volume} onChange={changeVolume}
              className="w-16 h-1 accent-red-500 cursor-pointer" />
          </div>
          <div className="ml-auto flex items-center gap-2">
            {[0.5, 1, 1.5, 2].map(rate => (
              <button key={rate} onClick={() => changePlaybackRate(rate)}
                className={`text-xs px-2 py-0.5 rounded transition-colors ${playbackRate === rate ? 'bg-red-500 text-white' : 'text-white/70 hover:text-white'}`}>
                {rate}x
              </button>
            ))}
          </div>
        </div>
      </div>
      )}

      {/* Play button overlay when paused */}
      {!nativeControls && !playing && !errorMessage && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/30">
          <div className="w-16 h-16 rounded-full bg-white/20 backdrop-blur flex items-center justify-center cursor-pointer hover:bg-white/30 transition-colors"
            onClick={togglePlay}>
            <svg viewBox="0 0 24 24" className="w-8 h-8 fill-white ml-1"><polygon points="5,3 19,12 5,21"/></svg>
          </div>
        </div>
      )}

      {errorMessage && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/70 px-4">
          <div className="max-w-sm rounded-lg bg-surface p-4 text-center shadow-xl">
            <p className="text-sm font-medium text-fg">视频暂时无法播放</p>
            <p className="mt-1 text-xs leading-5 text-fg-muted">{errorMessage}</p>
            <a
              href={src}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-flex items-center justify-center rounded-md bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-800"
            >
              直接打开视频
            </a>
          </div>
        </div>
      )}
    </div>
  );
});

VideoPlayer.displayName = 'VideoPlayer';

export default VideoPlayer;
