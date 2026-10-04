import { useState, useEffect } from 'react';
import { RedFlagIcon, DoubleTickIcon, AlertIcon } from './icons';
import { Vehicle } from './VehicleCard';
import { CommonHeader } from './CommonHeader';
import { getManifest, transformManifestToItems, reportShortfall, dispatchTrip, TripManifest } from '../api/executionApi';

interface LoadingItem {
  id: string;
  name: string;
  loaded: number;
  total: number;
  damaged: number;
}

interface LoadingDetailScreenProps {
  vehicle: Vehicle;
  outlets: string[];
  items: LoadingItem[];
  onBack: () => void;
  onFinish: (vehicleId: string) => void;
}

export function LoadingDetailScreen({
  vehicle,
  outlets,
  items: initialItems,
  onBack,
  onFinish,
}: LoadingDetailScreenProps) {
  const [activeOutlet, setActiveOutlet] = useState(0);
  const departMinutes = 39;
  const [items, setItems] = useState<LoadingItem[]>(initialItems || []);
  const [manifest, setManifest] = useState<TripManifest | null>(null);
  const [showDamageModal, setShowDamageModal] = useState(false);
  const [showMissingModal, setShowMissingModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState<LoadingItem | null>(null);
  const [damageCount, setDamageCount] = useState(1);
  const [, setIsLoading] = useState(false);
  const [, setError] = useState('');

  // Get outlets in loading sequence order from manifest stops
  const manifestStops = manifest?.stops || [];
  const sortedStops = [...manifestStops].sort((a, b) => a.loadingSequence - b.loadingSequence);
  const outletTabs = sortedStops.map((stop) => stop.outletId);

  // Get items for the currently selected outlet, merging with local state for damage updates
  const activeStop = sortedStops[activeOutlet];
  const outletItems = activeStop
    ? activeStop.items.map((item) => {
        const localItem = items.find((i) => i.id === item.sku);
        return {
          id: item.sku,
          name: item.sku,
          loaded: localItem?.loaded ?? 0,
          total: item.qty,
          damaged: localItem?.damaged ?? 0,
        };
      })
    : items;

  // Fetch manifest when vehicle changes
  useEffect(() => {
    if (vehicle) {
      setIsLoading(true);
      setError('');
      const tripId = `TRIP-${vehicle.id}`;
      console.log('[LoadingDetailScreen] Fetching manifest for tripId:', tripId);
      getManifest(tripId)
        .then((manifest) => {
          console.log('[LoadingDetailScreen] Manifest received:', manifest);
          setManifest(manifest);
          const items = transformManifestToItems(manifest);
          console.log('[LoadingDetailScreen] Transformed items:', items);
          setItems(items);
        })
        .catch((err) => {
          console.error('[LoadingDetailScreen] Failed to load manifest:', err);
          setError(err instanceof Error ? err.message : 'Failed to load manifest');
        })
        .finally(() => setIsLoading(false));
    }
  }, [vehicle]);

  const now = new Date();
  const timeString = now.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

  const handleFlagClick = () => {
    const allItems = outletItems.length > 0 ? outletItems : items;
    setSelectedItem(allItems[0] || null);
    setDamageCount(1);
    setShowDamageModal(true);
  };

  const handleItemSelect = (item: LoadingItem) => {
    setSelectedItem(item);
    setDamageCount(1);
    setShowDamageModal(true);
  };

  const handleConfirmDamage = async () => {
    if (!selectedItem) return;
    setIsLoading(true);
    try {
      const tripId = `TRIP-${vehicle.id}`;
      await reportShortfall(tripId, {
        order_ref: 'ORD-1001',
        sku: selectedItem.id,
        missing_qty: damageCount,
        damage_flag: true,
        notes: 'Damaged during loading',
      });
      setItems((prev) =>
        prev.map((item) =>
          item.id === selectedItem.id
            ? { ...item, damaged: item.damaged + damageCount }
            : item
        )
      );
      setShowDamageModal(false);
      setSelectedItem(null);
      setDamageCount(1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to report damage');
    } finally {
      setIsLoading(false);
    }
  };

  const incompleteItems = (outletItems.length > 0 ? outletItems : items).filter((item) => item.loaded < item.total);

  const handleFinishClick = () => {
    if (incompleteItems.length > 0) {
      setShowMissingModal(true);
    } else {
      onFinish(vehicle.id);
    }
  };

  const handleConfirmFinish = async () => {
    setIsLoading(true);
    try {
      const tripId = `TRIP-${vehicle.id}`;
      await dispatchTrip(tripId);
      setShowMissingModal(false);
      onFinish(vehicle.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to dispatch');
      setShowMissingModal(false);
    } finally {
      setIsLoading(false);
    }
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
          {outletTabs.map((outlet, i) => (
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
        </div>

        <button
          onClick={() => setActiveOutlet(Math.min(outlets.length - 1, activeOutlet + 1))}
          disabled={activeOutlet === outletTabs.length - 1}
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
      <div className="flex-1 flex flex-col md:flex-row gap-4 px-4 md:px-6 py-4 overflow-hidden">
        {/* Left: Scanner */}
        <div className="flex-1 flex flex-col gap-3">
          <div className="flex-1 min-h-[200px] bg-slate-300 rounded-xl overflow-hidden relative">
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-40 h-40 md:w-48 md:h-48 border-2 border-cyan-400 rounded-lg relative">
                <div className="absolute -top-0.5 -left-0.5 w-4 h-4 border-t-2 border-l-2 border-cyan-400" />
                <div className="absolute -top-0.5 -right-0.5 w-4 h-4 border-t-2 border-r-2 border-cyan-400" />
                <div className="absolute -bottom-0.5 -left-0.5 w-4 h-4 border-b-2 border-l-2 border-cyan-400" />
                <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 border-b-2 border-r-2 border-cyan-400" />
              </div>
            </div>
          </div>
          <button
            className="w-full py-3 bg-cyan-500 text-white text-sm md:text-base font-semibold rounded-xl
                       hover:bg-cyan-600 active:bg-cyan-700
                       transition-colors cursor-pointer"
          >
            Scan
          </button>
        </div>

        {/* Right: Items List */}
        <div className="w-full md:w-80 flex flex-col bg-white rounded-xl border-2 border-slate-300 overflow-hidden">
          <div className="flex-1 overflow-y-auto p-4 md:p-5">
            {(outletItems.length > 0 ? outletItems : items).map((item) => {
              const isComplete = item.loaded === item.total;
              const hasDamage = item.damaged > 0;
              return (
                <div
                  key={item.id}
                  onClick={() => handleItemSelect(item)}
                  className="flex items-center justify-between py-3 md:py-4 border-b-2 border-slate-300 last:border-0 cursor-pointer hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <span className={`text-sm md:text-base ${isComplete ? 'text-[#1a3a5c]' : 'text-slate-500'}`}>{item.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {isComplete && <DoubleTickIcon size={20} />}
                    {hasDamage && <AlertIcon size={20} />}
                    <span className={`text-sm md:text-base font-medium ${isComplete ? 'text-[#1a3a5c]' : 'text-slate-500'}`}>
                      {item.loaded}/{item.total}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Bottom Actions */}
          <div className="flex items-center justify-center gap-3 md:gap-4 p-4 md:p-5 border-t-2 border-slate-300">
            <button
              onClick={handleFlagClick}
              className="w-12 h-12 rounded-xl flex items-center justify-center
                         hover:bg-red-50 active:bg-red-100
                         transition-colors cursor-pointer"
              aria-label="Flag issue"
            >
              <RedFlagIcon size={48} />
            </button>
            <button
              onClick={handleFinishClick}
              className="flex-1 h-14 bg-[#1a3a5c] text-white text-sm md:text-base font-semibold rounded-xl
                         hover:bg-[#0f2a44] active:bg-[#0a1f33]
                         transition-colors cursor-pointer"
            >
              Finish
            </button>
          </div>
        </div>
      </div>

      {/* Damage Modal */}
      {showDamageModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-xl overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 pt-6 pb-4">
              <h3 className="text-xl font-bold text-[#FF334E]">Damaged Item !</h3>
              <button
                onClick={() => setShowDamageModal(false)}
                className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                aria-label="Close"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <div className="h-px bg-slate-200" />

            {/* Modal Body */}
            <div className="px-6 py-5">
              <p className="text-sm text-slate-600 mb-5">
                You are going to report a damaged item for the order list of{' '}
                <span className="font-bold text-slate-800">{outlets[activeOutlet]}</span>.
              </p>

              {selectedItem && (
                <div className="flex items-center justify-between py-3 border-b border-slate-200 mb-5">
                  <span className="text-base font-bold text-[#1a3a5c]">{selectedItem.name}</span>
                  <span className="text-base font-bold text-[#1a3a5c]">
                    {selectedItem.loaded}/{selectedItem.total}
                  </span>
                </div>
              )}

              {/* Damaged Quantity */}
              <div className="flex items-center justify-between mb-5">
                <span className="text-sm text-slate-600">Damaged Quantity</span>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setDamageCount(Math.max(1, damageCount - 1))}
                    className="w-12 h-12 rounded-xl border-2 border-slate-300 flex items-center justify-center
                               hover:border-slate-400 active:bg-slate-100
                               transition-colors cursor-pointer text-xl font-bold text-slate-600"
                  >
                    −
                  </button>
                  <span className="text-xl font-bold text-slate-800 w-8 text-center">{damageCount}</span>
                  <button
                    onClick={() => setDamageCount(damageCount + 1)}
                    className="w-12 h-12 rounded-xl border-2 border-slate-300 flex items-center justify-center
                               hover:border-slate-400 active:bg-slate-100
                               transition-colors cursor-pointer text-xl font-bold text-slate-600"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Add Photo */}
              <button
                className="w-full py-4 border-2 border-dashed border-slate-300 rounded-xl flex items-center justify-center gap-2
                           text-slate-500 text-sm font-medium hover:border-slate-400 hover:text-slate-600
                           transition-colors cursor-pointer mb-5"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                  <circle cx="12" cy="13" r="4" />
                </svg>
                Add Photo (Optional)
              </button>

              {/* Report Button */}
              <button
                onClick={handleConfirmDamage}
                className="w-full py-4 bg-[#1a3a5c] text-white text-base font-semibold rounded-xl
                           hover:bg-[#0f2a44] active:bg-[#0a1f33]
                           transition-colors cursor-pointer"
              >
                Report
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Missing Items Modal */}
      {showMissingModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-xl overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 pt-6 pb-4">
              <h3 className="text-xl font-bold text-[#FF334E]">Missing Items !</h3>
              <button
                onClick={() => setShowMissingModal(false)}
                className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                aria-label="Close"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <div className="h-px bg-slate-200" />

            {/* Modal Body */}
            <div className="px-6 py-5">
              <p className="text-sm text-slate-600 mb-5">
                Order list of <span className="font-bold text-slate-800">{outlets[activeOutlet]}</span> is not complete yet. Do you still want to finish loading?
              </p>

              <div className="mb-5">
                {incompleteItems.map((item) => (
                  <div key={item.id} className="flex items-center justify-between py-3 border-b border-slate-200 last:border-0">
                    <span className="text-base font-bold text-[#1a3a5c]">{item.name}</span>
                    <span className="text-base font-bold text-[#FF334E]">
                      {item.loaded}/{item.total}
                    </span>
                  </div>
                ))}
              </div>

              {/* Report & Finish Button */}
              <button
                onClick={handleConfirmFinish}
                className="w-full py-4 bg-[#1a3a5c] text-white text-base font-semibold rounded-xl
                           hover:bg-[#0f2a44] active:bg-[#0a1f33]
                           transition-colors cursor-pointer"
              >
                Report & Finish
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
