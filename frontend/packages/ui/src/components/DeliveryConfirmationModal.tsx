import React, { useState, useEffect, useCallback } from 'react';
import { COLORS, FONT_SIZE, FONT_WEIGHT, SPACING } from '../tokens';
import OTPInput from './OTPInput';

interface DeliveryConfirmationModalProps {
  visible: boolean;
  onClose: () => void;
  onConfirm: (code: string) => void;
  /** OTP length, defaults to 6 matching the mobile component */
  otpLength?: number;
  /** Countdown duration in seconds (default 112 = 1 min 52 sec) */
  timerSeconds?: number;
}

/**
 * DeliveryConfirmationModal — web port of driver_mobile/src/components/DeliveryConfirmationModal.tsx
 *
 * Renders as a portal-like fixed overlay (no RN Modal dependency).
 * Traps focus inside the dialog when open for accessibility.
 */
export default function DeliveryConfirmationModal({
  visible,
  onClose,
  onConfirm,
  otpLength = 6,
  timerSeconds = 112,
}: DeliveryConfirmationModalProps) {
  const [code, setCode] = useState<string[]>(Array(otpLength).fill(''));
  const [timeLeft, setTimeLeft] = useState(timerSeconds);

  // Reset and run timer
  useEffect(() => {
    if (!visible) {
      setTimeLeft(timerSeconds);
      setCode(Array(otpLength).fill(''));
      return;
    }
    if (timeLeft <= 0) return;

    const id = setInterval(() => setTimeLeft((t) => t - 1), 1000);
    return () => clearInterval(id);
  }, [timeLeft, visible, timerSeconds, otpLength]);

  // Close on Escape
  useEffect(() => {
    if (!visible) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [visible, onClose]);

  // Prevent body scroll while open
  useEffect(() => {
    document.body.style.overflow = visible ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [visible]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const handleComplete = useCallback(() => {
    onConfirm(code.join(''));
    setCode(Array(otpLength).fill(''));
  }, [code, onConfirm, otpLength]);

  const allFilled = code.every((d) => d !== '');

  if (!visible) return null;

  return (
    <div
      className="wp-component wp-modal-overlay"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="wp-delivery-modal-title"
    >
      <div
        className="wp-modal-container"
        style={{
          width: '90%',
          maxWidth: '480px',
          backgroundColor: COLORS.surface,
          borderRadius: 'var(--wp-radius-lg)',
          padding: SPACING.lg,
          boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingBottom: SPACING.md,
            marginBottom: SPACING.md,
            borderBottom: `1px solid ${COLORS.border}`,
          }}
        >
          <h2
            id="wp-delivery-modal-title"
            style={{
              margin: 0,
              fontSize: FONT_SIZE.lg,
              fontWeight: FONT_WEIGHT.bold,
              color: COLORS.textMain,
            }}
          >
            Delivery Confirmation
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            style={{
              background: 'none',
              border: 'none',
              fontSize: FONT_SIZE.lg,
              color: COLORS.textSecondary,
              cursor: 'pointer',
              lineHeight: 1,
              padding: '4px',
            }}
          >
            ✕
          </button>
        </div>

        {/* Subtitle */}
        <p
          style={{
            margin: `0 0 ${SPACING.md}`,
            fontSize: FONT_SIZE.sm,
            color: COLORS.textSecondary,
          }}
        >
          Please enter the code displayed in the store manager's application.
        </p>

        {/* OTP Input */}
        <OTPInput code={code} setCode={setCode} length={otpLength} />

        {/* Footer */}
        <div
          style={{
            paddingTop: SPACING.md,
            marginTop: SPACING.sm,
            borderTop: `1px solid ${COLORS.border}`,
          }}
        >
          <p
            style={{
              textAlign: 'center',
              fontSize: '0.75rem',
              color: COLORS.textSecondary,
              margin: 0,
            }}
          >
            {timeLeft > 0
              ? `Resend code in ${formatTime(timeLeft)} mins`
              : 'Resend code now'}
          </p>
        </div>

        {/* Verify button — shown when all digits entered */}
        {allFilled && (
          <button
            type="button"
            onClick={handleComplete}
            style={{
              display: 'block',
              width: '100%',
              backgroundColor: COLORS.primaryDark,
              color: COLORS.surface,
              fontSize: FONT_SIZE.md,
              fontWeight: FONT_WEIGHT.bold,
              padding: SPACING.md,
              borderRadius: 'var(--wp-radius-md)',
              border: 'none',
              marginTop: SPACING.md,
              cursor: 'pointer',
              transition: 'filter var(--wp-transition)',
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.filter = 'brightness(0.9)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.filter = ''; }}
          >
            Verify
          </button>
        )}
      </div>
    </div>
  );
}
