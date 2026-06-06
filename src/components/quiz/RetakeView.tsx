import { useEffect, useState } from 'react';
import { useNavigate, useLocation, useParams } from 'react-router-dom';
import { invoke } from '@tauri-apps/api/core';
import { useStore } from '@/store';
import type { Question, Quiz } from '@/types';
import { prepareQuestions } from '@/utils/quiz';
import QuestionCard from './QuestionCard';
import MediaOverlay from './MediaOverlay';
import RefsOverlay from './RefsOverlay';

export default function RetakeView() {
  const { quizId } = useParams<{ quizId: string }>();
  const { state } = useLocation() as { state: { missedIds: string[] } };
  const navigate = useNavigate();
  const { startSession, setAnswer, next, clearSession, session, toggleMedia, toggleRefs, settings } = useStore();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!quizId || !state?.missedIds) { navigate('/library'); return; }
    (async () => {
      try {
        const [allQuizzes, allQs] = await Promise.all([
          invoke<Quiz[]>('get_all_quizzes'),
          invoke<Question[]>('get_questions', { quizId }),
        ]);
        const quiz = allQuizzes.find(q => q.id === quizId);
        if (!quiz) { navigate('/library'); return; }
        const missed = allQs.filter(q => state.missedIds.includes(q.id));
        startSession(quiz, prepareQuestions(missed));
      } finally { setLoading(false); }
    })();
    return () => clearSession();
  }, [quizId]);

  if (loading) return <div style={{ padding: 40, textAlign: 'center' }}>Loading…</div>;

  const { questions, currentIndex, answers, mediaOpen, refsOpen } = session;
  const currentQ = questions[currentIndex];
  const isLast = currentIndex === questions.length - 1;

  const handleFinish = () => {
    clearSession();
    navigate('/library');
  };

  return (
    <div>
      <div className="pull-tab-bar">
        <button className="pull-tab" onClick={toggleMedia}>◀ MEDIA</button>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#888', padding: '0 16px' }}>
          RETAKE — not saved to history
        </span>
        <button className="pull-tab" onClick={toggleRefs}>REFS ▶</button>
      </div>
      <div style={{ padding: '24px 0' }}>
        {currentQ && (
          <QuestionCard
            question={currentQ}
            answer={answers[currentQ.id]}
            onAnswer={(ans) => setAnswer(currentQ.id, ans)}
            onNext={next}
            onFinish={handleFinish}
            isLast={isLast}
            instantFeedback={settings.instantFeedback}
          />
        )}
      </div>
      {mediaOpen && <MediaOverlay />}
      {refsOpen && <RefsOverlay />}
    </div>
  );
}
