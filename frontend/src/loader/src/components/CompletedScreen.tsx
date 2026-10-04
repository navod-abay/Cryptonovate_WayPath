import { useState, useRef, useCallback, useEffect } from 'react';
import { CommonHeader } from './CommonHeader';
import { VehicleCard, Vehicle } from './VehicleCard';
import { MoveUpDown } from './MoveUpDown';

interface CompletedScreenProps {
  vehicles: Vehicle[];
  isLoading?: boolean;
  depot: string;
  dock: string;
  workerName: string;
  vehiclesBefore: number;
  cutoffTime: string;
  onView: (vehicleId: string) => void;
  onBack: () => void;
  onNext?: () => void;
}

export function CompletedScreen({
  vehicles,
  isLoading,
  depot,
  dock,
  workerName,
  vehiclesBefore,
  cutoffTime,
  onView,
  onBack,
  onNext,
}: CompletedScreenProps) {
  const [currentTime, setCurrentTime] = useState(
    new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
  );
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleScrollUp = useCallback(() => {
    scrollRef.current?.scrollBy({ top: -200, behavior: 'smooth' });
  }, []);

  const handleScrollDown = useCallback(() => {
    scrollRef.current?.scrollBy({ top: 200, behavior: 'smooth' });
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(
        new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
      );
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="h-screen flex flex-col bg-slate-100">
      {/* Header */}
      <CommonHeader
        variant="queue"
        vehiclesBefore={vehiclesBefore}
        cutoffTime={cutoffTime}
        depot={depot}
        dock={dock}
        currentTime={currentTime}
        workerName={workerName}
      />

      {/* Navigation Bar */}
      <div className="flex items-center gap-2 md:gap-3 px-4 md:px-6 py-3 bg-white border-b border-slate-200">
        <button
          onClick={onBack}
          className="w-16 md:w-24 h-12 md:h-14 rounded-xl bg-slate-200 flex items-center justify-center
                     hover:bg-slate-300 active:bg-slate-400
                     transition-colors cursor-pointer shrink-0"
          aria-label="Back to Loading"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-600">
            <polyline points="11 17 6 12 11 7" />
            <polyline points="18 17 13 12 18 7" />
          </svg>
        </button>

        <div className="flex-1 flex justify-center">
          <button
            className="w-full py-3 bg-slate-400 text-white text-sm md:text-base font-semibold rounded-xl
                       hover:bg-slate-500 active:bg-slate-600
                       transition-colors cursor-pointer"
          >
            Completed
          </button>
        </div>

        <div className="flex flex-col gap-2">
          <button
            onClick={onNext}
            className="w-16 md:w-24 h-12 md:h-14 rounded-xl bg-slate-200 flex items-center justify-center
                       hover:bg-slate-300 active:bg-slate-400
                       transition-colors cursor-pointer shrink-0"
            aria-label="Next"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-600">
              <polyline points="13 17 18 12 13 7" />
              <polyline points="6 17 11 12 6 7" />
            </svg>
          </button>
        </div>
      </div>

      {/* Vehicle List + MoveUpDown */}
      <div className="flex-1 flex gap-2 px-4 md:px-6 py-4 overflow-hidden">
        {isLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="w-8 h-8 border-4 border-slate-300 border-t-[#1a3a5c] rounded-full animate-spin mx-auto mb-3" />
              <p className="text-sm text-slate-500">Loading vehicles...</p>
            </div>
          </div>
        ) : (
          <>
            <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-3">
              {vehicles.map((vehicle) => (
                <VehicleCard
                  key={vehicle.id}
                  vehicle={vehicle}
                  onStartLoading={onView}
                  actionLabel="View"
                />
              ))}
            </div>
            <MoveUpDown onMoveUp={handleScrollUp} onMoveDown={handleScrollDown} />
          </>
        )}
      </div>
    </div>
  );
}
