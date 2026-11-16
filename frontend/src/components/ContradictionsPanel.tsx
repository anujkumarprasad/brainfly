import React, { useState } from 'react';
import type { BlastReport } from '@bl/shared';
import { useStoryStore } from '../store';
import { scrollToLine } from './utils';

interface ContradictionsPanelProps {
  report: BlastReport;
}

export function ContradictionsPanel({ report }: ContradictionsPanelProps) {
  const { navigateToChapter, setHighlightedLineId, dismissActiveReport } = useStoryStore();
  const [isOpen, setIsOpen] = useState(true);

  if (report.noChange || report.impactedLines.length === 0) {
    return null;
  }

  const linesCount = report.impactedLines.length;
  const chaptersCount = report.summary.chaptersAffected.length;

  const handleLineClick = (chapterNumber: number, lineId: string) => {
    void navigateToChapter(chapterNumber);
    setHighlightedLineId(lineId);
    scrollToLine(lineId);
  };

  return (
    <div className="bg-red-950/40 border-b border-red-900/60 transition-all shrink-0">
      {/* Panel Header */}
      <div className="px-4 py-2.5 flex items-center justify-between text-xs gap-3">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-2 text-left cursor-pointer hover:opacity-90 flex-1 min-w-0"
        >
          <span className="i-lucide-alert-octagon w-4 h-4 text-red-400 shrink-0" />
          <span className="font-semibold text-red-300 truncate">
            Active Contradictions: {linesCount} flagged line{linesCount === 1 ? '' : 's'} across{' '}
            {chaptersCount} chapter{chaptersCount === 1 ? '' : 's'}
          </span>
          <span
            className={`i-lucide-chevron-down w-4 h-4 text-gray-400 transition-transform ${
              isOpen ? 'rotate-180' : ''
            }`}
          />
        </button>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => dismissActiveReport()}
            className="px-2.5 py-1 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white border border-gray-700 text-xs transition-colors cursor-pointer"
            title="Dismiss contradictions panel (keeps edits in effect)"
          >
            Dismiss
          </button>
        </div>
      </div>

      {/* Collapsible List of Flagged Lines */}
      {isOpen && (
        <div className="max-h-56 overflow-y-auto px-4 pb-3 space-y-1.5 border-t border-red-900/40 pt-2">
          {report.impactedLines.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => handleLineClick(item.chapter, item.id)}
              className="w-full text-left p-2 rounded bg-red-950/50 hover:bg-red-900/40 border border-red-900/40 transition-colors flex items-start gap-2.5 cursor-pointer group"
            >
              <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-red-900/80 text-red-200 shrink-0">
                Ch {item.chapter}
              </span>
              <div className="flex-1 min-w-0 text-xs">
                <span className="text-red-200 group-hover:text-white line-clamp-1">
                  {item.reason}
                </span>
              </div>
              <span className="i-lucide-arrow-right w-3.5 h-3.5 text-red-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-0.5" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
