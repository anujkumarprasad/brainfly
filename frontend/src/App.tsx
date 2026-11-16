import React, { useEffect, useState } from 'react';
import { BrainflyMark } from './components/BrainflyMark';
import { ChapterSlider } from './components/ChapterSlider';
import { CharacterChatModal } from './components/CharacterChatModal';
import { FactEditor } from './components/FactEditor';
import { GraphPane } from './components/GraphPane';
import { GuidedDemo } from './components/GuidedDemo';
import { HelpSheet } from './components/HelpSheet';
import { ManuscriptPane } from './components/ManuscriptPane';
import {
  selectFlaggedFactIds,
  useStoryStore,
} from './store';

export default function App() {
  const {
    novel,
    activeNovelId,
    editingFact,
    editingFactPatch,
    toastMessage,
    isDemoActive,
    isHelpOpen,
    loading,
    error,
    init,
    resetAll,
    setEditingFact,
    setToastMessage,
    startDemo,
    exitDemo,
    setIsHelpOpen,
  } = useStoryStore();

  const flaggedFactIds = useStoryStore(selectFlaggedFactIds);

  // Initial splash animation state on website open / reload
  const [splashVisible, setSplashVisible] = useState(true);
  const [splashFading, setSplashFading] = useState(false);
  const mountTimeRef = React.useRef(Date.now());

  useEffect(() => {
    init('the-great-woodland-race');
  }, [init]);

  // Keep splash on screen while loading (minimum 700ms so first thought bubble appears without flashing)
  useEffect(() => {
    if (!loading && (novel || error) && splashVisible && !splashFading) {
      const elapsed = Date.now() - mountTimeRef.current;
      const delay = Math.max(0, 700 - elapsed);
      const timer = setTimeout(() => {
        setSplashFading(true);
        setTimeout(() => {
          setSplashVisible(false);
          document.body.setAttribute('data-app-ready', 'true');
        }, 300);
      }, delay);
      return () => clearTimeout(timer);
    }
  }, [loading, novel, error, splashVisible, splashFading]);

  // Global '?' shortcut for Help Sheet
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      const tag = activeEl?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') {
        return;
      }

      if (e.key === '?') {
        e.preventDefault();
        setIsHelpOpen(!isHelpOpen);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isHelpOpen, setIsHelpOpen]);

  return (
    <div
      data-app-ready={!splashVisible ? 'true' : 'false'}
      className="h-screen w-screen bg-gray-950 text-gray-100 flex flex-col font-sans overflow-hidden m-0 p-0"
    >
      {/* Top Bar */}
      <header className="h-14 border-b border-gray-800 bg-gray-900/90 px-3 sm:px-4 flex items-center justify-between shrink-0 z-20 gap-2">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <div className="flex items-center gap-2 shrink-0">
            <BrainflyMark size={28} animated={true} />
            <span className="text-base sm:text-lg font-bold tracking-tight text-white whitespace-nowrap">
              Brain<span className="text-amber-400">fly</span>
            </span>
          </div>

          <span className="text-gray-700 hidden sm:inline">/</span>

          {/* Story Badge */}
          <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-gray-800/80 border border-gray-700/80 text-xs font-semibold text-amber-300 truncate max-w-[200px] md:max-w-none">
            <span className="text-sm">🐢🐇</span>
            <span className="truncate">The Rabbit and the Turtle</span>
            <span className="text-gray-400 text-[10px] hidden lg:inline font-normal">by Aesop</span>
          </div>

          {flaggedFactIds.size > 0 && (
            <span className="badge-amber shrink-0 animate-pulse text-[11px] px-2 py-0.5">
              {flaggedFactIds.size} contradiction{flaggedFactIds.size === 1 ? '' : 's'}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* Start / Exit Guided Demo Button with dedicated X icon when active */}
          <button
            type="button"
            onClick={() => {
              if (isDemoActive) {
                exitDemo();
              } else {
                startDemo();
              }
            }}
            className={`btn-secondary transition-colors px-2.5 sm:px-3 py-1.5 text-xs font-semibold shrink-0 ${
              isDemoActive
                ? 'border-amber-500 text-amber-300 bg-amber-500/20'
                : 'hover:text-amber-400 hover:border-amber-500/40'
            }`}
            title={isDemoActive ? 'Exit guided demo' : 'Start interactive guided demo through causal compilation'}
          >
            {isDemoActive ? (
              <svg className="w-4 h-4 text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            ) : (
              <span className="i-lucide-play-circle w-4 h-4 text-amber-400" />
            )}
            <span className="hidden sm:inline">
              {isDemoActive ? 'Exit Demo' : 'Guided demo'}
            </span>
          </button>

          {/* Reset Button */}
          <button
            type="button"
            onClick={() => (isDemoActive ? exitDemo() : resetAll())}
            disabled={loading}
            className="btn-secondary px-2 sm:px-2.5 py-1.5 text-xs hover:text-amber-400 hover:border-amber-500/40 shrink-0"
            title="Reset novel fixture to original state"
          >
            <span className="i-lucide-rotate-ccw w-4 h-4" />
            <span className="hidden md:inline">Reset</span>
          </button>

          {/* Help Button */}
          <button
            type="button"
            onClick={() => setIsHelpOpen(true)}
            className="btn-secondary p-1.5 sm:p-2 text-xs hover:text-amber-400 shrink-0"
            title="Help & Keyboard Shortcuts (?)"
            aria-label="Open help and keyboard shortcuts"
          >
            <span className="i-lucide-help-circle w-4 h-4 text-gray-400 hover:text-amber-400" />
          </button>
        </div>
      </header>

      {/* Error Banner with Retry */}
      {error && (
        <div className="bg-red-950/80 border-b border-red-800 px-4 py-2.5 flex items-center justify-between text-xs text-red-200 z-10">
          <div className="flex items-center gap-2">
            <span className="i-lucide-alert-triangle w-4 h-4 text-red-400 shrink-0" />
            <span>
              <strong>Backend connection error:</strong> {error}
            </span>
          </div>
          <button
            type="button"
            onClick={() => init()}
            className="px-2.5 py-1 bg-red-800 hover:bg-red-700 text-white font-medium rounded text-xs transition-colors shrink-0 ml-4 cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {/* Loading Skeleton */}
      {loading && !novel && (
        <div className="flex-1 flex flex-col p-6 animate-pulse gap-6">
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-8 w-20 bg-gray-800 rounded" />
            ))}
          </div>
          <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-7 space-y-4">
              <div className="h-6 w-48 bg-gray-800 rounded" />
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="h-14 bg-gray-900 rounded border border-gray-800" />
              ))}
            </div>
            <div className="lg:col-span-5 bg-gray-900 rounded border border-gray-800 flex items-center justify-center">
              <span className="text-xs text-gray-500">Loading causal graph...</span>
            </div>
          </div>
        </div>
      )}

      {/* Main 2-Column Area */}
      {novel && (
        <main className="flex-1 flex flex-col lg:flex-row overflow-hidden min-h-0">
          {/* Left Column: Interactive Manuscript Pane (~55% width) */}
          <ManuscriptPane novel={novel} />

          {/* Right Column: Interactive Knowledge Graph Pane (~45% width) */}
          <GraphPane />
        </main>
      )}

      {/* Bottom Bar: Interactive Chapter Time-Slider */}
      <ChapterSlider />

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-20 right-6 bg-gray-900 border border-amber-500/60 text-amber-200 px-4 py-2.5 rounded-lg shadow-2xl text-xs flex items-center gap-2.5 z-50 animate-bounce">
          <span className="i-lucide-message-square w-4 h-4 text-amber-400 shrink-0" />
          <span className="font-medium">{toastMessage}</span>
          <button
            type="button"
            onClick={() => setToastMessage(null)}
            className="ml-2 text-gray-400 hover:text-white cursor-pointer"
            title="Dismiss toast"
          >
            <span className="i-lucide-x w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Fact Editor Drawer */}
      {editingFact && novel && (
        <FactEditor
          fact={editingFact}
          novel={novel}
          initialPatch={editingFactPatch}
          onClose={() => setEditingFact(null)}
        />
      )}

      {/* Character Chat Modal */}
      <CharacterChatModal />

      {/* Interactive Guided Demo Coach Panel */}
      <GuidedDemo />

      {/* Help Sheet */}
      <HelpSheet />

      {/* Opening Brainfly Splash Screen on page load / reload */}
      {splashVisible && (
        <div
          role="status"
          aria-label="Loading Brainfly: find all references for stories"
          className={`fixed inset-0 z-50 flex flex-col items-center justify-center bg-gray-950 text-gray-100 transition-opacity duration-300 ease-out ${
            splashFading ? 'opacity-0 pointer-events-none' : 'opacity-100'
          }`}
        >
          <div className="relative flex flex-col items-center select-none">
            {/* Thought Bubbles rising from top of brain */}
            <div className="absolute -top-10 inset-x-0 h-28 pointer-events-none overflow-visible flex items-center justify-center">
              <div className="thought-bubble bubble-1">what if?</div>
              <div className="thought-bubble bubble-2">because…</div>
              <div className="thought-bubble bubble-3">so then?</div>
              <div className="thought-bubble bubble-4">why?</div>
              <div className="thought-bubble bubble-5">and then…</div>
            </div>

            {/* Centered Flying Brain (120px) */}
            <div className="w-[120px] h-[120px] splash-brain-anim text-amber-400">
              <BrainflyMark size={120} animated={true} />
            </div>

            <div className="text-2xl sm:text-3xl font-bold tracking-tight text-white mt-4 font-sans flex items-center gap-1.5 animate-fade-in">
              <span>Brain</span>
              <span className="text-amber-400">fly</span>
            </div>

            <div className="text-xs text-amber-300/80 mt-1.5 font-medium tracking-wide flex items-center gap-0.5">
              <span>Loading</span>
              <span className="inline-flex tracking-widest text-amber-400 font-bold animate-pulse">...</span>
            </div>

            <div className="w-36 h-1 bg-gray-900 rounded-full mt-4 overflow-hidden border border-gray-800">
              <div className="h-full bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-500 rounded-full animate-pulse w-full" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
