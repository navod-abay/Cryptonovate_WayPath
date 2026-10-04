
interface NumericKeypadProps {
  onKeyPress: (key: string) => void;
  onClear: () => void;
  onBackspace: () => void;
}

export function NumericKeypad({ onKeyPress, onClear, onBackspace }: NumericKeypadProps) {
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

  return (
    <div className="grid grid-cols-3 gap-3">
      {keys.map((key) => (
        <button
          key={key}
          onClick={() => onKeyPress(key)}
          className="h-12 lg:h-16 rounded-xl border-2 border-[#1a3a5c] text-[#1a3a5c] text-lg lg:text-xl font-semibold
                     hover:bg-[#1a3a5c] hover:text-white
                     active:bg-[#0f2a44] active:border-[#0f2a44]
                     transition-all duration-150 cursor-pointer"
        >
          {key}
        </button>
      ))}

      {/* Bottom row: Clear, 0, Backspace */}
      <button
        onClick={onClear}
        className="h-12 lg:h-16 rounded-xl border-2 border-[#1a3a5c] text-[#1a3a5c] text-xs lg:text-sm font-medium
                   hover:bg-[#1a3a5c] hover:text-white
                   active:bg-[#0f2a44] active:border-[#0f2a44]
                   transition-all duration-150 cursor-pointer"
      >
        Clear
      </button>

      <button
        onClick={() => onKeyPress('0')}
        className="h-12 lg:h-16 rounded-xl border-2 border-[#1a3a5c] text-[#1a3a5c] text-lg lg:text-xl font-semibold
                   hover:bg-[#1a3a5c] hover:text-white
                   active:bg-[#0f2a44] active:border-[#0f2a44]
                   transition-all duration-150 cursor-pointer"
      >
        0
      </button>

      <button
        onClick={onBackspace}
        className="h-12 lg:h-16 rounded-xl border-2 border-[#1a3a5c] text-[#1a3a5c] text-lg lg:text-xl font-semibold
                   hover:bg-[#1a3a5c] hover:text-white
                   active:bg-[#0f2a44] active:border-[#0f2a44]
                   transition-all duration-150 cursor-pointer flex items-center justify-center"
        aria-label="Backspace"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z" />
          <line x1="18" y1="9" x2="12" y2="15" />
          <line x1="12" y1="9" x2="18" y2="15" />
        </svg>
      </button>
    </div>
  );
}
