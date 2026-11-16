import React, { useEffect } from 'react';
import { useStoryStore } from '../store';

export const ChapterSlider: React.FC = () => {
  const { novel, sliderChapter, graph, navigateToChapter, loading } = useStoryStore();

  const chapters = novel?.chapters ?? [];
  const totalChapters = chapters.length || 5;
  const currentChapter = chapters.find((c) => c.number === sliderChapter);
  const factsKnown = graph?.edges.length ?? 0;
  const goToChapter = (chapter: number) => {
    void navigateToChapter(chapter);
  };

  // Global Left/Right keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      const tag = activeEl?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') {
        return;
      }

      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (sliderChapter > 1) {
          goToChapter(sliderChapter - 1);
        }
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        if (sliderChapter < totalChapters) {
          goToChapter(sliderChapter + 1);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [sliderChapter, totalChapters, goToChapter]);

  return (
    <footer className="h-16 border-t border-gray-800 bg-gray-900/95 px-4 sm:px-6 flex items-center justify-between shrink-0 z-20 backdrop-blur select-none">
      {/* Left: Big Current Chapter Label & Facts Counter */}
      <div className="flex flex-col justify-center min-w-[180px] max-w-[280px]">
        <div className="flex items-center gap-2">
          <span className="i-lucide-clock w-4 h-4 text-amber-400 shrink-0" />
          <span className="text-sm font-bold text-white truncate">
            Chapter {sliderChapter}
            {currentChapter?.title ? `: ${currentChapter.title}` : ''}
          </span>
        </div>
        <span className="text-[11px] text-gray-400 font-mono mt-0.5">
          Chapter {sliderChapter} of {totalChapters}, {factsKnown} fact{factsKnown === 1 ? '' : 's'} known
        </span>
      </div>

      {/* Center: Controls, Range Slider, & Ticks */}
      <div className="flex-1 max-w-xl mx-4 sm:mx-8 flex flex-col justify-center">
        <div className="flex items-center gap-2">
          {/* Step Back Button */}
          <button
            type="button"
            onClick={() => sliderChapter > 1 && goToChapter(sliderChapter - 1)}
            disabled={sliderChapter <= 1 || loading}
            className="group flex items-center gap-1 px-1.5 sm:px-2 py-1.5 text-gray-400 hover:text-amber-300 disabled:opacity-30 disabled:cursor-not-allowed rounded-md hover:bg-white/5 transition-colors cursor-pointer shrink-0"
            title="Previous chapter (Left arrow)"
            aria-label="Previous chapter"
          >
            <span className="i-lucide-chevron-left w-4 h-4" />
            <span className="hidden sm:inline text-[11px] font-medium">Prev</span>
          </button>

          {/* Slider & Ticks column */}
          <div className="flex-1 flex flex-col relative px-2">
            <input
              type="range"
              min={1}
              max={totalChapters}
              step={1}
              value={sliderChapter}
              onChange={(e) => goToChapter(Number(e.target.value))}
              disabled={loading}
              className="w-full accent-amber-500 cursor-pointer h-2 bg-gray-800 rounded-lg appearance-none focus:outline-none focus:ring-1 focus:ring-amber-500"
              aria-label="Chapter time slider"
            />

            {/* Chapter Ticks */}
            <div className="flex justify-between items-center mt-1 select-none">
              {chapters.map((ch) => {
                const isActive = ch.number === sliderChapter;
                return (
                  <button
                    key={ch.number}
                    type="button"
                    onClick={() => goToChapter(ch.number)}
                    className={`text-[10px] font-mono transition-colors cursor-pointer flex flex-col items-center group ${
                      isActive
                        ? 'text-amber-400 font-semibold'
                        : 'text-gray-500 hover:text-gray-300'
                    }`}
                    title={`Jump to Chapter ${ch.number}: ${ch.title}`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full mb-0.5 transition-colors ${
                        isActive ? 'bg-amber-400 ring-2 ring-amber-400/30' : 'bg-gray-700 group-hover:bg-gray-500'
                      }`}
                    />
                    <span className="hidden sm:inline">Ch {ch.number}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Step Forward Button */}
          <button
            type="button"
            onClick={() => sliderChapter < totalChapters && goToChapter(sliderChapter + 1)}
            disabled={sliderChapter >= totalChapters || loading}
            className="group flex items-center gap-1 px-1.5 sm:px-2 py-1.5 text-gray-400 hover:text-amber-300 disabled:opacity-30 disabled:cursor-not-allowed rounded-md hover:bg-white/5 transition-colors cursor-pointer shrink-0"
            title="Next chapter (Right arrow)"
            aria-label="Next chapter"
          >
            <span className="hidden sm:inline text-[11px] font-medium">Next</span>
            <span className="i-lucide-chevron-right w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Right: Spoiler Fence Status & Phase 1 Footer text */}
      <div className="hidden md:flex flex-col items-end justify-center text-xs text-gray-400 shrink-0 gap-0.5">
        <span className="px-2.5 py-0.5 rounded bg-gray-800/80 border border-gray-700/60 font-mono text-[10px] text-gray-300 flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          <span>Spoiler Fence: &le; Ch {sliderChapter}</span>
        </span>
        <span className="text-[10px] text-gray-500 font-mono">
          Phase 1: deterministic engine; AI integration in progress
        </span>
      </div>
    </footer>
  );
};
