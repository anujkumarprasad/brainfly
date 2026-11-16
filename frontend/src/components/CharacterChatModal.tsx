import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { factToText } from '@bl/shared';
import { useStoryStore } from '../store';
import { getEntityColor } from './utils';

export const CharacterChatModal: React.FC = () => {
  const {
    novel,
    activeChatCharacter,
    sliderChapter,
    chatThreads,
    closeChat,
    openChat,
    sendChatMessage,
  } = useStoryStore();

  const [fenceChapter, setFenceChapter] = useState(sliderChapter);
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Voice Question & Speech Synthesis states
  const [isListening, setIsListening] = useState(false);
  const [speechRecognitionSupported, setSpeechRecognitionSupported] = useState(false);
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);

  const dialogRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);

  // Check Web Speech Recognition support
  useEffect(() => {
    const SpeechRecognitionClass =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    setSpeechRecognitionSupported(Boolean(SpeechRecognitionClass));
  }, []);

  // Cleanup speech synthesis and recognition on unmount or character change
  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
    };
  }, [activeChatCharacter]);

  // Sync initial fenceChapter from global sliderChapter when opened or character changes
  useEffect(() => {
    if (activeChatCharacter) {
      setFenceChapter(sliderChapter);
      setError(null);
      setInputText('');
      setIsListening(false);
      setSpeakingMessageId(null);
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    }
  }, [activeChatCharacter, sliderChapter]);

  // Focus input on open
  useEffect(() => {
    if (activeChatCharacter) {
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [activeChatCharacter]);

  // Accessible Dialog Focus Trap & Escape key listener
  useEffect(() => {
    if (!activeChatCharacter) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeChat();
        return;
      }

      if (e.key === 'Tab' && dialogRef.current) {
        const focusableElements = dialogRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusableElements.length === 0) return;

        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === firstElement) {
            e.preventDefault();
            lastElement.focus();
          }
        } else {
          if (document.activeElement === lastElement) {
            e.preventDefault();
            firstElement.focus();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeChatCharacter, closeChat]);

  // Character entity details
  const character = useMemo(() => {
    if (!novel || !activeChatCharacter) return null;
    return novel.entities.find((e) => e.id === activeChatCharacter) ?? null;
  }, [novel, activeChatCharacter]);

  const totalChapters = novel?.chapters.length || 5;
  const threadKey = `${activeChatCharacter}__ch${fenceChapter}`;
  const messages = chatThreads[threadKey] ?? [];

  // Auto-scroll to bottom of messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isSending]);

  // Send message handler
  const handleSend = useCallback(
    async (textToSend?: string) => {
      const text = (textToSend ?? inputText).trim();
      if (!text || !activeChatCharacter || isSending) return;

      setError(null);
      if (!textToSend) {
        setInputText('');
      }
      setIsSending(true);

      try {
        await sendChatMessage(activeChatCharacter, fenceChapter, text);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to reach character');
      } finally {
        setIsSending(false);
        inputRef.current?.focus();
      }
    },
    [activeChatCharacter, fenceChapter, inputText, isSending, sendChatMessage]
  );

  // Toggle voice recognition (Speech-to-Text)
  const toggleListening = useCallback(() => {
    const SpeechRecognitionClass =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognitionClass) {
      setError('Voice recognition is not supported in this browser. Please use Google Chrome or Edge.');
      return;
    }

    if (isListening) {
      try {
        recognitionRef.current?.stop();
      } catch {
        // ignore
      }
      setIsListening(false);
      return;
    }

    try {
      const recognition = new SpeechRecognitionClass();
      recognition.lang = 'en-US';
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;

      recognition.onstart = () => {
        setIsListening(true);
        setError(null);
      };

      recognition.onresult = (event: any) => {
        const transcript = event.results?.[0]?.[0]?.transcript;
        if (transcript) {
          setInputText((prev) => (prev ? `${prev} ${transcript}` : transcript));
        }
      };

      recognition.onerror = (event: any) => {
        if (event.error !== 'no-speech') {
          setError(`Microphone error: ${event.error}`);
        }
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not activate microphone');
      setIsListening(false);
    }
  }, [isListening]);

  // Voice synthesis read-aloud (Text-to-Speech)
  const speakMessage = useCallback(
    (msgId: string, text: string) => {
      if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
        setError('Speech synthesis is not supported in this browser.');
        return;
      }

      if (speakingMessageId === msgId) {
        window.speechSynthesis.cancel();
        setSpeakingMessageId(null);
        return;
      }

      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      const voiceSettings: Record<string, { pitch: number; rate: number }> = {
        hare: { pitch: 1.15, rate: 1.2 },
        tortoise: { pitch: 0.9, rate: 0.85 },
        fox: { pitch: 1.0, rate: 1.05 },
        owl: { pitch: 0.85, rate: 0.9 },
      };

      const settings = (activeChatCharacter && voiceSettings[activeChatCharacter]) || {
        pitch: 1.0,
        rate: 1.0,
      };

      utterance.pitch = settings.pitch;
      utterance.rate = settings.rate;

      utterance.onend = () => {
        setSpeakingMessageId(null);
      };

      utterance.onerror = () => {
        setSpeakingMessageId(null);
      };

      setSpeakingMessageId(msgId);
      window.speechSynthesis.speak(utterance);
    },
    [activeChatCharacter, speakingMessageId]
  );

  // Suggested prompt chips based on character & chapter
  const suggestedPrompts = useMemo(() => {
    if (activeChatCharacter === 'hare') {
      return [
        'Can you beat Turtle?',
        'Why did you stop under the tree?',
        'Did you touch the Golden Trophy?',
        'Where are you right now?',
      ];
    }
    if (activeChatCharacter === 'tortoise') {
      return [
        'How is the race going?',
        'Did you pass Rabbit at the tree?',
        'Did you win the Golden Trophy?',
        'Where are you right now?',
      ];
    }
    if (activeChatCharacter === 'fox') {
      return [
        'Who won the woodland race?',
        'Did you see Rabbit sleeping?',
        'Who holds the Golden Trophy?',
        'Where are you right now?',
      ];
    }
    if (activeChatCharacter === 'owl') {
      return [
        'What did you see from above?',
        'Did Turtle pass Rabbit?',
        'Where is the trophy?',
        'Who won the race?',
      ];
    }

    // Mystery defaults
    const prompts = [
      'Where are you?',
      'Who are you?',
    ];

    if (activeChatCharacter === 'hare') {
      prompts.unshift('Are you ready to race?');
      prompts.push('Did you eat the sweet apples?');
    } else if (activeChatCharacter === 'tortoise') {
      prompts.unshift('Did you win the golden trophy?');
      prompts.push('How do you keep your pace?');
    } else if (activeChatCharacter === 'fox') {
      prompts.unshift('What are the official race rules?');
      prompts.push('Who is currently leading?');
    } else if (activeChatCharacter === 'owl') {
      prompts.unshift('What do you see from the treetops?');
      prompts.push('Who reached the finish line?');
    }

    return prompts;
  }, [activeChatCharacter]);

  // "Try the fence" demo button handler
  const handleTryTheFence = useCallback(async () => {
    if (activeChatCharacter !== 'tortoise') {
      openChat('tortoise');
    }
    setFenceChapter(2);
    setError(null);
    setIsSending(true);
    try {
      await sendChatMessage('tortoise', 2, 'Did you win the golden trophy?');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send demo message');
    } finally {
      setIsSending(false);
      inputRef.current?.focus();
    }
  }, [activeChatCharacter, openChat, sendChatMessage]);

  if (!activeChatCharacter || !novel || !character) {
    return null;
  }

  const charColor = getEntityColor(character.id, 'character');

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-sm animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          closeChat();
        }
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="chat-dialog-title"
        aria-describedby="chat-dialog-description"
        className="w-full max-w-2xl bg-gray-900 border border-gray-700/80 rounded-xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden select-none animate-scale-in"
      >
        {/* Header */}
        <div className="border-b border-gray-800 bg-gray-900/90 p-4 shrink-0 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span
                className="w-4 h-4 rounded-full border border-white/40 shrink-0"
                style={{ backgroundColor: charColor }}
              />
              <h2
                id="chat-dialog-title"
                className="text-base font-bold text-white flex items-center gap-2"
              >
                <span>{character.name}</span>
                <span className="badge-gray font-mono text-[10px] uppercase">
                  {character.type}
                </span>
              </h2>
            </div>

            <button
              type="button"
              onClick={closeChat}
              aria-label="Close chat modal"
              className="p-1.5 text-gray-400 hover:text-white rounded-lg hover:bg-gray-800 transition-colors cursor-pointer flex items-center justify-center"
              title="Close (Esc)"
            >
              <svg className="w-5 h-5 text-gray-400 hover:text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          {/* Time-Fence Slider & Indicator */}
          <div className="bg-gray-950/60 border border-gray-800/80 rounded-lg p-2.5 flex flex-col gap-2">
            <div className="flex items-center justify-between text-xs">
              <span
                id="chat-dialog-description"
                className="text-gray-300 font-medium flex items-center gap-1.5"
              >
                <span className="i-lucide-shield-alert w-3.5 h-3.5 text-amber-400" />
                <span>
                  Spoiler fence: this character only knows things up to{' '}
                  <strong className="text-amber-400">Chapter {fenceChapter}</strong>
                </span>
              </span>

              <span className="text-[11px] font-mono text-gray-500">
                Fence: &le; Ch {fenceChapter}
              </span>
            </div>

            <div className="flex items-center gap-3">
              <input
                type="range"
                min={1}
                max={totalChapters}
                step={1}
                value={fenceChapter}
                onChange={(e) => setFenceChapter(Number(e.target.value))}
                className="flex-1 accent-amber-500 cursor-pointer h-1.5 bg-gray-800 rounded-lg appearance-none"
                aria-label={`Spoiler fence chapter: Chapter ${fenceChapter}`}
              />

              <div className="flex items-center gap-1">
                {Array.from({ length: totalChapters }, (_, i) => i + 1).map((chNum) => {
                  const isLocked = chNum > fenceChapter;
                  const isActive = chNum === fenceChapter;
                  return (
                    <button
                      key={chNum}
                      type="button"
                      onClick={() => setFenceChapter(chNum)}
                      className={`px-2 py-0.5 rounded text-[11px] font-mono flex items-center gap-0.5 transition-colors cursor-pointer ${
                        isActive
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/50 font-bold'
                          : isLocked
                          ? 'text-gray-500 hover:text-gray-400 border border-gray-800/50'
                          : 'text-gray-300 hover:text-white border border-gray-700/60'
                      }`}
                      title={
                        isLocked
                          ? `Chapter ${chNum} is locked by spoiler fence`
                          : `Set fence to Chapter ${chNum}`
                      }
                    >
                      <span>{chNum}</span>
                      {isLocked && <span className="i-lucide-lock w-2.5 h-2.5 text-gray-500" />}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Demo Hint Banner: "Try the fence" */}
        <div className="px-4 py-2 bg-amber-950/20 border-b border-amber-900/30 flex items-center justify-between text-xs">
          <div className="flex items-center gap-1.5 text-amber-200/90 text-[11px]">
            <span className="i-lucide-sparkles w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span>
              <strong>Demo spoiler fence:</strong> Turtle doesn't know about the Golden Trophy until Chapter 4.
            </span>
          </div>
          <button
            type="button"
            onClick={handleTryTheFence}
            disabled={isSending}
            className="px-2.5 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 rounded text-[11px] font-semibold flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-50"
            title="Ask Turtle about the Golden Trophy at Chapter 2 to see the fence refusal"
          >
            <span className="i-lucide-shield-alert w-3 h-3 text-amber-400" />
            <span>Try the fence</span>
          </button>
        </div>

        {/* Chat Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-[260px] max-h-[460px] bg-gray-950/40">
          {/* Thread Header Info */}
          <div className="text-center py-2">
            <span className="px-3 py-1 rounded-full bg-gray-800/80 border border-gray-700/60 text-[10px] font-mono text-gray-400 uppercase tracking-widest inline-flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
              Thread: {character.name} &middot; Chapter {fenceChapter} Fence
            </span>
          </div>

          {/* Empty Thread Prompt */}
          {messages.length === 0 && !isSending && (
            <div className="text-center py-6 text-gray-400 text-xs">
              <div className="w-10 h-10 rounded-full bg-gray-800/60 border border-gray-700/60 flex items-center justify-center mx-auto mb-2 text-gray-400">
                <span className="i-lucide-message-square w-5 h-5 text-amber-400" />
              </div>
              <p className="font-medium text-gray-300 mb-1">
                Ask {character.name} a question
              </p>
              <p className="text-[11px] text-gray-500 max-w-sm mx-auto leading-relaxed">
                They will only answer based on knowledge up to{' '}
                <strong className="text-gray-400">Chapter {fenceChapter}</strong>. Any questions
                mentioning future entities will be refused.
              </p>
            </div>
          )}

          {/* Messages List */}
          {messages.map((msg) => {
            const isUser = msg.sender === 'user';
            return (
              <div
                key={msg.id}
                className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-xs leading-relaxed select-text break-words overflow-hidden ${
                    isUser
                      ? 'bg-amber-600/25 text-amber-100 border border-amber-500/40 rounded-tr-sm'
                      : 'bg-gray-800/90 text-gray-100 border border-gray-700/80 rounded-tl-sm shadow-md'
                  }`}
                >
                  <p className="whitespace-pre-wrap break-words">{msg.text}</p>
                </div>

                {/* Under Character Reply: Voice playback, Refusal Badge, Grounded Facts */}
                {!isUser && (
                  <div className="mt-1.5 max-w-[85%] flex flex-col items-start gap-1">
                    <div className="flex items-center gap-2">
                      {/* Voice Read Aloud button */}
                      <button
                        type="button"
                        onClick={() => speakMessage(msg.id, msg.text)}
                        className={`px-2 py-0.5 rounded text-[10px] font-mono flex items-center gap-1 transition-colors cursor-pointer ${
                          speakingMessageId === msg.id
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/50'
                            : 'text-gray-400 hover:text-white bg-gray-800/70 border border-gray-700/60'
                        }`}
                        title={speakingMessageId === msg.id ? 'Stop voice reading' : 'Read aloud with voice'}
                        aria-label={speakingMessageId === msg.id ? 'Stop voice reading' : 'Read aloud with voice'}
                      >
                        <svg className="w-3 h-3 text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                          <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                          {speakingMessageId === msg.id && <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />}
                        </svg>
                        <span>{speakingMessageId === msg.id ? 'Stop Voice' : 'Read Voice'}</span>
                      </button>

                      {/* Source indicator label: rule-based or AI */}
                      {msg.source === 'llm' ? (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-emerald-950/60 text-emerald-300 border border-emerald-800/60">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                          AI
                        </span>
                      ) : (
                        <span className="text-[10px] font-mono text-gray-500">
                          rule-based
                        </span>
                      )}

                      {/* Refused badge */}
                      {msg.refused && (
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-red-950/80 border border-red-800 text-red-300 text-[11px] font-medium shadow-sm">
                          <span className="i-lucide-shield-alert w-3.5 h-3.5 text-red-400 shrink-0" />
                          <span>Blocked by spoiler fence</span>
                        </div>
                      )}
                    </div>

                    {/* Collapsible Grounded In facts */}
                    {msg.factsUsed && msg.factsUsed.length > 0 && (
                      <details className="group text-left mt-0.5">
                        <summary className="text-[10px] font-mono text-gray-400 hover:text-amber-400 cursor-pointer list-none flex items-center gap-1 transition-colors">
                          <span className="i-lucide-chevron-right w-3 h-3 group-open:rotate-90 transition-transform shrink-0" />
                          <span>
                            Grounded in {msg.factsUsed.length} fact
                            {msg.factsUsed.length === 1 ? '' : 's'}
                          </span>
                        </summary>

                        <ul className="mt-1 space-y-1 pl-3 border-l-2 border-amber-500/30 text-[10px] font-mono">
                          {msg.factsUsed.map((factId) => {
                            const fact = novel.facts.find((f) => f.id === factId);
                            const text = fact ? factToText(fact, novel) : factId;
                            const isHidden = fact?.status === 'hidden';
                            return (
                              <li key={factId} className="text-gray-300 flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                                <span>{text}</span>
                                {fact && (
                                  <span className="text-gray-500">(Ch {fact.chapter})</span>
                                )}
                                {isHidden && (
                                  <span className="text-amber-400/90 font-semibold">[hidden]</span>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      </details>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {/* Thinking Indicator */}
          {isSending && (
            <div className="flex items-start">
              <div className="bg-gray-800/80 border border-gray-700/80 rounded-2xl rounded-tl-sm px-4 py-2.5 text-xs text-gray-400 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                <span>Thinking...</span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Inline Error Message */}
        {error && (
          <div className="px-4 py-2 bg-red-950/80 border-t border-red-800 text-xs text-red-200 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <span className="i-lucide-alert-triangle w-4 h-4 text-red-400 shrink-0" />
              <span>
                <strong>Error:</strong> {error}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setError(null)}
              className="text-red-400 hover:text-white text-xs underline cursor-pointer ml-3"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Suggested Prompts Chips */}
        <div className="p-3 bg-gray-900/70 border-t border-gray-800/80 shrink-0 flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] text-gray-500 uppercase tracking-widest font-mono mr-1">
            Suggested:
          </span>
          {suggestedPrompts.map((prompt) => (
            <button
              key={prompt}
              type="button"
              disabled={isSending}
              onClick={() => handleSend(prompt)}
              className="px-2.5 py-1 bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white rounded-full text-[11px] border border-gray-700/60 transition-colors cursor-pointer disabled:opacity-40"
            >
              {prompt}
            </button>
          ))}
        </div>

        {/* Voice Listening Status Banner */}
        {isListening && (
          <div className="px-4 py-2 bg-red-950/80 border-t border-red-800/80 text-xs text-red-200 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-ping" />
              <span className="font-medium">Listening to your voice... Speak your question now</span>
            </div>
            <button
              type="button"
              onClick={toggleListening}
              className="text-red-300 hover:text-white text-xs underline font-semibold cursor-pointer"
            >
              Done speaking
            </button>
          </div>
        )}

        {/* Input Bar */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="p-3.5 border-t border-gray-800 bg-gray-900 shrink-0 flex items-center gap-2"
        >
          {/* Voice Question Button */}
          <button
            type="button"
            onClick={toggleListening}
            disabled={isSending}
            className={`p-2 rounded-lg text-xs flex items-center justify-center transition-all cursor-pointer border shrink-0 ${
              isListening
                ? 'bg-red-500/20 text-red-400 border-red-500/60 shadow-[0_0_8px_rgba(239,68,68,0.5)]'
                : 'bg-gray-800 text-gray-300 hover:text-white border-gray-700 hover:border-amber-500/50'
            }`}
            title={
              isListening
                ? 'Listening... Click to finish'
                : speechRecognitionSupported
                ? 'Ask question with voice (Microphone)'
                : 'Microphone voice questions (Chrome/Edge)'
            }
            aria-label={isListening ? 'Stop voice recognition' : 'Ask question with voice'}
          >
            <svg
              className={`w-4 h-4 ${isListening ? 'text-red-400 animate-pulse' : 'text-amber-400'}`}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="22" />
            </svg>
          </button>

          <input
            ref={inputRef}
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            disabled={isSending}
            placeholder={`Ask ${character.name} something (or click mic to speak)...`}
            className="flex-1 bg-gray-950 border border-gray-700 rounded-lg px-3.5 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 disabled:opacity-50"
          />

          <button
            type="submit"
            disabled={isSending || !inputText.trim()}
            className="btn-primary py-2 px-3.5 text-xs flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shrink-0"
            aria-label="Send message"
          >
            <span>Send</span>
            <span className="i-lucide-send w-3.5 h-3.5" />
          </button>
        </form>
      </div>
    </div>
  );
};
