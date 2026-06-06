import { useEffect, useRef } from 'react';
import { useStore } from '@/store';

export function useGamepad() {
  const store = useStore();
  const pollRef = useRef<number | null>(null);

  useEffect(() => {
    const { session, gamepadMapping } = store;
    if (!session.quiz || session.finished) return;

    const poll = () => {
      const gamepads = navigator.getGamepads();
      for (const gp of gamepads) {
        if (!gp) continue;
        for (let i = 0; i < gp.buttons.length; i++) {
          if (!gp.buttons[i].pressed) continue;

          const m = gamepadMapping;
          const q = session.questions[session.currentIndex];
          if (!q) continue;

          // Pause
          if (i === m.pause) {
            store.setPaused(!session.paused);
            return;
          }

          if (session.paused) return;

          // Media
          if (i === m.media) { store.toggleMedia(); return; }
          // References
          if (i === m.references) { store.toggleRefs(); return; }
          // Back
          if (i === m.back) {
            if (session.mediaOpen) { store.closeMedia(); return; }
            if (session.refsOpen) { store.closeRefs(); return; }
            return;
          }
          // Score (toggle)
          // score button handled in QuizView via event

          // Navigation in overlays
          if (session.mediaOpen) {
            // D-pad left/right for variant navigation
            const left = gp.axes[0] < -0.5 || i === 14;
            const right = gp.axes[0] > 0.5 || i === 15;
            if (left && session.mediaVariantIndex > 0) {
              store.setMediaVariant(session.mediaVariantIndex - 1);
            } else if (right && session.mediaVariantIndex < q.nidVariants.length - 1) {
              store.setMediaVariant(session.mediaVariantIndex + 1);
            }
            return;
          }
          if (session.refsOpen) {
            const refs = session.quiz?.referenceImages ?? [];
            const left = gp.axes[0] < -0.5 || i === 14;
            const right = gp.axes[0] > 0.5 || i === 15;
            if (left && session.refIndex > 0) store.setRefIndex(session.refIndex - 1);
            else if (right && session.refIndex < refs.length - 1) store.setRefIndex(session.refIndex + 1);
            return;
          }

          const answered = session.answers[q.id] !== undefined;
          if (answered) {
            // Select / next
            if (i === m.select) {
              const isLast = session.currentIndex === session.questions.length - 1;
              if (isLast) {
                // finish — handled in QuizView
              } else {
                store.next();
              }
            }
            return;
          }

          // Essay: show answer
          if (q.questionType === 'ESSAY') {
            if (!session.showAnswer && i === m.select) {
              store.setShowAnswer(true);
              return;
            }
            if (session.showAnswer) {
              if (i === m.skipCorrect) { store.setAnswer(q.id, 'CORRECT'); return; }
              if (i === m.skipIncorrect) { store.setAnswer(q.id, 'INCORRECT'); return; }
            }
            return;
          }

          // MC / TF — map button index to option
          if (i === m.skipCorrect) {
            store.setAnswer(q.id, 'SKIP_CORRECT'); return;
          }
          if (i === m.skipIncorrect) {
            store.setAnswer(q.id, 'SKIP_INCORRECT'); return;
          }

          // D-pad / stick navigation for selecting options
          const optionCount = q.shuffledOptions.length;
          const axis1 = gp.axes[1]; // vertical
          if (axis1 > 0.5 && i === m.select) {
            // select currently highlighted — would need UI state for highlight
            // For now: A selects first option
            if (q.shuffledOptions[0]) store.setAnswer(q.id, q.shuffledOptions[0].label);
          }
        }
      }
    };

    pollRef.current = window.setInterval(poll, 100);
    return () => {
      if (pollRef.current !== null) window.clearInterval(pollRef.current);
    };
  }, [
    store.session.currentIndex,
    store.session.paused,
    store.session.mediaOpen,
    store.session.refsOpen,
    store.session.showAnswer,
    store.session.finished,
    store.gamepadMapping,
  ]);
}
