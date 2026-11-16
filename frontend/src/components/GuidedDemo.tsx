import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { scrollToLine } from './utils';
import { useStoryStore } from '../store';

export const GuidedDemo: React.FC = () => {
  const {
    isDemoActive,
    demoStep,
    setDemoStep,
    exitDemo,
    novel,
    editingFact,
    navigateToChapter,
    setEditingFact,
    previewEdit,
    applyEdit,
    cancelPreview,
    setHighlightedLineId,
    setExpandedWhyLineId,
    openChat,
    closeChat,
    sendChatMessage,
    resetAll,
  } = useStoryStore();

  const animationTimersRef = useRef<number[]>([]);
  const lastExecutedRef = useRef<{ active: boolean; step: number | null }>({
    active: false,
    step: null,
  });

  const stepData = useMemo(() => {
    return [
      {
        step: 1,
        title: 'Meet the story',
        caption:
          'Welcome to Brainfly: find all references for stories. In Aesop’s fable "The Rabbit and the Turtle", Rabbit challenges steady Turtle to a race across Whispering Woods. Every race event, forest clue, and line of dialogue is bound to an exact causal fact.',
      },
      {
        step: 2,
        title: 'The memory graph',
        caption:
          'The time-indexed knowledge graph builds dynamically chapter by chapter. Watch Rabbit, Turtle, Judge Fox, the apple tree, and the victory summit appear as the race unfolds.',
      },
      {
        step: 3,
        title: 'Change the past',
        caption:
          'What if Turtle found the sweet apples instead of Rabbit? In Chapter 2, we stage an edit on fact f3 from Rabbit to Turtle. Notice the live impact calculation before committing.',
      },
      {
        step: 4,
        title: 'Blast radius',
        caption:
          'The compiler instantly detects contradictions! In Chapter 4, Turtle is written claiming the trophy after overtaking a sleeping Rabbit—which breaks if Rabbit’s path changed. The "Why?" chain traces the exact causal paradox.',
      },
      {
        step: 5,
        title: 'Commit and inspect',
        caption:
          'The edit is committed. The Contradictions panel reveals all lines across chapters 3, 4, and 5 that depended on the original race timeline.',
      },
      {
        step: 6,
        title: 'Spoiler-safe chat',
        caption:
          'Turtle claims the Golden Trophy in Chapter 4. But when queried under a Chapter 2 spoiler fence, he refuses to acknowledge the trophy because the race is still underway!',
      },
      {
        step: 7,
        title: "What's next",
        caption:
          'Phase 1 demonstrates deterministic causality. Coming next on the Brainfly roadmap:',
      },
    ];
  }, []);

  const clearAnimationTimers = useCallback(() => {
    for (const t of animationTimersRef.current) {
      window.clearTimeout(t);
    }
    animationTimersRef.current = [];
  }, []);

  // Execute UI actions for a given step
  const executeStep = useCallback(
    async (step: number) => {
      clearAnimationTimers();
      const patchSubject = 'tortoise';

      switch (step) {
        case 1: {
          // 1) "Meet the story": reset state, navigate to chapter 1.
          closeChat();
          setEditingFact(null);
          cancelPreview();
          setHighlightedLineId(null);
          setExpandedWhyLineId(null);
          await resetAll();
          await navigateToChapter(1);
          break;
        }

        case 2: {
          // 2) "The memory graph": a quick slider sweep from 1 to 5, then rest at 5.
          closeChat();
          setEditingFact(null);
          cancelPreview();
          setHighlightedLineId(null);
          setExpandedWhyLineId(null);
          await navigateToChapter(1);

          // Sweep 1 -> 2 -> 3 -> 4 -> 5 smoothly
          const steps = [2, 3, 4, 5];
          steps.forEach((ch, idx) => {
            const timer = window.setTimeout(async () => {
              await navigateToChapter(ch);
            }, (idx + 1) * 700);
            animationTimersRef.current.push(timer);
          });
          break;
        }

        case 3: {
          // 3) "Change the past": navigate to chapter 2, open FactEditor on f3, pre-fill subject
          closeChat();
          setHighlightedLineId(null);
          setExpandedWhyLineId(null);
          await navigateToChapter(2);

          const f3 = novel?.facts.find((f) => f.id === 'f3');
          if (f3) {
            setEditingFact(f3, { subject: patchSubject });
          }
          break;
        }

        case 4: {
          // 4) "Blast radius": preview impact appears; highlight & scroll to first flagged ch 4 line and expand Why.
          closeChat();
          setEditingFact(null);
          await previewEdit('f3', { subject: patchSubject });
          await navigateToChapter(4);

          // Find first flagged line in chapter 4
          const ch4 = novel?.chapters.find((c) => c.number === 4);
          const flaggedLine = ch4?.lines.find((l) =>
            l.requires.some((r) => r === 'f3' || r === 'f7' || r === 'f8')
          );
          if (flaggedLine) {
            setHighlightedLineId(flaggedLine.id);
            setExpandedWhyLineId(flaggedLine.id);
            scrollToLine(flaggedLine.id);
          }
          break;
        }

        case 5: {
          // 5) "Commit and inspect": apply the change; navigate to chapter 1.
          closeChat();
          setEditingFact(null);
          setExpandedWhyLineId(null);
          await applyEdit('f3', { subject: patchSubject });
          await navigateToChapter(1);
          break;
        }

        case 6: {
          // 6) "Spoiler-safe chat": open chat at fence chapter 2, auto-ask future fact, show refusal.
          setEditingFact(null);
          setHighlightedLineId(null);
          setExpandedWhyLineId(null);
          openChat('tortoise');
          try {
            await sendChatMessage('tortoise', 2, 'Did you win the golden trophy?');
          } catch {
            // Handled inline in chat
          }
          break;
        }

        case 7: {
          // 7) "What's next": closing card listing roadmap as plain text.
          closeChat();
          setEditingFact(null);
          setHighlightedLineId(null);
          setExpandedWhyLineId(null);
          break;
        }
      }
    },
    [
      clearAnimationTimers,
      closeChat,
      setEditingFact,
      cancelPreview,
      setHighlightedLineId,
      setExpandedWhyLineId,
      resetAll,
      navigateToChapter,
      novel,
      previewEdit,
      applyEdit,
      openChat,
      sendChatMessage,
    ]
  );

  // Run action whenever demoStep changes or isDemoActive toggles
  useEffect(() => {
    if (isDemoActive) {
      if (!lastExecutedRef.current.active || lastExecutedRef.current.step !== demoStep) {
        lastExecutedRef.current = { active: true, step: demoStep };
        executeStep(demoStep);
      }
    } else {
      lastExecutedRef.current = { active: false, step: null };
      clearAnimationTimers();
    }
  }, [isDemoActive, demoStep, executeStep, clearAnimationTimers]);

  // Clean up timers on unmount
  useEffect(() => {
    return () => clearAnimationTimers();
  }, [clearAnimationTimers]);

  if (!isDemoActive) return null;

  const currentStep = stepData.find((s) => s.step === demoStep) ?? stepData[0];
  const isFirstStep = demoStep === 1;
  const isLastStep = demoStep === stepData.length;

  return (
    <div
      role="region"
      aria-label="Interactive guided demo coach panel"
      className={`fixed bottom-20 z-40 w-96 max-w-[calc(100vw-3rem)] bg-gray-900/95 border border-amber-500/50 rounded-xl shadow-2xl p-4.5 backdrop-blur-md flex flex-col gap-3 animate-fade-in text-gray-100 transition-all duration-300 ${
        editingFact ? 'right-6 lg:right-[480px]' : 'right-6'
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-800 pb-2.5">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse" />
          <span className="text-xs font-bold text-amber-300 uppercase tracking-wider font-mono">
            Guided Demo &middot; Step {demoStep} of {stepData.length}
          </span>
        </div>

        <button
          type="button"
          onClick={() => exitDemo()}
          className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-gray-800 transition-colors cursor-pointer flex items-center justify-center"
          title="Exit demo (restores clean state)"
          aria-label="Exit demo"
        >
          <svg className="w-4 h-4 text-gray-400 hover:text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Progress Bar */}
      <div className="h-1 rounded-full bg-gray-800 overflow-hidden" aria-hidden="true">
        <div
          className="h-full rounded-full bg-gradient-to-r from-amber-500 to-yellow-300 transition-[width] duration-300 ease-out"
          style={{ width: `${(demoStep / stepData.length) * 100}%` }}
        />
      </div>

      {/* Content */}
      <div className="space-y-1.5 animate-demo-content" aria-live="polite">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <span>{currentStep.title}</span>
        </h3>
        <p className="text-xs text-gray-300 leading-relaxed">{currentStep.caption}</p>

        {/* Roadmap details for Step 7 */}
        {demoStep === 7 && (
          <div className="mt-3 p-3 bg-gray-950/70 border border-gray-800 rounded-lg space-y-2 text-[11px] text-gray-300">
            <div className="font-semibold text-amber-400 font-mono uppercase tracking-wider text-[10px]">
              Phase 2 AI Integration Seams:
            </div>
            <ul className="space-y-1.5 list-disc pl-4 text-gray-300">
              <li>
                <strong className="text-white">Adaption AI</strong>: Extraction of novel entities,
                predicates, and character personas from prose.
              </li>
              <li>
                <strong className="text-white">SubQ AI</strong>: Natural-language causal chain
                reasoning and counterfactual explanations.
              </li>
              <li>
                <strong className="text-white">Sarvam AI</strong>: Multilingual Indian-language
                table reads (TTS) and live director notes (STT).
              </li>
              <li>
                <strong className="text-white">Neo4j AuraDB</strong>: Persistent graph database
                backend powering Cypher-based causal DAG queries.
              </li>
            </ul>
          </div>
        )}
      </div>

      {/* Navigation Controls */}
      <div className="flex items-center justify-between pt-2 border-t border-gray-800/80">
        <button
          type="button"
          onClick={() => exitDemo()}
          className="text-xs text-gray-400 hover:text-gray-200 transition-colors cursor-pointer"
        >
          Exit
        </button>

        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={isFirstStep}
            onClick={() => setDemoStep(Math.max(1, demoStep - 1))}
            className="px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-700 bg-gray-800 text-gray-300 hover:text-white hover:bg-gray-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            Back
          </button>
          {isLastStep ? (
            <button
              type="button"
              onClick={() => exitDemo()}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-gray-950 transition-colors cursor-pointer"
            >
              Done
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setDemoStep(Math.min(stepData.length, demoStep + 1))}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-gray-950 transition-colors cursor-pointer flex items-center gap-1"
            >
              <span>Next</span>
              <span className="i-lucide-chevron-right w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
