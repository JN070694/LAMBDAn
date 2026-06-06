import { useNavigate } from 'react-router-dom';
import { invoke } from '@tauri-apps/api/core';
import { save } from '@tauri-apps/plugin-dialog';
import { useStore } from '@/store';
import { formatTime } from '@/utils/quiz';

export default function QuizEndScreen() {
  const navigate = useNavigate();
  const { session, clearSession, history } = useStore();
  const { quiz, questions, answers } = session;

  if (!quiz) return null;

  // Find the history entry just saved
  const entry = history.find(h => h.quizId === quiz.id);
  if (!entry) return null;

  const pct = entry.percentage;

  const handleExport = async () => {
    const path = await save({
      defaultPath: `${quiz.title}_missed.tar.gz`,
      filters: [{ name: 'Quiz Pack', extensions: ['gz'] }],
    });
    if (path) {
      await invoke('export_missed', { entryId: entry.id, outputPath: path }).catch(console.error);
    }
  };

  const handleRetakeMissed = () => {
    const missed = entry.questionResults.filter(r => !r.correct).map(r => r.questionId);
    const missedQs = questions.filter(q => missed.includes(q.id));
    if (missedQs.length === 0) return;
    // Navigate to retake — ephemeral, no history save
    navigate(`/quiz/${quiz.id}/retake`, { state: { missedIds: missed } });
  };

  return (
    <div style={{ maxWidth: 560, margin: '40px auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
      <h1 style={{ fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 700 }}>Quiz Complete</h1>

      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ fontWeight: 600, fontSize: 16 }}>{quiz.title}</div>
        <div style={{ display: 'flex', gap: 32, fontFamily: 'var(--font-mono)', fontSize: 13 }}>
          <div>
            <div style={{ color: '#888', fontSize: 11, marginBottom: 2 }}>Score</div>
            <div style={{ fontSize: 28, fontWeight: 700 }}>{pct}%</div>
          </div>
          <div>
            <div style={{ color: '#888', fontSize: 11, marginBottom: 2 }}>Correct</div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{entry.score} / {entry.total}</div>
          </div>
          <div>
            <div style={{ color: '#888', fontSize: 11, marginBottom: 2 }}>Time</div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{formatTime(entry.timeSeconds)}</div>
          </div>
        </div>
      </div>

      {/* Missed questions */}
      {entry.questionResults.filter(r => !r.correct).length > 0 && (
        <div>
          <div className="section-label">Missed Questions ({entry.questionResults.filter(r => !r.correct).length})</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {entry.questionResults.filter(r => !r.correct).map(r => (
              <div key={r.questionId} className="card-muted" style={{ fontSize: 13 }}>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>{r.questionText}</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#888' }}>
                  Your answer: {r.userAnswer || '—'} · Correct: {r.correctAnswer}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="btn btn-primary"
          onClick={() => { clearSession(); navigate('/library'); }}>
          Back to Library
        </button>
        {entry.questionResults.some(r => !r.correct) && (
          <>
            <button className="btn btn-secondary" onClick={handleRetakeMissed}>
              Retake Missed
            </button>
            <button className="btn btn-secondary" onClick={handleExport}>
              Export Missed
            </button>
          </>
        )}
      </div>
    </div>
  );
}
