import React from 'react';

interface BackButtonProps {
  onClick: () => void;
}

export function BackButton({ onClick }: BackButtonProps) {
  return (
    <button
      onClick={onClick}
      className="w-24 h-14 rounded-xl bg-white flex items-center justify-center
                 hover:bg-slate-100 active:bg-slate-200
                 transition-colors cursor-pointer shadow-sm"
      aria-label="Back"
    >
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1a3a5c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="19" y1="12" x2="5" y2="12" />
        <polyline points="12 19 5 12 12 5" />
      </svg>
    </button>
  );
}
