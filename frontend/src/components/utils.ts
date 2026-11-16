export const CHARACTER_COLORS: Record<string, { text: string; bg: string; border: string }> = {
  hare: { text: 'text-amber-400', bg: 'bg-amber-500/15', border: 'border-amber-500/40' },
  tortoise: { text: 'text-emerald-400', bg: 'bg-emerald-500/15', border: 'border-emerald-500/40' },
  fox: { text: 'text-orange-400', bg: 'bg-orange-500/15', border: 'border-orange-500/40' },
  owl: { text: 'text-sky-400', bg: 'bg-sky-500/15', border: 'border-sky-500/40' },
};

export function getCharacterColors(speakerId: string | null) {
  if (!speakerId) return null;
  return (
    CHARACTER_COLORS[speakerId] ?? {
      text: 'text-indigo-400',
      bg: 'bg-indigo-500/15',
      border: 'border-indigo-500/40',
    }
  );
}

export const CHARACTER_HEX: Record<string, string> = {
  hare: '#f59e0b',
  tortoise: '#10b981',
  fox: '#f97316',
  owl: '#38bdf8',
};

export function getEntityColor(id: string, type: 'character' | 'item' | 'location' | 'secret'): string {
  if (type === 'character') {
    return CHARACTER_HEX[id] ?? '#818cf8';
  }
  switch (type) {
    case 'item':
      return '#fbbf24';
    case 'location':
      return '#60a5fa';
    case 'secret':
      return '#f43f5e';
  }
}

export function scrollToLine(lineId: string) {
  setTimeout(() => {
    const el = document.getElementById(`line-${lineId}`);
    if (el) {
      const prefersReducedMotion =
        typeof window !== 'undefined' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      el.scrollIntoView({
        behavior: prefersReducedMotion ? 'auto' : 'smooth',
        block: 'center',
      });
    }
  }, 60);
}
