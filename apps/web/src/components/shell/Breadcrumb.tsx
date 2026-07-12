import Link from 'next/link';

export function Breadcrumb() {
  return (
    <nav aria-label="Breadcrumb">
      <Link
        href="/project-map"
        className="text-sm text-text-2 hover:text-text-1 transition-colors focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-surface"
      >
        ← Project Map
      </Link>
    </nav>
  );
}
