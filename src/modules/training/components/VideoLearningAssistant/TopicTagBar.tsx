import React, {useState} from 'react';
import {Tag, Search, Loader2, X} from 'lucide-react';

export interface TopicSegment {
  id: string;
  title: string;
  startTime: number;
  endTime: number;
  color: string;
}

interface TopicTagBarProps {
  topics: TopicSegment[];
  currentVideoTime: number;
  onSeek: (time: number) => void;
  loading: boolean;
  onSearchTopic?: (keyword: string) => void;
}

export const TopicTagBar: React.FC<TopicTagBarProps> = ({topics, currentVideoTime, onSeek, loading, onSearchTopic}) => {
  const [searchInput, setSearchInput] = useState('');
  const [showInput, setShowInput] = useState(false);

  const isActive = (topic: TopicSegment) =>
    currentVideoTime >= topic.startTime && currentVideoTime < topic.endTime;

  const handleSearch = () => {
    if (searchInput.trim() && onSearchTopic) {
      onSearchTopic(searchInput.trim());
      setSearchInput('');
    }
  };

  return (
    <div className="bg-surface rounded-xl border border-border p-3">
      <div className="flex items-center gap-2 mb-2">
        <Tag className="w-4 h-4 text-indigo-500 shrink-0" />
        <span className="text-xs font-medium text-fg-secondary">AI 主题标签</span>
        {loading && <Loader2 className="w-3 h-3 animate-spin text-fg-faint" />}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {topics.map(topic => (
          <button
            key={topic.id}
            onClick={() => onSeek(topic.startTime)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs transition-all ${
              isActive(topic)
                ? 'ring-2 ring-offset-1 shadow-sm scale-105'
                : 'hover:opacity-80'
            }`}
            style={{
              backgroundColor: isActive(topic) ? topic.color : `${topic.color}20`,
              color: isActive(topic) ? '#fff' : topic.color,
              borderColor: topic.color,
              ...(isActive(topic) ? {ringColor: topic.color} : {}),
            }}
          >
            <span className="w-1.5 h-1.5 rounded-full" style={{backgroundColor: isActive(topic) ? '#fff' : topic.color}} />
            {topic.title}
          </button>
        ))}

        {/* Search / custom topic input */}
        {showInput ? (
          <div className="flex items-center gap-1">
            <input
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              placeholder="输入感兴趣的主题..."
              className="px-2 py-1 border border-border rounded-full text-xs w-32 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              autoFocus
            />
            <button onClick={handleSearch} className="p-1 text-indigo-500 hover:bg-indigo-50 rounded-full">
              <Search className="w-3 h-3" />
            </button>
            <button onClick={() => {setShowInput(false); setSearchInput('');}} className="p-1 text-fg-faint hover:bg-surface-muted rounded-full">
              <X className="w-3 h-3" />
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowInput(true)}
            className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs text-fg-muted border border-dashed border-border hover:border-indigo-400 hover:text-indigo-500 transition-colors"
          >
            <Search className="w-3 h-3" />
            搜索主题
          </button>
        )}
      </div>
    </div>
  );
};

export default TopicTagBar;
