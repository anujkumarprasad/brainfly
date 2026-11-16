import React from 'react';
import type { BlastReport } from '@bl/shared';
import { useStoryStore } from '../store';
import { scrollToLine } from './utils';

interface ImpactBannerProps {
  report: BlastReport;
}

export function ImpactBanner({ report }: ImpactBannerProps) {
  const { navigateToChapter, setHighlightedLineId, cancelPreview } = useStoryStore();

  if (report.noChange || report.impactedLines.length === 0) {
    return null;
  }

  const linesCount = report.impactedLines.length;
  const chaptersCount = report.summary.chaptersAffected.length;

  const handleChapterClick = (chapterNumber: number) => {
    void navigateToChapter(chapterNumber);
    const firstLineInChapter = report.impactedLines.find((l) => l.chapter === chapterNumber);
    if (firstLineInChapter) {
      setHighlightedLineId(firstLineInChapter.id);
      scrollToLine(firstLineInChapter.id);
    }
  };

  return (
    <div className="bg-red-950/70 border-b border-red-800/80 px-4 py-3 text-red-200 flex flex-wrap items-center justify-between gap-3 shadow-md animate-in fade-in duration-150 shrink-0">
      <div className="flex items-center gap-2.5">
        <span className="i-lucide-alert-triangle w-5 h-5 text-red-400 shrink-0 animate-bounce" />
        <span className="text-sm font-semibold text-white">
          {linesCount} line{linesCount === 1 ? '' : 's'} in {chaptersCount} chapter
          {chaptersCount === 1 ? '' : 's'} would contradict this change
        </span>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5 text-xs text-gray-300">
          <span className="text-gray-400">Jump to:</span>
          {report.summary.chaptersAffected.map((ch) => (
            <button
              key={ch}
              type="button"
              onClick={() => handleChapterClick(ch)}
              className="px-2 py-0.5 rounded bg-red-900/60 hover:bg-red-800 text-red-200 hover:text-white border border-red-700/60 text-xs font-semibold cursor-pointer transition-colors"
            >
              Ch {ch}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => cancelPreview()}
          className="btn-secondary text-xs py-1 px-2.5 text-red-200 hover:text-white border-red-800 hover:bg-red-900/60"
          title="Cancel preview and discard pending change"
        >
          <span className="i-lucide-x w-3.5 h-3.5" />
          <span>Cancel</span>
        </button>
      </div>
    </div>
  );
}
