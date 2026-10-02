import React, { useEffect } from 'react';
import { COLORS, FONT_SIZE, FONT_WEIGHT, SPACING } from '../tokens';
import type { InventoryItem } from '../types/trip';

interface ItemsListModalProps {
  visible: boolean;
  onClose: () => void;
  items: InventoryItem[];
}

/**
 * ItemsListModal — web port of driver_mobile/src/components/ItemsListModal.tsx
 *
 * Scrollable modal listing inventory items with actual vs expected quantities.
 * Mismatched quantities are highlighted in danger red with a warning indicator.
 */
export default function ItemsListModal({
  visible,
  onClose,
  items,
}: ItemsListModalProps) {
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
      aria-labelledby="wp-items-modal-title"
    >
      <div
        style={{
          width: '90%',
          maxWidth: '480px',
          maxHeight: '60vh',
          backgroundColor: COLORS.surface,
          borderRadius: 'var(--wp-radius-lg)',
          padding: SPACING.lg,
          boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            borderBottom: `1px solid ${COLORS.border}`,
            paddingBottom: SPACING.md,
            marginBottom: SPACING.md,
            flexShrink: 0,
          }}
        >
          <h2
            id="wp-items-modal-title"
            style={{
              margin: 0,
              fontSize: FONT_SIZE.lg,
              fontWeight: FONT_WEIGHT.bold,
              color: COLORS.textMain,
            }}
          >
            Items List
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

        {/* Scrollable item list */}
        <ul
          style={{
            listStyle: 'none',
            margin: 0,
            padding: 0,
            overflowY: 'auto',
            flex: 1,
          }}
          role="list"
        >
          {items.map((item) => {
            const isMismatch = item.actual < item.expected;
            return (
              <li
                key={item.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  paddingBlock: SPACING.sm,
                  borderBottom: `1px solid ${COLORS.border}`,
                }}
              >
                <span
                  style={{
                    fontSize: FONT_SIZE.sm,
                    color: COLORS.textMain,
                  }}
                >
                  {item.name}
                </span>
                <span
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  {isMismatch && (
                    <span
                      aria-label="Quantity mismatch"
                      style={{
                        color: COLORS.danger,
                        fontWeight: FONT_WEIGHT.bold,
                        fontSize: FONT_SIZE.sm,
                      }}
                    >
                      !
                    </span>
                  )}
                  <span
                    style={{
                      fontSize: FONT_SIZE.sm,
                      fontWeight: FONT_WEIGHT.bold,
                      color: isMismatch ? COLORS.danger : COLORS.textMain,
                    }}
                  >
                    {item.actual}/{item.expected}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
