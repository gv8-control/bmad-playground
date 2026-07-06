import Link from 'next/link';
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
    'border border-border bg-transparent text-text-2 rounded-full px-2 py-0.5 text-xs',
  'in-progress':
    'border border-caution bg-caution-bg text-caution rounded-full px-2 py-0.5 text-xs',
};

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
});

function formatDate(date: Date): string {
  return dateFormatter.format(date);
}

export interface ArtifactListEntryProps {
  type: ArtifactType;
  title: string;
  status: ArtifactStatus;
  lastModifiedAt: Date;
  href: string;
  selected?: boolean;
}

export function ArtifactListEntry({
  type,
  title,
  status,
  lastModifiedAt,
  href,
  selected = false,
}: ArtifactListEntryProps) {
  const typeLabel = TYPE_LABELS[type] ?? 'Other';
  const statusLabel = STATUS_LABELS[status] ?? 'Completed';

  return (
    <Link
      href={href}
      role="listitem"
      aria-label={`${typeLabel}: ${title} — ${statusLabel}`}
      aria-current={selected ? 'true' : undefined}
      className={cn(
        'py-2.5 px-4 flex flex-col gap-0.5',
        'focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-surface',
        selected
          ? 'bg-surface-raised border-l-2 border-accent'
          : 'hover:bg-surface-raised/60 transition-colors',
      )}
    >
      <span className="text-xs text-text-2 uppercase tracking-wide font-medium">
        {typeLabel}
      </span>
      <span className="text-sm font-semibold text-text-1">{title}</span>
      <div className="flex items-center justify-between mt-1">
        <span className="text-xs text-text-3">
          {formatDate(lastModifiedAt)}
        </span>
        <span
          className={STATUS_BADGE_CLASSES[status] ?? STATUS_BADGE_CLASSES.completed}
        >
          {statusLabel}
        </span>
      </div>
    </Link>
  );
}
