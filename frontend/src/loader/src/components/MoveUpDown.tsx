import React from 'react';

interface MoveUpDownProps {
  onMoveUp: () => void;
  onMoveDown: () => void;
  disableUp?: boolean;
  disableDown?: boolean;
}

export function MoveUpDown({ onMoveUp, onMoveDown, disableUp, disableDown }: MoveUpDownProps) {
  return (
    <div className="w-16 md:w-24 rounded-xl bg-slate-200 flex flex-col items-center justify-between py-4 h-[252px]">
      <button
        onClick={onMoveUp}
        disabled={disableUp}
        className="flex flex-col items-center gap-1
                   disabled:opacity-30 disabled:cursor-not-allowed
                   transition-colors cursor-pointer"
        aria-label="Move Up"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-600">
          <polyline points="18 15 12 9 6 15" />
          <polyline points="18 21 12 15 6 21" />
        </svg>
        <span className="text-[10px] text-slate-600 font-medium">Move Up</span>
      </button>
      <button
        onClick={onMoveDown}
        disabled={disableDown}
        className="flex flex-col items-center gap-1
                   disabled:opacity-30 disabled:cursor-not-allowed
                   transition-colors cursor-pointer"
        aria-label="Move Down"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-600">
          <polyline points="6 9 12 15 18 9" />
          <polyline points="6 15 12 21 18 15" />
        </svg>
        <span className="text-[10px] text-slate-600 font-medium">Move Down</span>
      </button>
    </div>
  );
}
