import React from 'react';
import {Play} from 'lucide-react';
import type {TopicSegment} from './TopicTagBar';

interface TopicCardListProps {
  topics: TopicSegment[];
  currentVideoTime: number;
  duration: number;
  onSeek: (time: number) => void;
}

const formatTime = (s: number) => {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
};

export const TopicCardList: React.FC<TopicCardListProps> = ({topics, currentVideoTime, duration, onSeek}) => {
  return (
    <div className="space-y-2 max-h-[200px] overflow-y-auto">
      {topics.map(topic => {
        const isActive = currentVideoTime >= topic.startTime && currentVideoTime < topic.endTime;
        const topicDuration = topic.endTime - topic.startTime;
        const progressInTopic = isActive
          ? Math.min(1, (currentVideoTime - topic.startTime) / topicDuration)
          : currentVideoTime >= topic.endTime ? 1 : 0;

        return (
          <div
            key={topic.id}
            onClick={() => onSeek(topic.startTime)}
            className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-all ${
              isActive ? 'bg-surface-muted ring-1' : 'hover:bg-surface-muted'
            }`}
            style={isActive ? {ringColor: topic.color} : {}}
          >
            {/* Play icon */}
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
              style={{backgroundColor: `${topic.color}15`}}
            >
              <Play className="w-3 h-3" style={{color: topic.color, marginLeft: 1}} />
            </div>

            {/* Title + time range */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <span className={`text-xs font-medium truncate ${isActive ? '' : 'text-fg-secondary'}`} style={isActive ? {color: topic.color} : {}}>
                  {topic.title}
                </span>
                <span className="text-[10px] text-fg-faint shrink-0 ml-2">
                  {formatTime(topic.startTime)} - {formatTime(topic.endTime)}
                </span>
              </div>
              {/* Mini progress bar */}
              <div className="w-full h-1 bg-gray-200 rounded-full mt-1 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{
                    width: `${progressInTopic * 100}%`,
                    backgroundColor: topic.color,
                  }}
                />
              </div>
            </div>

            {/* Progress percentage */}
            <span className="text-[10px] text-fg-faint w-8 text-right shrink-0">
              {Math.round(progressInTopic * 100)}%
            </span>
          </div>
        );
      })}
    </div>
  );
};

export default TopicCardList;
