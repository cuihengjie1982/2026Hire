import React, {useState, useEffect} from 'react';
import {Plus, Edit3, Trash2, Clock, Loader2} from 'lucide-react';
import {listNotes, createNote, updateNote, deleteNote, type TrainingNote} from '../../../api';

interface NotesTabProps {
  enrollmentId: string;
  candidateId: string;
  currentVideoTime: number;
  onSeek: (time: number) => void;
  previewMode?: boolean;
}

interface LocalNote {
  id: string;
  videoTimestamp: number;
  noteTitle: string;
  noteContent: string;
  createdAt: string;
}

const getStorageKey = (courseId: string) => `training-preview-notes-${courseId}`;

const loadLocalNotes = (courseId: string): LocalNote[] => {
  try {
    return JSON.parse(localStorage.getItem(getStorageKey(courseId)) ?? '[]');
  } catch { return []; }
};

const saveLocalNotes = (courseId: string, notes: LocalNote[]) => {
  localStorage.setItem(getStorageKey(courseId), JSON.stringify(notes));
};

const toTrainingNote = (n: LocalNote): TrainingNote => ({
  id: n.id,
  enrollmentId: '',
  candidateId: '',
  videoTimestamp: n.videoTimestamp,
  noteTitle: n.noteTitle,
  noteContent: n.noteContent,
  createdAt: n.createdAt,
  updatedAt: n.createdAt,
});

export const NotesTab: React.FC<NotesTabProps> = ({enrollmentId, candidateId, currentVideoTime, onSeek, previewMode}) => {
  const [notes, setNotes] = useState<TrainingNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [timestamp, setTimestamp] = useState(0);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadNotes();
  }, [enrollmentId]);

  const loadNotes = async () => {
    setLoading(true);
    try {
      if (previewMode) {
        const local = loadLocalNotes(enrollmentId);
        setNotes(local.map(toTrainingNote));
      } else {
        const result = await listNotes(enrollmentId);
        setNotes(result.items);
      }
    } catch (e) {
      console.error('Failed to load notes:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleAddNote = () => {
    setShowForm(true);
    setEditingId(null);
    setTitle('');
    setContent('');
    setTimestamp(Math.floor(currentVideoTime));
  };

  const handleEdit = (note: TrainingNote) => {
    setShowForm(true);
    setEditingId(note.id);
    setTitle(note.noteTitle);
    setContent(note.noteContent ?? '');
    setTimestamp(note.videoTimestamp);
  };

  const handleSave = async () => {
    if (!title.trim()) return;
    setSaving(true);
    try {
      if (previewMode) {
        const local = loadLocalNotes(enrollmentId);
        if (editingId) {
          const idx = local.findIndex(n => n.id === editingId);
          if (idx >= 0) {
            local[idx] = {...local[idx], noteTitle: title, noteContent: content, videoTimestamp: timestamp};
          }
        } else {
          local.push({
            id: Date.now().toString(),
            videoTimestamp: timestamp,
            noteTitle: title,
            noteContent: content,
            createdAt: new Date().toISOString(),
          });
        }
        saveLocalNotes(enrollmentId, local);
        setNotes(local.map(toTrainingNote));
        setShowForm(false);
      } else {
        if (editingId) {
          await updateNote(editingId, {noteTitle: title, noteContent: content, videoTimestamp: timestamp});
        } else {
          await createNote({enrollmentId, candidateId, videoTimestamp: timestamp, noteTitle: title, noteContent: content});
        }
        await loadNotes();
        setShowForm(false);
      }
    } catch (e) {
      console.error('Failed to save note:', e);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定删除这条笔记？')) return;
    try {
      if (previewMode) {
        const local = loadLocalNotes(enrollmentId).filter(n => n.id !== id);
        saveLocalNotes(enrollmentId, local);
        setNotes(local.map(toTrainingNote));
      } else {
        await deleteNote(id);
        setNotes(prev => prev.filter(n => n.id !== id));
      }
    } catch (e) {
      console.error('Failed to delete note:', e);
    }
  };

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border-subtle flex items-center justify-between">
        <span className="text-sm text-fg-muted">{notes.length} 条笔记</span>
        <button
          onClick={handleAddNote}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-500 text-white rounded-lg text-xs hover:bg-indigo-600 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          添加笔记
        </button>
      </div>

      {/* Note form */}
      {showForm && (
        <div className="p-3 border-b border-border-subtle bg-indigo-50/50 space-y-2">
          <div className="flex items-center gap-2">
            <Clock className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
            <input
              type="text"
              value={formatTime(timestamp)}
              readOnly
              className="text-xs font-mono bg-surface border border-indigo-200 rounded px-2 py-1 w-16 text-center"
            />
            <span className="text-xs text-fg-faint">当前视频时间</span>
          </div>
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="笔记标题"
            className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <textarea
            value={content}
            onChange={e => setContent(e.target.value)}
            placeholder="记录学习心得...（可选）"
            rows={3}
            className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
          />
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowForm(false)} className="px-3 py-1.5 text-fg-muted text-sm hover:bg-surface-muted rounded-lg transition-colors">取消</button>
            <button onClick={handleSave} disabled={!title.trim() || saving} className="px-3 py-1.5 bg-indigo-500 text-white rounded-lg text-sm hover:bg-indigo-600 disabled:opacity-50 flex items-center gap-1 transition-colors">
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              保存
            </button>
          </div>
        </div>
      )}

      {/* Notes list */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {loading && (
          <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-fg-faint" /></div>
        )}

        {!loading && notes.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center space-y-2">
            <div className="w-12 h-12 rounded-2xl bg-surface-muted flex items-center justify-center">
              <Edit3 className="w-5 h-5 text-fg-faint" />
            </div>
            <p className="text-sm text-fg-muted">还没有笔记</p>
            <p className="text-xs text-fg-faint">点击上方"添加笔记"记录学习心得</p>
          </div>
        )}

        {notes.map(note => (
          <div key={note.id} className="bg-surface rounded-xl border border-border p-3 hover:shadow-sm transition-shadow group">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-1">
                  <button
                    onClick={() => onSeek(note.videoTimestamp)}
                    className="flex items-center gap-1 text-xs font-mono text-indigo-500 hover:text-indigo-700 hover:underline"
                  >
                    <Clock className="w-3 h-3" />
                    {formatTime(note.videoTimestamp)}
                  </button>
                </div>
                <p className="font-medium text-fg text-sm truncate">{note.noteTitle}</p>
                {note.noteContent && (
                  <p className="text-xs text-fg-muted mt-1 line-clamp-2">{note.noteContent}</p>
                )}
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={() => handleEdit(note)} className="p-1.5 text-fg-faint hover:text-indigo-500 hover:bg-indigo-50 rounded-lg transition-colors">
                  <Edit3 className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => handleDelete(note.id)} className="p-1.5 text-fg-faint hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default NotesTab;
