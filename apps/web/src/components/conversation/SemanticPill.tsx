'use client';

import Link from 'next/link';
import type { ArtifactType } from '@bmad-easy/shared-types';
import { cn } from '@/lib/utils';

export interface SemanticPillProps {
  artifactType: string;
  artifactTitle: string;
  viewHref: string;
}

const TYPE_LABELS: Record<ArtifactType, string> = {
  brainstorming: 'Brainstorming',
  prd: 'PRD',
  architecture: 'Architecture',
  epics: 'Epics',
  ux: 'UX',
  'technical-research': 'Technical Research',
  'market-research': 'Market Research',
  'domain-research': 'Domain Research',
  'product-brief': 'Brief',
  prfaq: 'PR/FAQ',
  'test-arch': 'Test Architecture',
  other: 'Other',
};

function typeLabel(type: string): string {
  return TYPE_LABELS[type as ArtifactType] ?? 'Other';
}

export function SemanticPill({ artifactType, artifactTitle, viewHref }: SemanticPillProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'inline-flex items-center gap-1.5 bg-positive-bg border border-positive rounded-sm px-2.5 py-1 text-sm text-positive',
      )}
    >
      <span className="font-medium">Progress saved</span>
      {artifactType && (
        <>
          <span aria-hidden="true">·</span>
          <span>{typeLabel(artifactType)}</span>
        </>
      )}
      {artifactTitle && (
        <>
          <span aria-hidden="true">·</span>
          <span className="text-positive/80">{artifactTitle}</span>
        </>
      )}
      {viewHref && (
        <Link
          href={viewHref}
          className={cn(
            'text-positive underline font-medium',
            'focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-surface',
          )}
        >
          View
        </Link>
      )}
    </div>
  );
}
