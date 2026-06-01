import React, {useState, useEffect} from 'react';
import {Edit3, Trash2, Clock} from 'lucide-react';
import {listNotes, createNote, updateNote, deleteNote, type TrainingNote} from '../../../api';

interface TranscriptTabProps {
  sections: {sectionTitle: string; contentType: string; text?: string; contentUrl?: string}[];
  onSeek: (time: number) => void;
  currentVideoTime: number;
}

interface ParsedEntry {
  timestamp: number;
  text: string;
}

function parseTranscript(text: string): ParsedEntry[] {
  // Format: "00:05:30 - 内容" or "00:05:30 内容"
  const lines = text.split('\n').filter(l => l.trim());
  const entries: ParsedEntry[] = [];

  for (const line of lines) {
    const match = line.match(/^(\d{1,2}:\d{2}(?::\d{2})?)\s*[-–：:]\s*(.+)/);
    if (match) {
      const timeParts = match[1].split(':').map(Number);
      let seconds = 0;
      if (timeParts.length === 3) {
        seconds = timeParts[0] * 3600 + timeParts[1] * 60 + timeParts[2];
      } else if (timeParts.length === 2) {
        seconds = timeParts[0] * 60 + timeParts[1];
      }
      entries.push({timestamp: seconds, text: match[2]});
    } else if (line.trim()) {
      // No timestamp - use last known or 0
      const last = entries[entries.length - 1];
      entries.push({timestamp: last ? last.timestamp : 0, text: line.trim()});
    }
  }
  return entries;
}

export const TranscriptTab: React.FC<TranscriptTabProps> = ({sections, onSeek, currentVideoTime}) => {
  const [activeSection, setActiveSection] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);

  // Build full transcript from all text sections
  const fullTranscript = sections
    .filter(s => s.contentType === 'text' && s.text)
    .map(s => s.text!)
    .join('\n');

  const entries = parseTranscript(fullTranscript);

  // Find active entry based on current video time
  const activeEntryIdx = () => {
    for (let i = entries.length - 1; i >= 0; i--) {
      if (currentTime >= entries[i].timestamp) return i;
    }
    return 0;
  };

  const handleTimeClick = (seconds: number) => {
    onSeek(seconds);
  };

  const formatTimestamp = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = Math.floor(s % 60);
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex flex-col h-full">
      {/* Section selector */}
      {sections.length > 1 && (
        <div className="px-4 py-2 border-b border-gray-100 flex gap-2 overflow-x-auto">
          {sections.filter(s => s.contentType === 'text').map((s, i) => (
            <button key={i} onClick={() => setActiveSection(i)}
              className={`text-xs px-3 py-1 rounded-full whitespace-nowrap transition-colors ${
                activeSection === i ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}>
              {s.sectionTitle}
            </button>
          ))}
        </div>
      )}

      {/* Transcript entries */}
      <div className="flex-1 overflow-y-auto p-4 space-y-1">
        {entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center space-y-2">
            <p className="text-gray-400 text-sm">暂无文字稿</p>
            <p className="text-xs text-gray-300">请在课程内容中添加文字章节</p>
          </div>
        ) : (
          entries.map((entry, idx) => {
            const isActive = idx === activeEntryIdx() && idx >= 0;
            return (
              <button
                key={idx}
                onClick={() => handleTimeClick(entry.timestamp)}
                className={`w-full text-left px-3 py-2 rounded-lg transition-colors group ${
                  isActive ? 'bg-indigo-50 border border-indigo-200' : 'hover:bg-gray-50'
                }`}
              >
                <div className="flex items-start gap-2">
                  <span className={`shrink-0 text-xs font-mono font-medium px-1.5 py-0.5 rounded ${
                    isActive ? 'bg-indigo-500 text-white' : 'bg-gray-100 text-gray-500 group-hover:bg-indigo-100 group-hover:text-indigo-600'
                  }`}>
                    {formatTimestamp(entry.timestamp)}
                  </span>
                  <span className={`text-sm ${isActive ? 'text-indigo-800 font-medium' : 'text-gray-700'}`}>
                    {entry.text}
                  </span>
                </div>
              </button>
            );
          })
        )}
      </div>

      {/* Hidden time update - parent will call updateCurrentTime */}
      <TimeUpdater onTimeUpdate={setCurrentTime} />
    </div>
  );
};

// Hidden component to sync video time from parent
const TimeUpdater = ({onTimeUpdate}: {onTimeUpdate: (t: number) => void}) => {
  // This is a placeholder - the parent passes a callback
  // In practice the parent passes currentTime directly via prop
  return null;
};

export default TranscriptTab;