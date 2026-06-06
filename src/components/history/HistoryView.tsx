import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { invoke } from '@tauri-apps/api/core';
import { save } from '@tauri-apps/plugin-dialog';
import { useStore } from '@/store';
import type { HistoryEntry } from '@/types';
import { formatTime } from '@/utils/quiz';

export default function HistoryView() {
  const { history, setHistory } = useStore();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const filterQuizId = searchParams.get('quizId');

  useEffect(() => {
    invoke<HistoryEntry[]>('get_history', { quizId: filterQuizId }).then(setHistory);
  }, [filterQuizId]);

  const handleExport = async (entryId: string, title: string) => {
    const path = await save({
      defaultPath: `${title}_missed.tar.gz`,
      filters: [{ name: 'Quiz Pack', extensions: ['gz'] }],
    });
    if (path) {
      await invoke('export_missed', { entryId, outputPath: path }).catch(console.error);
    }
  };

  const entries = filterQuizId ? history.filter(h => h.quizId === filterQuizId) : history;

  return (
    <div>
      {entries.length === 0 ? (
        <div className="empty-state">
          <h2>No history yet</h2>
          <p>Complete a quiz to see your results here.</p>
          <button className="btn btn-primary" onClick={() => navigate('/library')}>Go to Library</button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 11, color: '#888', fontFamily: 'var(--font-mono)', textAlign: 'right', marginBottom: 4 }}>
            Showing last 5 per quiz · most recent first
          </div>
          {entries.map(entry => (
            <HistoryCard
              key={entry.id}
              entry={entry}
              onRetake={() => navigate(`/quiz/${entry.quizId}/retake`, {
                state: { missedIds: entry.questionResults.filter(r => !r.correct).map(r => r.questionId) }
              })}
              onExport={() => handleExport(entry.id, entry.quizTitle)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function HistoryCard({ entry, onRetake, onExport }: {
  entry: HistoryEntry;
  onRetake: () => void;
  onExport: () => void;
}) {
  const missed = entry.questionResults.filter(r => !r.correct).length;
  const date = new Date(entry.date).toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
  });

  return (
    <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
      <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>{entry.quizTitle}</div>
          <div style={{ fontSize: 11, color: '#888', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
            {date} · {entry.total} questions
          </div>
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 22, fontWeight: 700 }}>
          {entry.percentage}%
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {missed > 0 && (
            <>
              <button className="btn btn-primary btn-sm" onClick={onRetake}>Retake Missed</button>
              <button className="btn btn-secondary btn-sm" onClick={onExport}>Export</button>
            </>
          )}
        </div>
      </div>
      <div style={{ background: '#f9f9f9', borderTop: '1px solid #e0e0e0',
        padding: '8px 16px', display: 'flex', gap: 24 }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#444' }}>
          ✓ {entry.score} correct
        </span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#444' }}>
          ✗ {missed} missed
        </span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#888' }}>
          {formatTime(entry.timeSeconds)}
        </span>
      </div>
    </div>
  );
}
