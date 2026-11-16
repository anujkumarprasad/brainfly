import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { Fact, FactPatch, FactStatus, Novel, Predicate } from '@bl/shared';
import { useStoryStore } from '../store';

interface FactEditorProps {
  fact: Fact;
  novel: Novel;
  onClose: () => void;
  initialPatch?: FactPatch | null;
}

const PREDICATES: Predicate[] = ['HAS', 'KNOWS', 'LOCATED_AT', 'OPENED'];

export function FactEditor({ fact, novel, onClose, initialPatch }: FactEditorProps) {
  const { previewReport, previewEdit, cancelPreview, applyEdit, loading } = useStoryStore();

  const [subject, setSubject] = useState(initialPatch?.subject ?? fact.subject);
  const [predicate, setPredicate] = useState<Predicate>(initialPatch?.predicate ?? fact.predicate);
  const [object, setObject] = useState(initialPatch?.object ?? fact.object);
  const [status, setStatus] = useState<string>(initialPatch?.status ?? fact.status ?? 'none');

  useEffect(() => {
    if (initialPatch) {
      if (initialPatch.subject) setSubject(initialPatch.subject);
      if (initialPatch.predicate) setPredicate(initialPatch.predicate);
      if (initialPatch.object) setObject(initialPatch.object);
      if (initialPatch.status !== undefined) setStatus(initialPatch.status);
    }
  }, [initialPatch]);

  const containerRef = useRef<HTMLDivElement>(null);
  const firstInputRef = useRef<HTMLSelectElement>(null);

  // Check if form differs from original fact
  const isChanged = useMemo(() => {
    const origStatus = fact.status ?? 'none';
    return (
      subject !== fact.subject ||
      predicate !== fact.predicate ||
      object !== fact.object ||
      status !== origStatus
    );
  }, [subject, predicate, object, status, fact]);

  // Debounced 300ms preview
  useEffect(() => {
    if (!isChanged) {
      return;
    }

    const timer = setTimeout(() => {
      const patch: FactPatch = {
        subject,
        predicate,
        object,
        status: status === 'none' ? undefined : (status as FactStatus),
      };
      previewEdit(fact.id, patch);
    }, 300);

    return () => clearTimeout(timer);
  }, [subject, predicate, object, status, isChanged, fact.id, previewEdit]);

  // Focus trap & Escape key listener
  useEffect(() => {
    firstInputRef.current?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        cancelPreview();
        onClose();
        return;
      }

      if (e.key === 'Tab' && containerRef.current) {
        const focusables = containerRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusables.length === 0) return;

        const first = focusables[0];
        const last = focusables[focusables.length - 1];

        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [cancelPreview, onClose]);

  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleApply = async () => {
    if (isSubmitting || loading || applyDisabled) return;
    setIsSubmitting(true);
    try {
      const patch: FactPatch = {
        subject,
        predicate,
        object,
        status: status === 'none' ? undefined : (status as FactStatus),
      };
      await applyEdit(fact.id, patch);
      onClose();
      const state = useStoryStore.getState();
      if (state.isDemoActive && state.demoStep === 3) {
        state.setDemoStep(4);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    cancelPreview();
    onClose();
  };

  const applyDisabled =
    !isChanged || (previewReport !== null && previewReport.noChange) || loading || isSubmitting;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm transition-opacity"
      aria-modal="true"
      role="dialog"
      aria-labelledby="fact-editor-title"
    >
      <div
        ref={containerRef}
        className="w-full max-w-md bg-gray-900 border-l border-gray-800 h-full flex flex-col shadow-2xl p-6 text-gray-100 overflow-y-auto animate-in slide-in-from-right duration-200"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-gray-800">
          <div>
            <span className="text-[10px] font-mono uppercase tracking-widest text-amber-400 block mb-0.5">
              Fact Editor (Chapter {fact.chapter})
            </span>
            <h2 id="fact-editor-title" className="text-lg font-bold text-white">
              Edit Fact {fact.id}
            </h2>
          </div>
          <button
            type="button"
            onClick={handleCancel}
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors cursor-pointer flex items-center justify-center"
            title="Close editor (Esc)"
            aria-label="Close editor"
          >
            <svg className="w-5 h-5 text-gray-400 hover:text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Form Fields */}
        <form
          className="space-y-4 my-6 flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            if (!applyDisabled) handleApply();
          }}
        >
          {/* Subject */}
          <div>
            <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
              Subject Entity
            </label>
            <select
              ref={firstInputRef}
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 cursor-pointer"
            >
              {novel.entities.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name} ({e.id}) [{e.type}]
                </option>
              ))}
            </select>
          </div>

          {/* Predicate */}
          <div>
            <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
              Predicate
            </label>
            <select
              value={predicate}
              onChange={(e) => setPredicate(e.target.value as Predicate)}
              className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 cursor-pointer font-mono"
            >
              {PREDICATES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>

          {/* Object */}
          <div>
            <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
              Object Entity
            </label>
            <select
              value={object}
              onChange={(e) => setObject(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 cursor-pointer"
            >
              {novel.entities.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name} ({e.id}) [{e.type}]
                </option>
              ))}
            </select>
          </div>

          {/* Status */}
          <div>
            <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
              Status
            </label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 cursor-pointer"
            >
              <option value="none">none (default)</option>
              <option value="revealed">revealed</option>
              <option value="hidden">hidden</option>
            </select>
          </div>

          {/* Live Preview Impact Indicator */}
          <div className="pt-2">
            <span className="block text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-1.5">
              Live Impact Preview
            </span>
            <div className="p-3 rounded bg-gray-950 border border-gray-800 text-xs leading-relaxed">
              {!isChanged ? (
                <span className="text-gray-500 italic flex items-center gap-1.5">
                  <span className="i-lucide-check-circle w-4 h-4 text-gray-600" />
                  No changes made yet
                </span>
              ) : previewReport === null ? (
                <span className="text-amber-400 flex items-center gap-1.5 animate-pulse">
                  <span className="i-lucide-loader-2 w-4 h-4 animate-spin" />
                  Computing blast radius...
                </span>
              ) : previewReport.noChange ? (
                <span className="text-emerald-400 flex items-center gap-1.5">
                  <span className="i-lucide-check-circle w-4 h-4 text-emerald-400" />
                  No contradictions found. Change is isolated.
                </span>
              ) : (
                <div className="space-y-1 text-red-300">
                  <div className="font-semibold flex items-center gap-1.5 text-red-400">
                    <span className="i-lucide-alert-triangle w-4 h-4 text-red-400 shrink-0" />
                    <span>
                      {previewReport.impactedLines.length} line
                      {previewReport.impactedLines.length === 1 ? '' : 's'} in{' '}
                      {previewReport.summary.chaptersAffected.length} chapter
                      {previewReport.summary.chaptersAffected.length === 1 ? '' : 's'} would contradict
                      this edit.
                    </span>
                  </div>
                  <div className="text-[11px] text-gray-400">
                    Affected Chapters:{' '}
                    <span className="font-mono text-amber-300">
                      {previewReport.summary.chaptersAffected.join(', ')}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </form>

        {/* Action Buttons */}
        <div className="pt-4 border-t border-gray-800 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={handleCancel}
            className="px-4 py-2 rounded text-sm text-gray-300 hover:text-white hover:bg-gray-800 transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleApply}
            disabled={applyDisabled}
            className={`px-4 py-2 rounded text-sm font-semibold transition-all flex items-center gap-2 cursor-pointer ${
              applyDisabled
                ? 'bg-gray-800 text-gray-500 cursor-not-allowed border border-gray-700/50'
                : 'bg-amber-500 hover:bg-amber-400 text-gray-950 shadow-md hover:shadow-amber-500/20'
            }`}
          >
            {loading ? (
              <>
                <span className="i-lucide-loader-2 w-4 h-4 animate-spin" />
                <span>Applying...</span>
              </>
            ) : (
              <>
                <span className="i-lucide-check w-4 h-4" />
                <span>Apply change</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
