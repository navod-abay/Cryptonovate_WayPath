import React, { useState } from 'react';
import { CommonHeader } from './CommonHeader';
import { VehicleCard, Vehicle } from './VehicleCard';

interface CompletedScreenProps {
  vehicles: Vehicle[];
  depot: string;
  dock: string;
  workerName: string;
  vehiclesBefore: number;
  cutoffTime: string;
  onView: (vehicleId: string) => void;
  onBack: () => void;
}

export function CompletedScreen({
  vehicles,
  depot,
  dock,
  workerName,
  vehiclesBefore,
  cutoffTime,
  onView,
  onBack,
}: CompletedScreenProps) {
  const [currentTime, setCurrentTime] = useState(
    new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
  );

  React.useEffect(() => {
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

        <button
          onClick={() => {}}
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

      {/* Vehicle List */}
      <div className="flex-1 overflow-y-auto px-4 md:px-6 py-4 space-y-3">
        {vehicles.map((vehicle) => (
          <div key={vehicle.id} className="flex items-center gap-2">
            <div className="flex-1">
              <VehicleCard
                vehicle={vehicle}
                onStartLoading={onView}
                actionLabel="View"
              />
            </div>
            <div className="flex flex-col gap-1">
              <button
                className="w-8 h-8 rounded-lg bg-slate-200 flex items-center justify-center
                           hover:bg-slate-300 active:bg-slate-400
                           transition-colors cursor-pointer"
                aria-label={`Move ${vehicle.id} up`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-600">
                  <polyline points="18 15 12 9 6 15" />
                </svg>
              </button>
              <button
                className="w-8 h-8 rounded-lg bg-slate-200 flex items-center justify-center
                           hover:bg-slate-300 active:bg-slate-400
                           transition-colors cursor-pointer"
                aria-label={`Move ${vehicle.id} down`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-600">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
