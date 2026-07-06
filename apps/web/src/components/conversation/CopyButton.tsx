'use client';

import { useState } from 'react';

export interface CopyButtonProps {
  text: string;
  alwaysVisible?: boolean;
}

export function CopyButton({ text, alwaysVisible = false }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={`text-text-3 hover:text-text-2 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-surface rounded ${alwaysVisible ? '' : 'opacity-0 group-hover:opacity-100'} transition-opacity`}
      aria-label="Copy to clipboard"
    >
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}
