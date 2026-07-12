'use client';

import Markdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';
import type { ChatMessage } from './types';
import { CopyButton } from './CopyButton';

export interface AgentMessageProps {
  message: ChatMessage;
}

function extractText(children: React.ReactNode): string {
  if (typeof children === 'string') return children;
  if (typeof children === 'number') return String(children);
  if (Array.isArray(children)) return children.map(extractText).join('');
  if (children && typeof children === 'object' && 'props' in children) {
    const props = (children as React.ReactElement).props as { children?: React.ReactNode };
    return extractText(props.children);
  }
  return '';
}

export const markdownComponents: Components = {
  h1: ({ node: _node, ...props }) => (
    <h1 className="text-xl font-semibold text-text-1 mb-3" {...props} />
  ),
  h2: ({ node: _node, ...props }) => (
    <h2 className="text-lg font-semibold text-text-1 mt-5 mb-2" {...props} />
  ),
  h3: ({ node: _node, ...props }) => (
    <h3 className="text-base font-semibold text-text-1 mt-4 mb-2" {...props} />
  ),
  p: ({ node: _node, ...props }) => (
    <p className="text-base leading-6 text-text-1 mb-3" {...props} />
  ),
  ul: ({ node: _node, ...props }) => (
    <ul className="pl-5 mb-3 flex flex-col gap-1" {...props} />
  ),
  ol: ({ node: _node, ...props }) => (
    <ol className="pl-5 mb-3 flex flex-col gap-1 list-decimal" {...props} />
  ),
  li: ({ node: _node, ...props }) => (
    <li className="text-base leading-6 text-text-1" {...props} />
  ),
  code: ({ node: _node, className, children, ...props }) => {
    const isBlock = (typeof className === 'string' && className.includes('language-'))
      || (typeof children === 'string' && children.includes('\n'));
    if (isBlock) {
      return <code className={cn('font-mono text-sm text-text-1', className)} {...props} />;
    }
    return (
      <code
        className={cn(
          'font-mono text-xs text-text-1 bg-surface-raised rounded px-2 py-1',
          className,
        )}
        {...props}
      />
    );
  },
  pre: ({ node: _node, children, ...props }) => {
    const codeText = extractText(children);
    return (
      <div className="relative bg-surface-raised border border-border rounded-lg p-4 mb-3 overflow-x-auto group/code">
        <div className="absolute top-2 right-2">
          <CopyButton text={codeText} alwaysVisible />
        </div>
        <pre className="font-mono text-sm text-text-1" {...props}>
          {children}
        </pre>
      </div>
    );
  },
  a: ({ node: _node, ...props }) => (
    <a className="text-accent hover:text-accent-hover underline focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-surface" {...props} />
  ),
  strong: ({ node: _node, ...props }) => (
    <strong className="font-semibold text-text-1" {...props} />
  ),
  blockquote: ({ node: _node, ...props }) => (
    <blockquote className="border-l-2 border-border pl-4 text-text-2 mb-3" {...props} />
  ),
};

export function AgentMessage({ message }: AgentMessageProps) {
  const time = new Intl.DateTimeFormat('en', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  }).format(message.createdAt);

  return (
    <div className="group mb-6 flex justify-start">
      <div className="w-full max-w-[760px]">
        <div className="flex items-start justify-between gap-2">
          <div className="relative flex-1">
            <Markdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
              {message.content}
            </Markdown>
            {message.isStreaming && (
              <span
                className="inline-block h-4 w-2 animate-pulse bg-accent motion-reduce:animate-none"
                aria-hidden="true"
              />
            )}
          </div>
          <div className="opacity-0 transition-opacity group-hover:opacity-100">
            <CopyButton text={message.content} />
          </div>
        </div>
        <span className="text-xs text-text-2">{time}</span>
      </div>
    </div>
  );
}
