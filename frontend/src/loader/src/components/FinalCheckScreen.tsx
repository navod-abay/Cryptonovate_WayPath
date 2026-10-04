import { useState } from 'react';
import { TickIcon, ContainerIcon } from './icons';
import { Vehicle } from './VehicleCard';
import { CommonHeader } from './CommonHeader';
import { dispatchTrip } from '../api/executionApi';
import truckIllustration from './icons/TruckIllustration.png';

interface FinalCheckScreenProps {
  vehicle: Vehicle;
  outlets: string[];
  onBack: () => void;
  onRelease: (vehicleId: string) => void;
}

const checklistItems = [
  'Reefer unit running',
  'Doors sealed',
  'Handovered Run sheet',
];

export function FinalCheckScreen({
  vehicle,
  outlets,
  onBack,
  onRelease,
}: FinalCheckScreenProps) {
  const [activeOutlet, setActiveOutlet] = useState(outlets.length); // Container icon selected by default
  const departMinutes = 5;
  const [checkedItems, setCheckedItems] = useState<boolean[]>([true, true, true]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const now = new Date();
  const timeString = now.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

  const allChecked = checkedItems.every(Boolean);

  const handleRelease = async () => {
    if (!allChecked) return;
    setIsLoading(true);
    setError('');
    try {
      const tripId = `TRIP-${vehicle.id}`;
      await dispatchTrip(tripId);
      onRelease(vehicle.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to release vehicle');
    } finally {
      setIsLoading(false);
    }
  };

  const toggleItem = (index: number) => {
    setCheckedItems((prev) =>
      prev.map((checked, i) => (i === index ? !checked : checked))
    );
  };

  return (
    <div className="h-screen flex flex-col bg-slate-100">
      {/* Header */}
      <CommonHeader
        variant="detail"
        vehicle={vehicle}
        departMinutes={departMinutes}
        currentTime={timeString}
        workerName="Thilak S."
        onBack={onBack}
      />

      {/* Outlet Tabs */}
      <div className="flex items-center gap-2 md:gap-3 px-4 md:px-6 py-3 bg-white border-b border-slate-200">
        <button
          onClick={() => setActiveOutlet(Math.max(0, activeOutlet - 1))}
          disabled={activeOutlet === 0}
          className="w-16 md:w-24 h-12 md:h-14 rounded-xl bg-slate-200 flex items-center justify-center
                     hover:bg-slate-300 active:bg-slate-400
                     disabled:opacity-30 disabled:cursor-not-allowed
                     transition-colors cursor-pointer shrink-0"
          aria-label="Previous outlet"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-600">
            <polyline points="11 17 6 12 11 7" />
            <polyline points="18 17 13 12 18 7" />
          </svg>
        </button>

        <div className="flex-1 flex items-center justify-between px-4 md:px-6">
          {outlets.map((outlet, i) => (
            <button
              key={outlet}
              onClick={() => setActiveOutlet(i)}
              className={`text-xs md:text-sm font-semibold pb-1 border-b-2 transition-colors cursor-pointer
                ${i === activeOutlet
                  ? 'text-[#1a3a5c] border-[#1a3a5c]'
                  : 'text-slate-400 border-transparent hover:text-slate-600'
                }`}
            >
              {outlet}
            </button>
          ))}
          {/* Container Icon Tab */}
          <button
            onClick={() => setActiveOutlet(outlets.length)}
            className={`pb-1 border-b-2 transition-colors cursor-pointer
              ${activeOutlet === outlets.length
                ? 'text-[#1a3a5c] border-[#1a3a5c]'
                : 'text-slate-400 border-transparent hover:text-slate-600'
              }`}
            aria-label="Container"
          >
            <ContainerIcon size={24} />
          </button>
        </div>

        <button
          onClick={() => setActiveOutlet(Math.min(outlets.length - 1, activeOutlet + 1))}
          disabled={activeOutlet === outlets.length - 1}
          className="w-16 md:w-24 h-12 md:h-14 rounded-xl bg-slate-200 flex items-center justify-center
                     hover:bg-slate-300 active:bg-slate-400
                     disabled:opacity-30 disabled:cursor-not-allowed
                     transition-colors cursor-pointer shrink-0"
          aria-label="Next outlet"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-600">
            <polyline points="13 17 18 12 13 7" />
            <polyline points="6 17 11 12 6 7" />
          </svg>
        </button>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col px-4 md:px-6 py-6 overflow-hidden">
        <div className="flex-1 flex flex-col bg-white rounded-2xl border border-slate-200 p-6 md:p-8">
          <div className="flex-1 flex flex-col md:flex-row gap-6">
            {/* Left: Final Check */}
            <div className="flex-1 flex flex-col">
              <h2 className="text-xl md:text-2xl font-bold text-[#1a3a5c] mb-6">Final Checks</h2>

              <div className="space-y-4">
                {checklistItems.map((item, index) => (
                  <button
                    key={item}
                    onClick={() => toggleItem(index)}
                    className="flex items-center gap-3 w-full text-left cursor-pointer group"
                  >
                    <div className="w-8 h-8 flex items-center justify-center transition-colors">
                      {checkedItems[index] && <TickIcon size={24} />}
                    </div>
                    <span className={`text-sm md:text-base ${checkedItems[index] ? 'text-[#1a3a5c]' : 'text-slate-500'}`}>
                      {item}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Right: Truck Illustration */}
            <div className="flex-1 flex items-center justify-center">
              <img
                src={truckIllustration}
                alt="Truck Illustration"
                className="w-full max-w-md h-auto"
              />
            </div>
          </div>

          {/* Release Button */}
          <div className="mt-8 pt-6 border-t border-slate-200">
            <button
              onClick={handleRelease}
              disabled={!allChecked || isLoading}
              className="w-full py-4 bg-[#1a3a5c] text-white text-base font-semibold rounded-xl
                         hover:bg-[#0f2a44] active:bg-[#0a1f33]
                         disabled:opacity-50 disabled:cursor-not-allowed
                         transition-colors cursor-pointer"
            >
              {isLoading ? 'Releasing...' : 'Release Vehicle'}
            </button>
            {error && (
              <p className="text-red-500 text-sm text-center mt-3">{error}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
