import { useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader, IScannerControls } from '@zxing/browser';
import { BarcodeFormat, DecodeHintType } from '@zxing/library';

interface BarcodeScannerProps {
  /** Camera on while true. */
  active: boolean;
  onDetected: (code: string) => void;
}

/**
 * Unit labels are printed as QR codes, which a phone or laptop camera reads at almost any distance
 * and angle; Code 128 is accepted too (handheld laser scanners, older labels), but a ~30-character
 * Code 128 has ~330 thin bars and needs a sharp frame. So ask for 1080p with continuous autofocus
 * (the browser default is often 640x480). zxing reads the whole frame; the aiming box is a guide.
 */
const CAMERA: MediaStreamConstraints = {
  video: {
    facingMode: 'environment',
    width: { ideal: 1920 },
    height: { ideal: 1080 },
    advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet],
  },
};

/** The camera keeps seeing a label while it is in view; the same code counts again after this. */
const REPEAT_AFTER_MS = 2500;

function cameraError(err: unknown): string {
  if (!window.isSecureContext) return 'The camera needs HTTPS (or localhost). Type the code below instead.';
  const name = err instanceof Error ? err.name : '';
  if (name === 'NotAllowedError') return 'Camera access was denied. Allow it in the browser, or type the code below.';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'No camera found. Type the code below instead.';
  return `Camera unavailable: ${err instanceof Error ? err.message : String(err)}`;
}

/** Live camera view that reads unit labels (QR code or Code 128). */
export function BarcodeScanner({ active, onDetected }: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const onDetectedRef = useRef(onDetected);
  const last = useRef({ code: '', at: 0 });
  const [error, setError] = useState('');
  onDetectedRef.current = onDetected;

  useEffect(() => {
    if (!active || !videoRef.current) return;
    setError('');
    const hints = new Map<DecodeHintType, unknown>([
      [DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.QR_CODE, BarcodeFormat.CODE_128]],
      [DecodeHintType.TRY_HARDER, true],
    ]);
    const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 150 });
    let controls: IScannerControls | undefined;
    let cancelled = false;
    reader
      .decodeFromConstraints(CAMERA, videoRef.current, (result) => {
        if (!result) return;
        const code = result.getText();
        const now = Date.now();
        if (code === last.current.code && now - last.current.at < REPEAT_AFTER_MS) return;
        last.current = { code, at: now };
        onDetectedRef.current(code);
      })
      .then((c) => {
        if (cancelled) c.stop();
        else controls = c;
      })
      .catch((err) => setError(cameraError(err)));
    return () => {
      cancelled = true;
      controls?.stop();
    };
  }, [active]);

  return (
    <div className="absolute inset-0">
      <video
        ref={videoRef}
        className={`w-full h-full object-cover ${active && !error ? '' : 'hidden'}`}
        muted
        playsInline
      />
      {/* Aiming frame */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="w-3/5 max-w-xs aspect-square border-2 border-cyan-400 rounded-lg relative">
          <div className="absolute -top-0.5 -left-0.5 w-4 h-4 border-t-2 border-l-2 border-cyan-400" />
          <div className="absolute -top-0.5 -right-0.5 w-4 h-4 border-t-2 border-r-2 border-cyan-400" />
          <div className="absolute -bottom-0.5 -left-0.5 w-4 h-4 border-b-2 border-l-2 border-cyan-400" />
          <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 border-b-2 border-r-2 border-cyan-400" />
        </div>
      </div>
      {(!active || error) && (
        <div className="absolute inset-x-0 bottom-3 px-4 text-center">
          <span className="inline-block bg-white/90 text-slate-700 text-sm rounded-lg px-3 py-1.5">
            {error || 'Camera off.'}
          </span>
        </div>
      )}
    </div>
  );
}
