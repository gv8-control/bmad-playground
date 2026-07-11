import Markdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';

export interface ArtifactViewerProps {
  content: string;
}

function stripFrontmatter(content: string): string {
  return content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
}

const components: Components = {
  h1: ({ node: _node, ...props }) => (
    <h1 className="text-xl font-semibold text-text-1 mb-4" {...props} />
  ),
  h2: ({ node: _node, ...props }) => (
    <h2
      className="text-lg font-semibold text-text-1 mt-7 mb-3 pt-5 border-t border-border-subtle"
      {...props}
    />
  ),
  h3: ({ node: _node, ...props }) => (
    <h3 className="text-base font-semibold text-text-1 mt-5 mb-2" {...props} />
  ),
  p: ({ node: _node, ...props }) => (
    <p className="text-base leading-6 text-text-1 mb-5" {...props} />
  ),
  ul: ({ node: _node, ...props }) => (
    <ul className="pl-5 mb-5 flex flex-col gap-2" {...props} />
  ),
  ol: ({ node: _node, ...props }) => (
    <ol className="pl-5 mb-5 flex flex-col gap-2 list-decimal" {...props} />
  ),
  li: ({ node: _node, ...props }) => (
    <li className="text-base leading-6 text-text-1" {...props} />
  ),
  code: ({ node: _node, className, ...props }) => (
    <code
      className={cn(
        'font-mono text-sm text-text-1 bg-surface-raised rounded px-2 py-1',
        className,
      )}
      {...props}
    />
  ),
  pre: ({ node: _node, ...props }) => (
    <pre
      className="bg-surface-raised border border-border rounded-lg p-4 mb-5 overflow-x-auto"
      {...props}
    />
  ),
  table: ({ node: _node, ...props }) => (
    <table className="w-full mb-5 border-collapse" {...props} />
  ),
  th: ({ node: _node, ...props }) => (
    <th
      className="border border-border px-3 py-2 text-left text-sm font-semibold text-text-1"
      {...props}
    />
  ),
  td: ({ node: _node, ...props }) => (
    <td
      className="border border-border px-3 py-2 text-sm text-text-1"
      {...props}
    />
  ),
  blockquote: ({ node: _node, ...props }) => (
    <blockquote
      className="border-l-2 border-border pl-4 text-text-2 mb-5"
      {...props}
    />
  ),
  a: ({ node: _node, ...props }) => (
    <a className="text-accent hover:text-accent-hover underline" {...props} />
  ),
  strong: ({ node: _node, ...props }) => (
    <strong className="font-semibold text-text-1" {...props} />
  ),
  em: ({ node: _node, ...props }) => <em className="italic" {...props} />,
  hr: ({ node: _node, ...props }) => (
    <hr className="border-border-subtle border-t my-6" {...props} />
  ),
  del: ({ node: _node, ...props }) => (
    <del className="line-through text-text-2" {...props} />
  ),
};

export function ArtifactViewer({ content }: ArtifactViewerProps) {
  const strippedContent = stripFrontmatter(content);
  return (
    <div
      className="flex-1 overflow-y-auto px-12 py-8"
      role="main"
      aria-label="Artifact content"
    >
      <div className="max-w-[720px]">
        <Markdown remarkPlugins={[remarkGfm]} components={components}>
          {strippedContent}
        </Markdown>
      </div>
    </div>
  );
}
