import React, { useEffect, useRef } from 'react';
import { useStoryStore } from '../store';

export const HelpSheet: React.FC = () => {
  const { isHelpOpen, setIsHelpOpen } = useStoryStore();
  const modalRef = useRef<HTMLDivElement>(null);

  // Esc key listener & focus trap
  useEffect(() => {
    if (!isHelpOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setIsHelpOpen(false);
        return;
      }

      if (e.key === 'Tab' && modalRef.current) {
        const focusables = modalRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusables.length === 0) return;

        const first = focusables[0];
        const last = focusables[focusables.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isHelpOpen, setIsHelpOpen]);

  if (!isHelpOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm select-none"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          setIsHelpOpen(false);
        }
      }}
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-sheet-title"
        className="w-full max-w-lg bg-gray-900 border border-gray-700/80 rounded-xl shadow-2xl p-6 text-gray-200 flex flex-col gap-5 max-h-[85vh] overflow-y-auto"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-800 pb-3">
          <div className="flex items-center gap-2">
            <span className="i-lucide-help-circle w-5 h-5 text-amber-400" />
            <h2 id="help-sheet-title" className="text-base font-bold text-white">
              Brainfly Quick Guide
            </h2>
          </div>
          <button
            type="button"
            onClick={() => setIsHelpOpen(false)}
            aria-label="Close help sheet"
            className="p-1.5 text-gray-400 hover:text-white rounded-lg hover:bg-gray-800 transition-colors cursor-pointer flex items-center justify-center"
            title="Close (Esc)"
          >
            <svg className="w-5 h-5 text-gray-400 hover:text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Keyboard Shortcuts */}
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-amber-400 mb-2.5 font-mono">
            Keyboard Shortcuts
          </h3>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="flex items-center justify-between p-2 rounded bg-gray-950/60 border border-gray-800">
              <span className="text-gray-300">Toggle Help</span>
              <kbd className="px-2 py-0.5 rounded bg-gray-800 text-amber-400 font-mono text-[11px] border border-gray-700">
                ?
              </kbd>
            </div>
            <div className="flex items-center justify-between p-2 rounded bg-gray-950/60 border border-gray-800">
              <span className="text-gray-300">Scrub Time-Slider</span>
              <div className="flex gap-1">
                <kbd className="px-1.5 py-0.5 rounded bg-gray-800 text-amber-400 font-mono text-[11px] border border-gray-700">
                  &larr;
                </kbd>
                <kbd className="px-1.5 py-0.5 rounded bg-gray-800 text-amber-400 font-mono text-[11px] border border-gray-700">
                  &rarr;
                </kbd>
              </div>
            </div>
            <div className="flex items-center justify-between p-2 rounded bg-gray-950/60 border border-gray-800">
              <span className="text-gray-300">Close modal / drawer</span>
              <kbd className="px-1.5 py-0.5 rounded bg-gray-800 text-amber-400 font-mono text-[11px] border border-gray-700">
                Esc
              </kbd>
            </div>
            <div className="flex items-center justify-between p-2 rounded bg-gray-950/60 border border-gray-800">
              <span className="text-gray-300">Send chat / apply</span>
              <kbd className="px-1.5 py-0.5 rounded bg-gray-800 text-amber-400 font-mono text-[11px] border border-gray-700">
                Enter
              </kbd>
            </div>
          </div>
        </div>

        {/* Core Concepts */}
        <div className="space-y-2.5 text-xs">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-amber-400 mb-2 font-mono">
            Core Concepts
          </h3>
          <div className="p-2.5 rounded bg-gray-950/60 border border-gray-800/80 space-y-1">
            <span className="font-semibold text-white">Forward-Only Causality</span>
            <p className="text-gray-400 text-[11px] leading-relaxed">
              Facts may only depend on facts from the same or earlier chapters. Cycles and backward time paradoxes are disallowed.
            </p>
          </div>
          <div className="p-2.5 rounded bg-gray-950/60 border border-gray-800/80 space-y-1">
            <span className="font-semibold text-white">Blast Radius Compiler</span>
            <p className="text-gray-400 text-[11px] leading-relaxed">
              Editing an established fact traverses downstream causal trees, flagging broken dialogue and contradiction paths in real time.
            </p>
          </div>
          <div className="p-2.5 rounded bg-gray-950/60 border border-gray-800/80 space-y-1">
            <span className="font-semibold text-white">Spoiler-Fence Memory</span>
            <p className="text-gray-400 text-[11px] leading-relaxed">
              Characters and knowledge graphs are fenced to Chapter &le; N. Characters refuse to answer or acknowledge future entities.
            </p>
          </div>
        </div>

        {/* Status & Legend */}
        <div className="text-[11px] font-mono border-t border-gray-800 pt-3 flex items-center justify-between text-gray-500">
          <span>Phase 1: Deterministic Engine</span>
          <button
            type="button"
            onClick={() => setIsHelpOpen(false)}
            className="btn-primary py-1 px-3 text-xs cursor-pointer"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
};
