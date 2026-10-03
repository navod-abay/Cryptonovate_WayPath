import React, { useState, useCallback } from 'react';
import { LoaderInfoPanel } from './LoaderInfoPanel';
import { PinDisplay } from './PinDisplay';
import { NumericKeypad } from './NumericKeypad';

interface LoaderPinEntryProps {
  onSuccess?: (pin: string) => void;
  depot?: string;
  dock?: string;
  vehiclesBefore?: number;
  cutoffTime?: string;
  maxPinLength?: number;
}

export function LoaderPinEntry({
  onSuccess,
  depot,
  dock,
  vehiclesBefore,
  cutoffTime,
  maxPinLength = 4,
}: LoaderPinEntryProps) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleKeyPress = useCallback(
    (key: string) => {
      if (pin.length >= maxPinLength) return;
      setError('');
      setPin((prev) => prev + key);
    },
    [pin, maxPinLength]
  );

  const handleClear = useCallback(() => {
    setPin('');
    setError('');
  }, []);

  const handleBackspace = useCallback(() => {
    setPin((prev) => prev.slice(0, -1));
    setError('');
  }, []);

  React.useEffect(() => {
    if (pin.length === maxPinLength) {
      const timer = setTimeout(() => {
        setSuccess(true);
        onSuccess?.(pin);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [pin, maxPinLength, onSuccess]);

  return (
    <div className="flex flex-col md:flex-row min-h-screen">
      {/* Left Info Panel */}
      <LoaderInfoPanel
        depot={depot}
        dock={dock}
        vehiclesBefore={vehiclesBefore}
        cutoffTime={cutoffTime}
      />

      {/* Right PIN Entry Panel */}
      <div className="flex-1 flex flex-col items-center justify-center p-4 md:p-8 bg-white">
        <div className="w-full max-w-[280px] md:max-w-sm">
          <h2 className="text-xl md:text-2xl font-bold text-slate-800 text-center mb-4 md:mb-6">
            Enter your PIN
          </h2>

          <PinDisplay pin={pin} maxLength={maxPinLength} />

          {error && (
            <p className="text-red-500 text-sm text-center mb-4">{error}</p>
          )}

          {success && (
            <p className="text-green-600 text-sm text-center mb-4 font-medium">
              PIN verified successfully!
            </p>
          )}

          <NumericKeypad
            onKeyPress={handleKeyPress}
            onClear={handleClear}
            onBackspace={handleBackspace}
          />
        </div>
      </div>
    </div>
  );
}
