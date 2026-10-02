import React, { useRef } from 'react';
import { COLORS, SPACING } from '../tokens';

interface OTPInputProps {
  code: string[];
  setCode: (code: string[]) => void;
  length?: number;
  className?: string;
}

/**
 * OTPInput — web port of driver_mobile/src/components/OTPInput.tsx
 *
 * Renders `length` individual digit boxes with auto-focus-advance behaviour.
 * Uses standard HTML <input type="text"> instead of RN TextInput.
 */
export default function OTPInput({
  code,
  setCode,
  length = 4,
  className = '',
}: OTPInputProps) {
  const inputs = useRef<Array<HTMLInputElement | null>>([]);

  const handleChange = (value: string, index: number) => {
    // Accept only a single digit
    const digit = value.replace(/\D/g, '').slice(-1);
    const newCode = [...code];
    newCode[index] = digit;
    setCode(newCode);

    if (digit && index < length - 1) {
      inputs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, index: number) => {
    if (e.key === 'Backspace' && !code[index] && index > 0) {
      inputs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length);
    const newCode = Array(length).fill('');
    pasted.split('').forEach((ch, i) => { newCode[i] = ch; });
    setCode(newCode);
    const focusIndex = Math.min(pasted.length, length - 1);
    inputs.current[focusIndex]?.focus();
  };

  const boxStyle: React.CSSProperties = {
    width: '2.6875rem',   // ≈ 43 px
    height: '3.75rem',    // ≈ 60 px
    border: `1px solid ${COLORS.border}`,
    borderRadius: 'var(--wp-radius-md)',
    textAlign: 'center',
    fontSize: '1.5rem',
    fontWeight: 'bold',
    color: COLORS.textMain,
    backgroundColor: COLORS.surface,
    outline: 'none',
    transition: 'border-color var(--wp-transition)',
    caretColor: 'transparent',
  };

  return (
    <div
      className={`wp-component wp-otp-input ${className}`}
      style={{
        display: 'flex',
        justifyContent: 'center',
        gap: SPACING.sm,
        marginBlock: SPACING.sm,
      }}
    >
      {Array(length)
        .fill(0)
        .map((_, index) => (
          <input
            key={index}
            ref={(el) => (inputs.current[index] = el)}
            type="text"
            inputMode="numeric"
            pattern="\d*"
            maxLength={1}
            value={code[index] ?? ''}
            onChange={(e) => handleChange(e.target.value, index)}
            onKeyDown={(e) => handleKeyDown(e, index)}
            onPaste={handlePaste}
            onFocus={(e) => { e.currentTarget.style.borderColor = COLORS.primaryLight; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = COLORS.border; }}
            style={boxStyle}
            aria-label={`OTP digit ${index + 1}`}
          />
        ))}
    </div>
  );
}
