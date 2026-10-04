import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { getManifest, TripManifest, unitLabel } from '../api/executionApi';
import { BackButton } from './BackButton';

interface LabelSheetProps {
  tripId: string;
  onBack: () => void;
}

/** One unit's label: its QR code (the text <orderRef>|<sku>|<unit>) with the text printed under it. */
function UnitLabel({ value, caption }: { value: string; caption: string }) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    QRCode.toDataURL(value, { errorCorrectionLevel: 'M', margin: 2, width: 240 })
      .then(setSrc)
      .catch(() => setSrc(''));
  }, [value]);
  return (
    <div className="border border-slate-300 rounded-md p-2 flex flex-col items-center break-inside-avoid bg-white">
      {src ? <img src={src} alt={value} className="w-32 h-32" /> : <div className="w-32 h-32" />}
      <span className="text-[10px] font-mono text-slate-700 text-center break-all">{value}</span>
      <span className="text-[10px] text-slate-500 text-center">{caption}</span>
    </div>
  );
}

/**
 * One QR label per unit of every order on the trip, in loading order, to print and stick on the
 * goods (or show on another screen) for the scanner.
 */
export function LabelSheet({ tripId, onBack }: LabelSheetProps) {
  const [manifest, setManifest] = useState<TripManifest | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    getManifest(tripId)
      .then(setManifest)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load the manifest'));
  }, [tripId]);

  const units = manifest?.stops.reduce((n, s) => n + s.items.reduce((m, l) => m + l.qty, 0), 0) ?? 0;

  return (
    <div className="min-h-screen bg-slate-100 print:bg-white">
      <div className="bg-[#1a3a5c] text-white px-6 h-[72px] flex items-center justify-between print:hidden">
        <div className="flex items-center gap-4">
          <BackButton onClick={onBack} />
          <div>
            <p className="font-bold">Unit labels · {manifest?.vehicleId ?? tripId}</p>
            <p className="text-xs text-blue-200/80">{manifest ? `${units} labels, ${manifest.stops.length} orders` : 'Loading…'}</p>
          </div>
        </div>
        <button
          onClick={() => window.print()}
          disabled={!manifest}
          className="px-5 py-2.5 bg-white text-[#1a3a5c] font-semibold rounded-xl hover:bg-slate-100 disabled:opacity-50 cursor-pointer"
        >
          Print
        </button>
      </div>

      {error && <p className="px-6 py-3 text-red-600">{error}</p>}

      <div className="p-6 print:p-0 space-y-6">
        {manifest?.stops.map((stop) => (
          <section key={stop.orderRef} className="break-inside-avoid-page">
            <h2 className="font-bold text-[#1a3a5c] mb-2">
              {stop.outletId} · {stop.orderRef} · {stop.temperature} · loads {stop.loadingSequence} of {manifest.stops.length}
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 print:grid-cols-4 gap-2">
              {stop.items.flatMap((line) =>
                Array.from({ length: line.qty }, (_, i) => (
                  <UnitLabel
                    key={`${line.sku}-${i + 1}`}
                    value={unitLabel(stop.orderRef, line.sku, i + 1)}
                    caption={`${stop.outletId} · ${line.description} · ${i + 1}/${line.qty}`}
                  />
                ))
              )}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
