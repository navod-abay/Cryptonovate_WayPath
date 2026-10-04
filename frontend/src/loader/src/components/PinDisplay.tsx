import React from 'react';

interface PinDisplayProps {
  pin: string;
  maxLength?: number;
}

export function PinDisplay({ pin, maxLength = 4 }: PinDisplayProps) {
  return (
    <div className="flex items-center justify-center gap-3 bg-[#d4dce6] rounded-xl px-4 py-3 lg:px-6 lg:py-4 mb-4 lg:mb-8">
      {Array.from({ length: maxLength }).map((_, i) => (
        <span
          key={i}
          className={`text-2xl font-semibold tracking-widest ${
            i < pin.length ? 'text-slate-800' : 'text-slate-400'
          }`}
        >
          {i < pin.length ? pin[i] : 'X'}
        </span>
      ))}
    </div>
  );
}
