import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { invoke } from '@tauri-apps/api/core';
import { useStore } from '@/store';
import type { Quiz, Question, QuestionResult } from '@/types';
import { prepareQuestions, formatTime } from '@/utils/quiz';
import { useGamepad } from '@/utils/useGamepad';
import QuestionCard from './QuestionCard';
import MediaOverlay from './MediaOverlay';
import RefsOverlay from './RefsOverlay';
import QuizEndScreen from './QuizEndScreen';
import { v4 as uuidv4 } from '@/utils/uuid';

export default function QuizView() {
  const { quizId } = useParams<{ quizId: string }>();
  const navigate = useNavigate();
  const store = useStore();
  const {
    session, startSession, setAnswer, next, finishSession,
    clearSession, settings, toggleMedia, toggleRefs, setPaused,
  } = store;
  const { quiz, questions, currentIndex, answers, finished, paused, mediaOpen, refsOpen } = session;

  const [loading, setLoading] = useState(true);
  const [elapsed, setElapsed] = useState(0);
  const [showScore, setShowScore] = useState(false);
  const savingRef = useRef(false);

  // Activate gamepad polling
  useGamepad();

  useEffect(() => {
    if (!quizId) return;
    (async () => {
      try {
        const [allQuizzes, allQs] = await Promise.all([
          invoke<Quiz[]>('get_all_quizzes'),
          invoke<Question[]>('get_questions', { quizId }),
        ]);
        const quizObj = allQuizzes.find(x => x.id === quizId);
        if (!quizObj) { navigate('/library'); return; }
        startSession(quizObj, prepareQuestions(allQs));
      } finally {
        setLoading(false);
      }
    })();
    return () => clearSession();
  }, [quizId]);

  // Timer
  useEffect(() => {
    if (!session.startTime || paused || finished) return;
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - (session.startTime ?? 0)) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [session.startTime, paused, finished]);

  const handleAnswer = useCallback((questionId: string, answer: string) => {
    setAnswer(questionId, answer);
  }, [setAnswer]);

  const handleFinish = useCallback(async () => {
    if (savingRef.current) return;
    savingRef.current = true;

    finishSession();

    const results: QuestionResult[] = questions.map(q => {
      const userAnswer = answers[q.id] ?? '';
      let correct = false;
      if (q.questionType === 'ESSAY') {
        correct = userAnswer === 'CORRECT';
      } else if (userAnswer === 'SKIP_CORRECT') {
        correct = true;
      } else if (userAnswer === 'SKIP_INCORRECT') {
        correct = false;
      } else {
        correct = userAnswer === q.remappedAnswer;
      }
      return {
        questionId: q.id,
        questionText: q.questionText,
        correct,
        userAnswer,
        correctAnswer: q.remappedAnswer,
      };
    });

    const score = results.filter(r => r.correct).length;
    const entry = {
      id: uuidv4(),
      quizId: quiz!.id,
      quizTitle: quiz!.title,
      date: new Date().toISOString(),
      score,
      total: questions.length,
      percentage: Math.round((score / questions.length) * 100),
      timeSeconds: elapsed,
      questionResults: results,
    };

    try {
      await invoke('save_history', { entry });
      store.addHistory(entry);
    } catch (e) {
      console.error('Failed to save history:', e);
    }
  }, [finishSession, questions, answers, quiz, elapsed]);

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: 'center', fontFamily: 'var(--font-mono)' }}>
        Loading…
      </div>
    );
  }

  if (!quiz) return null;
  if (finished) return <QuizEndScreen />;

  const currentQ = questions[currentIndex];
  const isLast = currentIndex === questions.length - 1;

  // Live score for "see score" button
  const answeredCount = Object.keys(answers).length;
  const correctCount = Object.entries(answers).filter(([qid, ans]) => {
    const q = questions.find(x => x.id === qid);
    if (!q) return false;
    if (q.questionType === 'ESSAY') return ans === 'CORRECT';
    if (ans === 'SKIP_CORRECT') return true;
    if (ans === 'SKIP_INCORRECT') return false;
    return ans === q.remappedAnswer;
  }).length;

  return (
    <div style={{ position: 'relative', minHeight: '100%' }}>

      {/* Pull tab bar */}
      <div className="pull-tab-bar" style={{ position: 'sticky', top: 0, zIndex: 10 }}>
        <button className="pull-tab" onClick={toggleMedia} aria-label="Open media">
          <span>◀</span>
          <span>MEDIA</span>
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '0 16px',
          fontFamily: 'var(--font-mono)', fontSize: 11, color: '#888' }}>
          <span>{formatTime(elapsed)}</span>
          <button
            onClick={() => setShowScore(v => !v)}
            style={{ background: 'none', border: '1px solid #ccc', borderRadius: 4,
              cursor: 'pointer', color: '#666', fontFamily: 'var(--font-mono)',
              fontSize: 11, padding: '2px 8px' }}
            aria-label="Toggle score display"
          >
            {showScore ? `${correctCount} / ${answeredCount}` : 'Score'}
          </button>
          <button
            onClick={() => setPaused(!paused)}
            style={{ background: 'none', border: '1px solid #000', borderRadius: 4,
              cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 11, padding: '2px 8px' }}
          >
            ■ Pause
          </button>
        </div>

        <button className="pull-tab" style={{ flexDirection: 'row-reverse' }} onClick={toggleRefs} aria-label="Open references">
          <span>REFS</span>
          <span>▶</span>
        </button>
      </div>

      {/* Question content */}
      <div style={{ padding: '24px 0' }}>
        {currentQ && (
          <QuestionCard
            question={currentQ}
            answer={answers[currentQ.id]}
            onAnswer={(ans) => handleAnswer(currentQ.id, ans)}
            onNext={next}
            onFinish={handleFinish}
            isLast={isLast}
            instantFeedback={settings.instantFeedback}
          />
        )}
      </div>

      {/* Overlay panels */}
      {mediaOpen && <MediaOverlay />}
      {refsOpen && <RefsOverlay />}

      {/* Pause screen */}
      {paused && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(255,255,255,0.97)',
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', gap: 16, zIndex: 300
        }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 700 }}>
            Paused
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: '#888' }}>
            {quiz.title} · {currentIndex + 1} / {questions.length}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button className="btn btn-primary" onClick={() => setPaused(false)}>
              Resume
            </button>
            <button className="btn btn-secondary" onClick={() => { clearSession(); navigate('/library'); }}>
              Quit
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
