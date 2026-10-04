import { FormEvent, useCallback, useEffect, useState } from 'react';
import { RedFlagIcon, DoubleTickIcon, AlertIcon } from './icons';
import { Vehicle } from './VehicleCard';
import { CommonHeader } from './CommonHeader';
import { BarcodeScanner } from './BarcodeScanner';
import { getManifest, reportShortfall, scanUnit, ManifestLine, ManifestStop, TripManifest } from '../api/executionApi';
import { minutesUntil } from './departure';

interface LoadingDetailScreenProps {
  vehicle: Vehicle;
  workerName: string;
  onBack: () => void;
  onFinish: (outlets: string[]) => void; // the trip's outlets in loading order
  onShowLabels: () => void;
}

type Feedback = { tone: 'ok' | 'warn' | 'error'; text: string };
type Report = { line: ManifestLine; kind: 'missing' | 'damaged'; qty: number; notes: string };

const TONE_STYLE: Record<Feedback['tone'], string> = {
  ok: 'bg-emerald-50 text-emerald-700 border-emerald-300',
  warn: 'bg-amber-50 text-amber-700 border-amber-300',
  error: 'bg-red-50 text-red-700 border-red-300',
};

/** Short beep: high for a counted unit, low for a rejected one. */
function beep(ok: boolean) {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    osc.frequency.value = ok ? 1200 : 300;
    osc.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + (ok ? 0.08 : 0.25));
    osc.onended = () => void ctx.close();
  } catch {
    // no audio: the on-screen message is enough
  }
  navigator.vibrate?.(ok ? 40 : [80, 60, 80]);
}

const stopLabel = (stop: ManifestStop) => `${stop.outletId}${stop.temperature === 'chilled' ? ' ❄' : ''}`;

export function LoadingDetailScreen({ vehicle, workerName, onBack, onFinish, onShowLabels }: LoadingDetailScreenProps) {
  const [manifest, setManifest] = useState<TripManifest | null>(null);
  const [activeStop, setActiveStop] = useState(0);
  const [code, setCode] = useState('');
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [showMissingModal, setShowMissingModal] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const departMinutes = minutesUntil(vehicle.departureTime);

  const stops = manifest ? [...manifest.stops].sort((a, b) => a.loadingSequence - b.loadingSequence) : [];
  const stop = stops[activeStop];
  const outlets = [...new Set(stops.map((s) => s.outletId))];
  const openLines = stops.flatMap((s) => s.items.filter((l) => l.remaining > 0).map((line) => ({ stop: s, line })));
  const openUnits = openLines.reduce((n, o) => n + o.line.remaining, 0);

  const refresh = useCallback(
    () =>
      getManifest(vehicle.tripId)
        .then((m) => {
          setManifest(m);
          setError('');
          return m;
        })
        .catch((err) => {
          setError(err instanceof Error ? err.message : 'Failed to load manifest');
          return null;
        }),
    [vehicle.tripId]
  );

  useEffect(() => {
    setIsLoading(true);
    refresh().finally(() => setIsLoading(false));
  }, [refresh]);

  const handleCode = useCallback(
    async (barcode: string) => {
      try {
        const scan = await scanUnit(vehicle.tripId, barcode);
        const { line } = scan;
        const where = `${line.description} ${line.scanned}/${line.qty} · ${scan.outletId}`;
        if (scan.status === 'duplicate') {
          beep(false);
          setFeedback({ tone: 'warn', text: `Already scanned: unit ${scan.unit} of ${where}` });
        } else {
          beep(true);
          setFeedback({
            tone: 'ok',
            text: scan.order.loaded ? `✓ ${where}. Order ${scan.orderRef} is loaded.` : `✓ ${where}`,
          });
        }
        // Show the order the unit belongs to.
        const m = await refresh();
        const i = m ? [...m.stops].sort((a, b) => a.loadingSequence - b.loadingSequence).findIndex((s) => s.orderRef === scan.orderRef) : -1;
        if (i >= 0) setActiveStop(i);
      } catch (err) {
        beep(false);
        setFeedback({ tone: 'error', text: err instanceof Error ? err.message : 'Scan failed' });
      }
    },
    [vehicle.tripId, refresh]
  );

  const handleManualSubmit = (e: FormEvent) => {
    e.preventDefault();
    const value = code.trim();
    if (!value) return;
    setCode('');
    void handleCode(value);
  };

  const openReport = (line?: ManifestLine) => {
    const target = line ?? stop?.items.find((l) => l.remaining > 0);
    if (!target) {
      setFeedback({ tone: 'warn', text: 'Every unit of this order is already scanned or reported.' });
      return;
    }
    setReport({ line: target, kind: 'damaged', qty: 1, notes: '' });
  };

  const handleConfirmReport = async () => {
    if (!report || !stop) return;
    setIsLoading(true);
    try {
      const result = await reportShortfall(vehicle.tripId, {
        orderRef: stop.orderRef,
        sku: report.line.sku,
        missingQty: report.qty,
        damageFlag: report.kind === 'damaged',
        notes: report.notes.trim() || undefined,
      });
      setFeedback({
        tone: 'warn',
        text:
          `Reported ${report.qty} × ${report.line.description} ${report.kind}. The dispatcher and ${stop.outletId} have been notified.` +
          (result.order.loaded ? ` Order ${stop.orderRef} is loaded.` : ''),
      });
      setReport(null);
      await refresh();
    } catch (err) {
      setFeedback({ tone: 'error', text: err instanceof Error ? err.message : 'Failed to report' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleFinishClick = () => {
    if (openUnits > 0) setShowMissingModal(true);
    else onFinish(outlets);
  };

  /** Everything not scanned yet is reported missing, then the final check. */
  const handleConfirmFinish = async () => {
    setIsLoading(true);
    try {
      for (const { stop: s, line } of openLines) {
        await reportShortfall(vehicle.tripId, {
          orderRef: s.orderRef,
          sku: line.sku,
          missingQty: line.remaining,
          damageFlag: false,
          notes: 'Not found at loading',
        });
      }
      setShowMissingModal(false);
      onFinish(outlets);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to report missing items');
      setShowMissingModal(false);
      await refresh();
    } finally {
      setIsLoading(false);
    }
  };

  const timeString = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

  return (
    <div className="h-screen flex flex-col bg-slate-100">
      {/* Header */}
      <CommonHeader
        variant="detail"
        vehicle={vehicle}
        departMinutes={departMinutes}
        currentTime={timeString}
        workerName={workerName}
        onBack={onBack}
      />

      {(error || (isLoading && !manifest)) && (
        <p className={`px-6 py-2 text-sm ${error ? 'bg-red-50 text-red-600' : 'text-slate-500'}`}>
          {error || 'Loading manifest…'}
        </p>
      )}

      {/* Order tabs, in loading order (last delivery first) */}
      <div className="flex items-center gap-2 md:gap-3 px-4 md:px-6 py-3 bg-white border-b border-slate-200">
        <button
          onClick={() => setActiveStop(Math.max(0, activeStop - 1))}
          disabled={activeStop === 0}
          className="w-16 md:w-24 h-12 md:h-14 rounded-xl bg-slate-200 flex items-center justify-center
                     hover:bg-slate-300 active:bg-slate-400
                     disabled:opacity-30 disabled:cursor-not-allowed
                     transition-colors cursor-pointer shrink-0"
          aria-label="Previous order"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-600">
            <polyline points="11 17 6 12 11 7" />
            <polyline points="18 17 13 12 18 7" />
          </svg>
        </button>

        <div className="flex-1 flex items-center gap-4 px-2 md:px-4 overflow-x-auto">
          {stops.map((s, i) => (
            <button
              key={s.orderRef}
              onClick={() => setActiveStop(i)}
              title={s.orderRef}
              className={`shrink-0 text-xs md:text-sm font-semibold pb-1 border-b-2 transition-colors cursor-pointer flex items-center gap-1
                ${i === activeStop
                  ? 'text-[#1a3a5c] border-[#1a3a5c]'
                  : 'text-slate-400 border-transparent hover:text-slate-600'
                }`}
            >
              {stopLabel(s)}
              {s.loaded && <DoubleTickIcon size={16} />}
            </button>
          ))}
        </div>

        <button
          onClick={() => setActiveStop(Math.min(stops.length - 1, activeStop + 1))}
          disabled={activeStop >= stops.length - 1}
          className="w-16 md:w-24 h-12 md:h-14 rounded-xl bg-slate-200 flex items-center justify-center
                     hover:bg-slate-300 active:bg-slate-400
                     disabled:opacity-30 disabled:cursor-not-allowed
                     transition-colors cursor-pointer shrink-0"
          aria-label="Next order"
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
        <div className="flex-1 flex flex-col gap-3 min-h-0">
          <div className="flex-1 min-h-[200px] bg-slate-300 rounded-xl overflow-hidden relative">
            {/* The camera scans from the moment the page opens. */}
            <BarcodeScanner active onDetected={(c) => void handleCode(c)} />
          </div>

          {feedback && (
            <p role="status" className={`border rounded-xl px-4 py-2.5 text-sm font-medium ${TONE_STYLE[feedback.tone]}`}>
              {feedback.text}
            </p>
          )}

          {/* Handheld scanners type the code and press Enter; it also works for typing a code by hand. */}
          <form onSubmit={handleManualSubmit} className="flex gap-2">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Scan or type a label, e.g. ORD-…|SKU|1"
              aria-label="Unit label"
              className="flex-1 min-w-0 px-4 py-3 rounded-xl border-2 border-slate-300 text-sm font-mono focus:border-cyan-500 outline-none"
            />
            <button
              type="submit"
              className="px-4 py-3 rounded-xl bg-slate-200 text-slate-700 text-sm font-semibold hover:bg-slate-300 cursor-pointer"
            >
              Add
            </button>
          </form>

          <button
            onClick={onShowLabels}
            className="self-end px-4 py-3 rounded-xl border-2 border-slate-300 text-slate-600 text-sm font-semibold hover:bg-white cursor-pointer"
          >
            Labels
          </button>
        </div>

        {/* Right: Items of the selected order */}
        <div className="w-full md:w-80 flex flex-col bg-white rounded-xl border-2 border-slate-300 overflow-hidden">
          {stop && (
            <div className="px-4 md:px-5 pt-3 text-xs text-slate-500">
              {stop.orderRef} · {stop.temperature} · {stop.loaded ? 'loaded' : stop.complete ? 'nothing scanned' : 'loading'}
            </div>
          )}
          <div className="flex-1 overflow-y-auto p-4 md:p-5 pt-2">
            {stop?.items.map((item) => {
              const isComplete = item.remaining === 0;
              const short = item.missing + item.damaged;
              return (
                <div
                  key={item.sku}
                  onClick={() => item.remaining > 0 && openReport(item)}
                  className={`flex items-center justify-between py-3 md:py-4 border-b-2 border-slate-300 last:border-0 transition-colors
                    ${item.remaining > 0 ? 'cursor-pointer hover:bg-slate-50' : ''}`}
                >
                  <div className="flex flex-col">
                    <span className={`text-sm md:text-base ${isComplete ? 'text-[#1a3a5c]' : 'text-slate-500'}`}>{item.description}</span>
                    {short > 0 && (
                      <span className="text-xs text-[#FF334E]">
                        {[item.missing && `${item.missing} missing`, item.damaged && `${item.damaged} damaged`].filter(Boolean).join(', ')}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {isComplete && <DoubleTickIcon size={20} />}
                    {short > 0 && <AlertIcon size={20} />}
                    <span className={`text-sm md:text-base font-medium ${isComplete ? 'text-[#1a3a5c]' : 'text-slate-500'}`}>
                      {item.scanned}/{item.qty}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Bottom Actions */}
          <div className="flex items-center justify-center gap-3 md:gap-4 p-4 md:p-5 border-t-2 border-slate-300">
            <button
              onClick={() => openReport()}
              className="w-12 h-12 rounded-xl flex items-center justify-center
                         hover:bg-red-50 active:bg-red-100
                         transition-colors cursor-pointer"
              aria-label="Report missing or damaged items"
            >
              <RedFlagIcon size={48} />
            </button>
            <button
              onClick={handleFinishClick}
              disabled={!manifest}
              className="flex-1 h-14 bg-[#1a3a5c] text-white text-sm md:text-base font-semibold rounded-xl
                         hover:bg-[#0f2a44] active:bg-[#0a1f33] disabled:opacity-50
                         transition-colors cursor-pointer"
            >
              Finish{openUnits > 0 ? ` (${openUnits} left)` : ''}
            </button>
          </div>
        </div>
      </div>

      {/* Missing / Damaged report */}
      {report && stop && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-xl overflow-hidden">
            <div className="flex items-center justify-between px-6 pt-6 pb-4">
              <h3 className="text-xl font-bold text-[#FF334E]">Report items !</h3>
              <button
                onClick={() => setReport(null)}
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

            <div className="px-6 py-5">
              <p className="text-sm text-slate-600 mb-4">
                Units that will not be loaded for <span className="font-bold text-slate-800">{stop.outletId}</span> ({stop.orderRef}).
                The dispatcher and the store manager are notified.
              </p>

              {/* Missing or damaged */}
              <div className="grid grid-cols-2 gap-2 mb-4">
                {(['missing', 'damaged'] as const).map((kind) => (
                  <button
                    key={kind}
                    onClick={() => setReport({ ...report, kind })}
                    className={`py-2.5 rounded-xl border-2 text-sm font-semibold capitalize cursor-pointer
                      ${report.kind === kind ? 'border-[#1a3a5c] bg-[#1a3a5c] text-white' : 'border-slate-300 text-slate-600'}`}
                  >
                    {kind}
                  </button>
                ))}
              </div>

              <label className="block text-sm text-slate-600 mb-1" htmlFor="report-item">Item</label>
              <select
                id="report-item"
                value={report.line.sku}
                onChange={(e) => {
                  const line = stop.items.find((l) => l.sku === e.target.value);
                  if (line) setReport({ ...report, line, qty: 1 });
                }}
                className="w-full mb-4 px-3 py-2.5 rounded-xl border-2 border-slate-300 text-sm"
              >
                {stop.items.filter((l) => l.remaining > 0).map((l) => (
                  <option key={l.sku} value={l.sku}>
                    {l.description} ({l.remaining} not scanned)
                  </option>
                ))}
              </select>

              <div className="flex items-center justify-between mb-4">
                <span className="text-sm text-slate-600">
                  Quantity <span className="text-slate-400">(max {report.line.remaining})</span>
                </span>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setReport({ ...report, qty: Math.max(1, report.qty - 1) })}
                    className="w-12 h-12 rounded-xl border-2 border-slate-300 flex items-center justify-center
                               hover:border-slate-400 active:bg-slate-100
                               transition-colors cursor-pointer text-xl font-bold text-slate-600"
                  >
                    −
                  </button>
                  {/* Typed, or stepped with − / +; never more than the units not yet scanned or reported. */}
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={report.line.remaining}
                    value={report.qty || ''}
                    onChange={(e) => {
                      const n = parseInt(e.target.value, 10);
                      setReport({ ...report, qty: Number.isNaN(n) ? 0 : Math.min(Math.max(n, 0), report.line.remaining) });
                    }}
                    onBlur={() => report.qty < 1 && setReport({ ...report, qty: 1 })}
                    aria-label="Quantity"
                    className="w-16 h-12 rounded-xl border-2 border-slate-300 text-xl font-bold text-slate-800 text-center
                               focus:border-cyan-500 outline-none [appearance:textfield]
                               [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                  />
                  <button
                    onClick={() => setReport({ ...report, qty: Math.min(report.line.remaining, report.qty + 1) })}
                    className="w-12 h-12 rounded-xl border-2 border-slate-300 flex items-center justify-center
                               hover:border-slate-400 active:bg-slate-100
                               transition-colors cursor-pointer text-xl font-bold text-slate-600"
                  >
                    +
                  </button>
                </div>
              </div>

              <textarea
                value={report.notes}
                onChange={(e) => setReport({ ...report, notes: e.target.value })}
                placeholder="Note (optional)"
                maxLength={500}
                rows={2}
                className="w-full mb-5 px-3 py-2 rounded-xl border-2 border-slate-300 text-sm"
              />

              <button
                onClick={handleConfirmReport}
                disabled={isLoading || report.qty < 1}
                className="w-full py-4 bg-[#1a3a5c] text-white text-base font-semibold rounded-xl
                           hover:bg-[#0f2a44] active:bg-[#0a1f33] disabled:opacity-50
                           transition-colors cursor-pointer"
              >
                {isLoading ? 'Reporting…' : `Report ${report.qty} ${report.kind}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Units not scanned yet */}
      {showMissingModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-xl overflow-hidden">
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

            <div className="px-6 py-5">
              <p className="text-sm text-slate-600 mb-4">
                {openUnits} unit(s) are not scanned yet. Report them as missing and continue? The dispatcher and the
                store managers are notified.
              </p>

              <div className="mb-5 max-h-64 overflow-y-auto">
                {openLines.map(({ stop: s, line }) => (
                  <div key={`${s.orderRef}-${line.sku}`} className="flex items-center justify-between py-2.5 border-b border-slate-200 last:border-0">
                    <span className="text-sm font-bold text-[#1a3a5c]">
                      {stopLabel(s)} · {line.description}
                    </span>
                    <span className="text-sm font-bold text-[#FF334E]">{line.remaining} missing</span>
                  </div>
                ))}
              </div>

              <button
                onClick={handleConfirmFinish}
                disabled={isLoading}
                className="w-full py-4 bg-[#1a3a5c] text-white text-base font-semibold rounded-xl
                           hover:bg-[#0f2a44] active:bg-[#0a1f33] disabled:opacity-50
                           transition-colors cursor-pointer"
              >
                {isLoading ? 'Reporting…' : 'Report & Finish'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
