import { defineConfig, presetIcons, presetUno } from 'unocss';

export default defineConfig({
  presets: [
    presetUno(),
    presetIcons(),
  ],
  theme: {
    colors: {
      accent: {
        DEFAULT: '#f59e0b',
        hover: '#fbbf24',
        muted: '#d97706',
        dark: '#78350f',
      },
    },
  },
  shortcuts: {
    'btn-primary': 'inline-flex items-center justify-center gap-1.5 rounded-lg border border-amber-500 bg-amber-500 px-3 py-1.5 text-xs font-bold text-gray-950 shadow-sm transition-all hover:bg-amber-400 active:scale-98 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer',
    'btn-secondary': 'inline-flex items-center justify-center gap-1.5 rounded-lg border border-gray-700 bg-gray-800/90 px-3 py-1.5 text-xs font-semibold text-gray-200 shadow-sm transition-all hover:border-amber-500/50 hover:bg-gray-700 hover:text-white active:scale-98 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer',
    'badge-amber': 'inline-flex items-center rounded-full border border-amber-500/40 bg-amber-500/15 px-2.5 py-0.5 text-xs font-bold text-amber-300',
    'badge-gray': 'inline-flex items-center rounded-full border border-gray-700 bg-gray-800 px-2 py-0.5 text-[10px] font-mono text-gray-400',
    'badge-red': 'inline-flex items-center rounded-full border border-red-800 bg-red-950/80 px-2.5 py-0.5 text-xs font-bold text-red-300',
    'card-dark': 'rounded-xl border border-gray-800 bg-gray-900/95 shadow-xl text-gray-100',
  },
});
