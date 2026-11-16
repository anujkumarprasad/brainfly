import React from 'react';
import type { Fact, Novel } from '@bl/shared';
import { factToText } from '@bl/shared';
import { selectEditedFactId, selectFlaggedFactIds, useStoryStore } from '../store';

interface FactChipProps {
  fact: Fact;
  novel: Novel;
  onClick?: () => void;
  overrideLabel?: string;
}

export function FactChip({ fact, novel, onClick, overrideLabel }: FactChipProps) {
  const editedFactId = useStoryStore(selectEditedFactId);
  const flaggedFactIds = useStoryStore(selectFlaggedFactIds);

  const isEdited = editedFactId === fact.id;
  const isFlagged = flaggedFactIds.has(fact.id);

  let colorClasses =
    'bg-slate-800 text-slate-100 border-slate-600 hover:border-amber-400 hover:text-amber-200 hover:bg-slate-700 shadow-sm font-medium';
  let badgeText: string | null = null;

  if (isEdited) {
    colorClasses =
      'bg-amber-500/25 text-amber-200 border-amber-400 shadow-md font-semibold hover:bg-amber-500/35';
    badgeText = 'Edited';
  } else if (isFlagged) {
    colorClasses =
      'bg-red-500/25 text-red-200 border-red-400 shadow-md font-semibold hover:bg-red-500/35';
    badgeText = 'Contradiction';
  }

  const label = overrideLabel ?? factToText(fact, novel);

  return (
    <button
      type="button"
      onClick={onClick}
      className={`fact-chip inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs border transition-all cursor-pointer ${colorClasses}`}
      title={onClick ? `Click to edit fact: ${label}` : label}
    >
      <span className="i-lucide-tag w-3.5 h-3.5 shrink-0 text-amber-400" />
      <span>{label}</span>
      {fact.status === 'hidden' && (
        <span className="text-[10px] uppercase font-mono px-1 py-0.2 rounded bg-black/40 text-gray-400 ml-0.5">
          hidden
        </span>
      )}
      {badgeText && (
        <span
          className={`text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.2 rounded-full ${
            isEdited ? 'bg-amber-500/30 text-amber-200' : 'bg-red-500/30 text-red-200'
          }`}
        >
          {badgeText}
        </span>
      )}
    </button>
  );
}
