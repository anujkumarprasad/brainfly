import React, { useState } from 'react';
import type { Line, Novel } from '@bl/shared';
import { selectFlaggedLineIds, useStoryStore } from '../store';
import { FactChip } from './FactChip';
import { getCharacterColors } from './utils';

interface LineViewProps {
  line: Line;
  novel: Novel;
}

export function LineView({ line, novel }: LineViewProps) {
  const {
    previewReport,
    activeReport,
    setEditingFact,
    highlightedLineId,
    expandedWhyLineId,
    setExpandedWhyLineId,
    openChat,
  } = useStoryStore();
  const flaggedLineIds = useStoryStore(selectFlaggedLineIds);
  const [showWhy, setShowWhy] = useState(false);

  const report = previewReport ?? activeReport;
  const isFlagged = flaggedLineIds.has(line.id);
  const flaggedItem = report?.impactedLines.find((l) => l.id === line.id);

  const isHighlighted = highlightedLineId === line.id;
  const isWhyExpanded = showWhy || expandedWhyLineId === line.id;

  // Speaker name and colors
  const speakerEntity = line.speaker ? novel.entities.find((e) => e.id === line.speaker) : null;
  const speakerName = speakerEntity ? speakerEntity.name : line.speaker;
  const speakerColor = getCharacterColors(line.speaker);

  // Established facts
  const establishedFacts = line.establishes
    .map((factId) => novel.facts.find((f) => f.id === factId))
    .filter((f): f is NonNullable<typeof f> => f !== undefined);

  return (
    <div
      id={`line-${line.id}`}
      className={`p-3.5 rounded-md transition-all text-sm leading-relaxed ${
        isHighlighted
          ? 'ring-2 ring-amber-400 ring-offset-2 ring-offset-gray-950 bg-amber-500/10'
          : ''
      } ${
        isFlagged
          ? 'bg-red-950/25 border-l-4 border-red-500 text-red-100 pl-4'
          : 'hover:bg-gray-900/50 text-gray-300'
      } ${line.speaker ? 'ml-2' : ''}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 mb-1">
            {speakerName && (
              <button
                type="button"
                onClick={() => line.speaker && openChat(line.speaker)}
                className={`font-bold text-xs tracking-wider uppercase shrink-0 transition-all hover:underline cursor-pointer group inline-flex items-center gap-1 ${
                  speakerColor?.text ?? 'text-gray-400'
                }`}
                style={{ fontVariant: 'small-caps' }}
                title={`Chat with ${speakerName} (Spoiler-safe)`}
                aria-label={`Open chat with ${speakerName}`}
              >
                <span>{speakerName}:</span>
                <span className="i-lucide-message-square w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
            )}
            <p className="flex-1 select-text text-gray-200">{line.text}</p>
          </div>

          {/* Established Fact Chips */}
          {establishedFacts.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 mt-2 pt-0.5">
              <span className="text-[10px] text-amber-400 uppercase tracking-wider font-mono font-semibold">
                Establishes:
              </span>
              {establishedFacts.map((fact) => (
                <FactChip
                  key={fact.id}
                  fact={fact}
                  novel={novel}
                  onClick={() => setEditingFact(fact)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Flagged Line Warning & "Why?" Toggle */}
        {isFlagged && (
          <div className="shrink-0 flex items-center gap-1.5">
            <span className="i-lucide-alert-triangle w-4 h-4 text-red-400 shrink-0" />
            <button
              type="button"
              onClick={() => {
                if (expandedWhyLineId === line.id) {
                  setExpandedWhyLineId(null);
                  setShowWhy(false);
                } else {
                  setShowWhy(!isWhyExpanded);
                }
              }}
              className="px-2 py-0.5 rounded text-xs font-semibold bg-red-900/40 hover:bg-red-900/70 text-red-300 hover:text-white border border-red-700/50 transition-colors cursor-pointer flex items-center gap-1"
            >
              <span>Why?</span>
              <span
                className={`i-lucide-chevron-down w-3 h-3 transition-transform ${
                  isWhyExpanded ? 'rotate-180' : ''
                }`}
              />
            </button>
          </div>
        )}
      </div>

      {/* Expanded "Why?" Explainer & Dependency Chain */}
      {isFlagged && isWhyExpanded && flaggedItem && (
        <div className="mt-3 p-3 rounded-md bg-gray-950 border border-red-800/60 text-xs text-gray-200 space-y-2.5 animate-in fade-in duration-150">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-red-400 font-mono block mb-1">
              Contradiction Reason
            </span>
            <p className="text-red-200 leading-relaxed font-sans">{flaggedItem.reason}</p>
          </div>

          {/* Dependency Chain Chips with Arrows */}
          {flaggedItem.path.length > 0 && (
            <div className="pt-2 border-t border-gray-800">
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 font-mono block mb-1.5">
                Causal Dependency Chain ({flaggedItem.path.length} facts)
              </span>
              <div className="flex flex-wrap items-center gap-2">
                {flaggedItem.path.map((factId, idx) => {
                  const fact = novel.facts.find((f) => f.id === factId);
                  return (
                    <React.Fragment key={factId}>
                      {idx > 0 && (
                        <span className="i-lucide-arrow-right w-3.5 h-3.5 text-gray-500 shrink-0" />
                      )}
                      {fact ? (
                        <FactChip
                          fact={fact}
                          novel={novel}
                          onClick={() => setEditingFact(fact)}
                        />
                      ) : (
                        <span className="px-2 py-0.5 rounded bg-gray-800 text-gray-400 text-xs font-mono">
                          {factId}
                        </span>
                      )}
                    </React.Fragment>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
