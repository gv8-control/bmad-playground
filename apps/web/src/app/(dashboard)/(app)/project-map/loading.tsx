export default function ProjectMapLoading() {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="flex-shrink-0 px-8 py-6">
        <h1 className="text-xl font-semibold text-text-1">Project Map</h1>
      </header>
      <div className="px-8 pb-8">
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="bg-surface-raised border border-border rounded-lg p-3 px-4 max-w-[720px] h-14 animate-pulse"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
