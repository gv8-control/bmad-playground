'use client';

import * as React from 'react';
import type { AccessNoticeData } from './types';

const NOTICE_COPY: Record<AccessNoticeData['code'], string> = {
  RATE_LIMITED: 'GitHub is rate-limiting this request. Wait a moment and try again.',
  ORG_RESTRICTION: "Your organization hasn't approved this app. Ask an org admin to grant access.",
  INSUFFICIENT_PERMISSION: "Your account doesn't have access to this resource.",
};

export interface AccessNoticeProps {
  notice: AccessNoticeData;
}

export function AccessNotice({ notice }: AccessNoticeProps) {
  const [dismissed, setDismissed] = React.useState(false);

  if (dismissed) return null;

  const copy = NOTICE_COPY[notice.code];
  const retrySuffix =
    notice.code === 'RATE_LIMITED' && notice.retryAfter
      ? ` (retry in ~${notice.retryAfter}s)`
      : '';
  const isInsufficient = notice.code === 'INSUFFICIENT_PERMISSION';

  return (
    <div
      className={`my-1 flex items-start gap-2 rounded-lg border-l-2 px-3 py-2 text-sm ${
        isInsufficient
          ? 'bg-negative-bg border-negative text-text-1'
          : 'bg-caution-bg border-caution text-text-1'
      }`}
      role="status"
      aria-live="polite"
    >
      <p className="flex-1">{copy}{retrySuffix}</p>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss notice"
        className="text-text-2 hover:text-text-1 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-surface"
      >
        Dismiss
      </button>
    </div>
  );
}
