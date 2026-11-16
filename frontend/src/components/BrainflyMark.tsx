import React from 'react';

export interface BrainflyMarkProps {
  size?: number;
  animated?: boolean;
  className?: string;
}

export const BrainflyMark: React.FC<BrainflyMarkProps> = ({
  size = 28,
  animated = true,
  className = '',
}) => {
  return (
    <span
      className={`brainfly-mark ${animated ? 'brainfly-mark-animated' : ''} ${className}`}
      style={{ width: size, height: size }}
      aria-label="Brainfly Logo"
    >
      <svg
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-full drop-shadow-[0_0_8px_rgba(245,158,11,0.45)]"
      >
        {/* Left Wing */}
        <path
          className={animated ? 'brainfly-wing-l' : ''}
          d="M19 29C13 20 7 14 3 15c-1.5 1 1.2 5.8 4.2 9.8-3.2 1-2.2 4.8 2.8 5.8-3 2-1.8 5.8 7 4.2l2-5.8Z"
          fill="#fef3c7"
          fillOpacity="0.35"
          stroke="#fcd34d"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Right Wing */}
        <path
          className={animated ? 'brainfly-wing-r' : ''}
          d="M45 29C51 20 57 14 61 15c1.5 1-1.2 5.8-4.2 9.8 3.2 1 2.2 4.8-2.8 5.8 3 2 1.8 5.8-7 4.2l-2-5.8Z"
          fill="#fef3c7"
          fillOpacity="0.35"
          stroke="#fcd34d"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Left Hemisphere */}
        <path
          d="M30 16c-6.5-2.2-14.5 3-14.5 10.2 0 3.2-1 6.2 1.2 9.2.2 5.2 5.5 9.2 13.3 10.8V16Z"
          fill="#f59e0b"
          fillOpacity="0.25"
          stroke="#f59e0b"
          strokeWidth="2.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M23 21c-3.2 3.8-.2 7.2 4.2 8.2M18 31c3.2 1 6.2 4 8.2 8.2"
          stroke="#fbbf24"
          strokeWidth="2"
          strokeLinecap="round"
        />

        {/* Right Hemisphere */}
        <path
          d="M34 16c6.5-2.2 14.5 3 14.5 10.2 0 3.2 1 6.2-1.2 9.2-.2 5.2-5.5 9.2-13.3 10.8V16Z"
          fill="#f59e0b"
          fillOpacity="0.25"
          stroke="#f59e0b"
          strokeWidth="2.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M41 21c3.2 3.8.2 7.2-4.2 8.2M46 31c-3.2 1-6.2 4-8.2 8.2"
          stroke="#fbbf24"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
};
