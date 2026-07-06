'use client';

import Markdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';
import type { ChatMessage } from './types';
import { CopyButton } from './CopyButton';

export interface AgentMessageProps {
  message: ChatMessage;
}

const components: Components = {
  h1: ({ node: _node, ...props }) => (
    <h1 className="text-lg font-semibold text-text-1 mb-3" {...props} />
  ),
  h2: ({ node: _node, ...props }) => (
    <h2 className="text-base font-semibold text-text-1 mt-5 mb-2" {...props} />
  ),
  h3: ({ node: _node, ...props }) => (
    <h3 className="text-sm font-semibold text-text-1 mt-4 mb-2" {...props} />
  ),
  p: ({ node: _node, ...props }) => (
    <p className="text-sm leading-6 text-text-1 mb-3" {...props} />
  ),
  ul: ({ node: _node, ...props }) => (
    <ul className="pl-5 mb-3 flex flex-col gap-1" {...props} />
  ),
  ol: ({ node: _node, ...props }) => (
    <ol className="pl-5 mb-3 flex flex-col gap-1 list-decimal" {...props} />
  ),
  li: ({ node: _node, ...props }) => (
    <li className="text-sm leading-6 text-text-1" {...props} />
  ),
  code: ({ node: _node, className, ...props }) => (
    <code
      className={cn(
        'font-mono text-xs text-text-1 bg-surface-raised rounded px-1.5 py-0.5',
        className,
      )}
      {...props}
    />
  ),
  pre: ({ node: _node, ...props }) => (
    <pre
      className="relative bg-surface-raised border border-border rounded-lg p-4 mb-3 overflow-x-auto"
      {...props}
    />
  ),
  a: ({ node: _node, ...props }) => (
    <a className="text-accent hover:text-accent-hover underline" {...props} />
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
    <div className="group mb-4 flex justify-start">
      <div className="w-full max-w-[760px]">
        <div className="relative">
          <Markdown remarkPlugins={[remarkGfm]} components={components}>
            {message.content}
          </Markdown>
          {message.isStreaming && (
            <span
              className="inline-block h-4 w-2 animate-pulse bg-accent motion-reduce:animate-none"
              aria-hidden="true"
            />
          )}
        </div>
        <div className="mt-1 flex items-center gap-2 opacity-0 transition-opacity group-hover:opacity-100">
          <span className="text-xs text-text-3">{time}</span>
          <CopyButton text={message.content} />
        </div>
      </div>
    </div>
  );
}
