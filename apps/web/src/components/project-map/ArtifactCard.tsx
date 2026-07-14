import Link from 'next/link';
import type { MouseEvent } from 'react';
import type { ArtifactType, ArtifactStatus } from '@bmad-easy/shared-types';
import { cn } from '@/lib/utils';

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

const STATUS_LABELS: Record<ArtifactStatus, string> = {
  completed: 'Completed',
  'in-progress': 'In progress',
};

const STATUS_BADGE_CLASSES: Record<ArtifactStatus, string> = {
  completed:
    'border border-border bg-transparent text-text-2 rounded-full px-2 py-1 text-xs',
  'in-progress':
    'border border-caution bg-caution-bg text-caution rounded-full px-2 py-1 text-xs',
};

export interface ArtifactCardProps {
  type: ArtifactType;
  title: string;
  status: ArtifactStatus;
  href: string;
  onClick?: (e: MouseEvent<HTMLAnchorElement>) => void;
}

export function ArtifactCard({ type, title, status, href, onClick }: ArtifactCardProps) {
  const typeLabel = TYPE_LABELS[type] ?? 'Other';
  const statusLabel = STATUS_LABELS[status] ?? 'Completed';

  return (
    <Link
      href={href}
      role="listitem"
      onClick={onClick}
      aria-label={`${typeLabel}: ${title} — ${statusLabel}`}
      className={cn(
        'bg-surface-raised border border-border rounded-lg p-3 px-4 flex items-center justify-between max-w-[720px]',
        'hover:border-accent transition-colors',
        'focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-surface',
      )}
    >
      <div className="flex flex-col gap-1">
        <span className="text-xs text-text-2 uppercase tracking-wide font-medium">
          {typeLabel}
        </span>
        <span className="text-sm font-semibold text-text-1">{title}</span>
      </div>
      <span
        className={
          STATUS_BADGE_CLASSES[status] ?? STATUS_BADGE_CLASSES.completed
        }
      >
        {statusLabel}
      </span>
    </Link>
  );
}
