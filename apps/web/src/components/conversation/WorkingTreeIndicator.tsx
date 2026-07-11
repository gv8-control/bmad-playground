'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

export type WorkingTreeState = 'hidden' | 'dirty' | 'clean' | 'saving' | 'saving-after-response';

export interface WorkingTreeIndicatorProps {
  state: WorkingTreeState;
  onSave: () => void;
}

const INFO_TEXT =
  'Unsaved changes are lost if you close this page or your session restarts. Saving commits them permanently to your repository.';

const FOCUS_RING = 'focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-surface';

export function WorkingTreeIndicator({ state, onSave }: WorkingTreeIndicatorProps) {
  const [savePopoverOpen, setSavePopoverOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const triggerRef = useRef<HTMLSpanElement>(null);
  const saveButtonRef = useRef<HTMLButtonElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const infoRef = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (savePopoverOpen && saveButtonRef.current) {
      saveButtonRef.current.focus();
    }
  }, [savePopoverOpen]);

  useEffect(() => {
    if (!infoOpen) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setInfoOpen(false);
        infoRef.current?.focus();
      }
    }

    function handleOutsideClick(e: MouseEvent) {
      if (
        infoRef.current &&
        !infoRef.current.contains(e.target as Node) &&
        (!tooltipRef.current || !tooltipRef.current.contains(e.target as Node))
      ) {
        setInfoOpen(false);
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleOutsideClick);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [infoOpen]);

  if (state === 'hidden') {
    return null;
  }

  if (state === 'clean') {
    return (
      <div aria-live="polite" className="px-1 py-1">
        <span className="text-sm text-text-2">✓ All saved</span>
      </div>
    );
  }

  if (state === 'saving') {
    return (
      <div aria-live="polite" className="px-1 py-1">
        <span className="text-sm text-text-2">Saving…</span>
      </div>
    );
  }

  if (state === 'saving-after-response') {
    return (
      <div aria-live="polite" className="px-1 py-1">
        <span className="text-sm text-text-2">Saving after response…</span>
      </div>
    );
  }

  return (
    <div aria-live="polite" className="relative px-1 py-1">
      <div className="inline-flex items-center gap-2">
        <span
          ref={triggerRef}
          role="button"
          tabIndex={0}
          aria-haspopup="dialog"
          onClick={() => setSavePopoverOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setSavePopoverOpen(true);
            }
          }}
          className={cn(
            'inline-flex items-center gap-1 rounded-sm bg-caution-bg border border-caution px-3 py-1 text-sm text-caution cursor-pointer',
            FOCUS_RING,
          )}
        >
          <span aria-hidden="true">●</span>
          Unsaved changes
        </span>
        <span
          ref={infoRef}
          role="button"
          tabIndex={0}
          aria-label="Why does this matter?"
          onClick={() => setInfoOpen((prev) => !prev)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setInfoOpen((prev) => !prev);
            }
          }}
          className={cn(
            'inline-flex items-center justify-center w-5 h-5 text-sm text-text-3 hover:text-text-2 cursor-pointer',
            FOCUS_RING,
            'rounded-sm',
          )}
        >
          ⓘ
        </span>
      </div>

      {savePopoverOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Save current progress"
          className="absolute bottom-full left-0 mb-2 z-10 bg-surface-raised border border-border rounded-md p-4 shadow-lg min-w-[240px]"
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              setSavePopoverOpen(false);
              triggerRef.current?.focus();
              return;
            }
            if (e.key === 'Tab') {
              const focusables = [saveButtonRef.current, cancelButtonRef.current].filter(
                Boolean,
              ) as HTMLButtonElement[];
              if (focusables.length === 0) return;
              const first = focusables[0];
              const last = focusables[focusables.length - 1];
              if (e.shiftKey) {
                if (document.activeElement === first) {
                  e.preventDefault();
                  last.focus();
                }
              } else {
                if (document.activeElement === last) {
                  e.preventDefault();
                  first.focus();
                }
              }
            }
          }}
        >
          <p className="text-sm text-text-1 mb-3">Save current progress?</p>
          <div className="flex items-center gap-3">
            <button
              ref={saveButtonRef}
              type="button"
              onClick={() => {
                onSave();
                setSavePopoverOpen(false);
                triggerRef.current?.focus();
              }}
              className={cn(
                'rounded-sm bg-accent px-3 py-2 text-sm text-bg font-medium',
                FOCUS_RING,
              )}
            >
              Save
            </button>
            <button
              ref={cancelButtonRef}
              type="button"
              onClick={() => {
                setSavePopoverOpen(false);
                triggerRef.current?.focus();
              }}
              className={cn(
                'text-sm text-text-2 underline',
                FOCUS_RING,
              )}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {infoOpen && (
        <div
          ref={tooltipRef}
          role="tooltip"
          className="absolute bottom-full left-0 mb-2 z-10 bg-surface-raised border border-border rounded-md p-3 shadow-lg max-w-[300px] text-sm text-text-2"
        >
          {INFO_TEXT}
        </div>
      )}
    </div>
  );
}
