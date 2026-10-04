
interface VehicleQueueControlsProps {
  onMoveUp: () => void;
  onMoveDown: () => void;
  onPrev: () => void;
  onNext: () => void;
}

export function VehicleQueueControls({ onMoveUp, onMoveDown, onPrev, onNext }: VehicleQueueControlsProps) {
  return (
    <>
      {/* Left navigation */}
      <button
        onClick={onPrev}
        className="w-14 h-14 rounded-xl bg-slate-200 flex items-center justify-center
                   hover:bg-slate-300 active:bg-slate-400
                   transition-colors cursor-pointer"
        aria-label="Previous"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-600">
          <polyline points="11 17 6 12 11 7" />
          <polyline points="18 17 13 12 18 7" />
        </svg>
      </button>

      {/* Right navigation */}
      <button
        onClick={onNext}
        className="w-14 h-14 rounded-xl bg-slate-200 flex items-center justify-center
                   hover:bg-slate-300 active:bg-slate-400
                   transition-colors cursor-pointer"
        aria-label="Next"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-600">
          <polyline points="13 17 18 12 13 7" />
          <polyline points="6 17 11 12 6 7" />
        </svg>
      </button>

      {/* Right side: Move Up/Down */}
      <div className="flex flex-col gap-2">
        <button
          onClick={onMoveUp}
          className="w-14 h-14 rounded-xl bg-slate-200 flex flex-col items-center justify-center gap-0.5
                     hover:bg-slate-300 active:bg-slate-400
                     transition-colors cursor-pointer"
          aria-label="Move Up"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-600">
            <polyline points="18 15 12 9 6 15" />
          </svg>
          <span className="text-[9px] text-slate-600 font-medium">Move Up</span>
        </button>
        <button
          onClick={onMoveDown}
          className="w-14 h-14 rounded-xl bg-slate-200 flex flex-col items-center justify-center gap-0.5
                     hover:bg-slate-300 active:bg-slate-400
                     transition-colors cursor-pointer"
          aria-label="Move Down"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-600">
            <polyline points="6 9 12 15 18 9" />
          </svg>
          <span className="text-[9px] text-slate-600 font-medium">Move Down</span>
        </button>
      </div>
    </>
  );
}
