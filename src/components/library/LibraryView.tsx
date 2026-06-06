import { useState, useCallback, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { useStore } from '@/store';
import type { Folder, Quiz, ImportResult } from '@/types';
import Modal from '@/components/shared/Modal';

export default function LibraryView() {
  const { folderId } = useParams<{ folderId?: string }>();
  const { quizzes, setQuizzes, folders, setFolders, upsertFolder, removeFolder } = useStore();
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [renamingFolder, setRenamingFolder] = useState<Folder | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const navigate = useNavigate();

  const currentFolder = folderId ? folders.find(f => f.id === folderId) : null;

  const refreshAll = useCallback(async () => {
    const [allQuizzes, allFolders] = await Promise.all([
      invoke<Quiz[]>('get_all_quizzes'),
      invoke<Folder[]>('get_folders'),
    ]);
    setQuizzes(allQuizzes);
    setFolders(allFolders);
  }, [setQuizzes, setFolders]);

  useEffect(() => { refreshAll(); }, []);

  const handleImport = async () => {
    const path = await open({
      filters: [{ name: 'Quiz Pack', extensions: ['gz', 'csv'] }],
      multiple: false,
    });
    if (typeof path !== 'string') return;
    setImporting(true);
    setError(null);
    try {
      const result = await invoke<ImportResult>('import_pack', {
        path,
        folderId: folderId ?? null,
      });
      await refreshAll();
      if (result.folderWasCreated && result.folderId) {
        navigate(`/library/folder/${result.folderId}`);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setImporting(false);
    }
  };

  const handleDeleteQuiz = async (id: string) => {
    await invoke('delete_quiz', { quizId: id });
    await refreshAll();
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    const folder = await invoke<Folder>('create_folder', { name: newFolderName.trim() });
    upsertFolder(folder);
    setShowNewFolder(false);
    setNewFolderName('');
  };

  const handleRenameFolder = async () => {
    if (!renamingFolder || !renameValue.trim()) return;
    await invoke('rename_folder', { folderId: renamingFolder.id, name: renameValue.trim() });
    upsertFolder({ ...renamingFolder, name: renameValue.trim() });
    setRenamingFolder(null);
  };

  const handleDeleteFolder = async (folder: Folder) => {
    if (!confirm(`Delete folder "${folder.name}"? Quizzes will move to the root library.`)) return;
    await invoke('delete_folder', { folderId: folder.id });
    removeFolder(folder.id);
    await refreshAll();
  };

  const handleDropOnFolder = async (targetFolderId: string) => {
    if (!draggedId) return;
    await invoke('move_quiz_to_folder', { quizId: draggedId, folderId: targetFolderId });
    setDraggedId(null);
    await refreshAll();
  };

  const visibleQuizzes = folderId
    ? quizzes.filter(q => q.folderId === folderId)
    : quizzes.filter(q => !q.folderId);

  return (
    <div>
      {/* Action row */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 22 }}>
        {!folderId && (
          <button className="btn btn-secondary" onClick={() => setShowNewFolder(true)}>
            + New Folder
          </button>
        )}
        <button className="btn btn-primary" onClick={handleImport} disabled={importing}>
          {importing ? 'Importing…' : '+ Import'}
        </button>
      </div>

      {error && (
        <div style={{ border: '1.5px solid #000', borderRadius: 8, padding: '10px 14px',
          marginBottom: 16, fontFamily: 'var(--font-mono)', fontSize: 12, background: '#fafafa',
          whiteSpace: 'pre-wrap' }}>
          <strong>Import failed:</strong> {error}
        </div>
      )}

      {/* Folders (root only) */}
      {!folderId && folders.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div className="section-label">Folders</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {folders.map(folder => (
              <FolderCard
                key={folder.id}
                folder={folder}
                onOpen={() => navigate(`/library/folder/${folder.id}`)}
                onRename={() => { setRenamingFolder(folder); setRenameValue(folder.name); }}
                onDelete={() => handleDeleteFolder(folder)}
                onDrop={() => handleDropOnFolder(folder.id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Quizzes */}
      {visibleQuizzes.length === 0 ? (
        <div className="empty-state">
          <h2>{folderId ? 'Folder is empty' : 'No quizzes yet'}</h2>
          <p>{folderId ? 'Import a pack into this folder.' : 'Import a .tar.gz pack or standalone .csv to get started.'}</p>
          <button className="btn btn-primary" onClick={handleImport}>+ Import</button>
        </div>
      ) : (
        <>
          {!folderId && <div className="section-label">Unfoldered Quizzes</div>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {visibleQuizzes.map(quiz => (
              <QuizCard
                key={quiz.id}
                quiz={quiz}
                onTake={() => navigate(`/quiz/${quiz.id}`)}
                onHistory={() => navigate(`/history?quizId=${quiz.id}`)}
                onDelete={() => handleDeleteQuiz(quiz.id)}
                onDragStart={() => setDraggedId(quiz.id)}
                onDragEnd={() => setDraggedId(null)}
              />
            ))}
          </div>
        </>
      )}

      {/* New folder modal */}
      {showNewFolder && (
        <Modal title="New Folder" onClose={() => setShowNewFolder(false)}>
          <input
            autoFocus
            value={newFolderName}
            onChange={e => setNewFolderName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleCreateFolder()}
            placeholder="Folder name…"
            style={{ width: '100%', border: '1.5px solid #000', borderRadius: 6,
              padding: '8px 12px', fontSize: 14, marginBottom: 16, outline: 'none' }}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button className="btn btn-secondary" onClick={() => setShowNewFolder(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleCreateFolder} disabled={!newFolderName.trim()}>Create</button>
          </div>
        </Modal>
      )}

      {/* Rename folder modal */}
      {renamingFolder && (
        <Modal title="Rename Folder" onClose={() => setRenamingFolder(null)}>
          <input
            autoFocus
            value={renameValue}
            onChange={e => setRenameValue(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleRenameFolder()}
            style={{ width: '100%', border: '1.5px solid #000', borderRadius: 6,
              padding: '8px 12px', fontSize: 14, marginBottom: 16, outline: 'none' }}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button className="btn btn-secondary" onClick={() => setRenamingFolder(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleRenameFolder} disabled={!renameValue.trim()}>Save</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ── FolderCard ────────────────────────────────────────────────────────────────
function FolderCard({ folder, onOpen, onRename, onDelete, onDrop }: {
  folder: Folder;
  onOpen: () => void;
  onRename: () => void;
  onDelete: () => void;
  onDrop: () => void;
}) {
  const [dropTarget, setDropTarget] = useState(false);

  return (
    <div
      className="card"
      style={{ display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer',
        borderColor: dropTarget ? '#000' : undefined,
        boxShadow: dropTarget ? '0 0 0 2px #000' : 'none' }}
      onClick={onOpen}
      onDragOver={e => { e.preventDefault(); setDropTarget(true); }}
      onDragLeave={() => setDropTarget(false)}
      onDrop={e => { e.preventDefault(); setDropTarget(false); onDrop(); }}
    >
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <path d="M2 5.5A1.5 1.5 0 013.5 4h4.086a1.5 1.5 0 011.06.44l.915.914A1.5 1.5 0 0010.621 6H16.5A1.5 1.5 0 0118 7.5v7A1.5 1.5 0 0116.5 16h-13A1.5 1.5 0 012 14.5v-9z" fill="#000"/>
      </svg>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600, fontSize: 14 }}>{folder.name}</div>
        <div style={{ fontSize: 11, color: '#888', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
          {folder.quizCount} {folder.quizCount === 1 ? 'quiz' : 'quizzes'}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6 }} onClick={e => e.stopPropagation()}>
        <button className="btn btn-secondary btn-sm" onClick={onRename}>Rename</button>
        <button className="btn btn-secondary btn-sm" onClick={onDelete}>Delete</button>
      </div>
    </div>
  );
}

// ── QuizCard ──────────────────────────────────────────────────────────────────
function QuizCard({ quiz, onTake, onHistory, onDelete, onDragStart, onDragEnd }: {
  quiz: Quiz;
  onTake: () => void;
  onHistory: () => void;
  onDelete: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  const [dragging, setDragging] = useState(false);
  const date = new Date(quiz.importedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <div
      className="card draggable"
      draggable
      onDragStart={() => { setDragging(true); onDragStart(); }}
      onDragEnd={() => { setDragging(false); onDragEnd(); }}
      style={{ display: 'flex', alignItems: 'center', gap: 16, opacity: dragging ? 0.4 : 1 }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {quiz.title}
        </div>
        <div style={{ fontSize: 11, color: '#888', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
          {quiz.questionCount} questions · {date}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 7, flexShrink: 0 }}>
        <button className="btn btn-primary btn-sm" onClick={onTake}>Take Quiz</button>
        <button className="btn btn-secondary btn-sm" onClick={onHistory}>History</button>
        <button className="btn btn-secondary btn-sm" onClick={onDelete}>✕</button>
      </div>
    </div>
  );
}
