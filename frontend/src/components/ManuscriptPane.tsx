import React, { useMemo } from 'react';
import type { Novel } from '@bl/shared';
import { selectFlaggedLineIds, useStoryStore } from '../store';
import { ContradictionsPanel } from './ContradictionsPanel';
import { ImpactBanner } from './ImpactBanner';
import { LineView } from './LineView';

interface ManuscriptPaneProps {
  novel: Novel;
}

export function ManuscriptPane({ novel }: ManuscriptPaneProps) {
  const {
    selectedChapter,
    navigateToChapter,
    previewReport,
    activeReport,
  } = useStoryStore();
  const flaggedLineIds = useStoryStore(selectFlaggedLineIds);

  const currentChapter = useMemo(() => {
    return (
      novel.chapters.find((c) => c.number === selectedChapter) ?? novel.chapters[0] ?? null
    );
  }, [novel, selectedChapter]);

  // Compute flagged lines count per chapter
  const flaggedCountPerChapter = useMemo(() => {
    const counts = new Map<number, number>();
    for (const ch of novel.chapters) {
      let count = 0;
      for (const line of ch.lines) {
        if (flaggedLineIds.has(line.id)) {
          count++;
        }
      }
      counts.set(ch.number, count);
    }
    return counts;
  }, [novel, flaggedLineIds]);

  return (
    <section className="flex-1 lg:w-[55%] flex flex-col border-b lg:border-b-0 lg:border-r border-gray-800 bg-gray-950 overflow-hidden">
      {/* Chapter Tabs */}
      <div className="h-10 border-b border-gray-800 bg-gray-900/60 px-3 flex items-center gap-1.5 overflow-x-auto shrink-0 select-none">
        {novel.chapters.map((ch) => {
          const isActive = ch.number === selectedChapter;
          const flaggedCount = flaggedCountPerChapter.get(ch.number) ?? 0;

          return (
            <button
              key={ch.number}
              type="button"
              onClick={() => {
                void navigateToChapter(ch.number);
              }}
              className={`px-3 py-1 rounded text-xs font-semibold transition-all shrink-0 flex items-center gap-1.5 cursor-pointer ${
                isActive
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/50 shadow-sm'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/60 border border-transparent'
              }`}
            >
              <span>Chapter {ch.number}</span>
              {flaggedCount > 0 && (
                <span
                  className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-red-500/25 text-red-300 border border-red-500/40"
                  title={`${flaggedCount} contradiction${flaggedCount === 1 ? '' : 's'} in Chapter ${ch.number}`}
                >
                  {flaggedCount}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Impact Banner (Preview) or Persistent Contradictions Panel (Committed) */}
      {previewReport && <ImpactBanner report={previewReport} />}
      {!previewReport && activeReport && <ContradictionsPanel report={activeReport} />}

      {/* Chapter Header & Content */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 pb-28">
        <div className="max-w-3xl mx-auto">
          {currentChapter ? (
            <>
              <div className="border-b border-gray-800 pb-3 mb-5">
                <span className="text-xs font-mono text-amber-400 uppercase tracking-widest block mb-1">
                  Chapter {currentChapter.number}
                </span>
                <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
                  {currentChapter.title}
                </h2>
              </div>

              <div key={currentChapter.number} className="space-y-3.5">
                {currentChapter.lines.map((line) => (
                  <LineView key={line.id} line={line} novel={novel} />
                ))}
              </div>
            </>
          ) : (
            <div className="text-gray-500 text-sm">No chapter selected</div>
          )}
        </div>
      </div>
    </section>
  );
}
