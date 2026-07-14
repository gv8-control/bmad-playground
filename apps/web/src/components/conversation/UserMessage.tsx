'use client';

import type { ChatMessage } from './types';
import { CopyButton } from './CopyButton';

export interface UserMessageProps {
  message: ChatMessage;
}

const timeFormatter = new Intl.DateTimeFormat('en', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'UTC',
});

export function UserMessage({ message }: UserMessageProps) {
  const time = timeFormatter.format(message.createdAt);

  return (
    <div className="group mb-6 flex justify-end">
      <div className="relative max-w-[80%]">
        <div className="absolute -top-5 right-0 opacity-0 transition-opacity group-hover:opacity-100 flex items-center gap-2 whitespace-nowrap">
          <span className="text-xs text-text-2">{time}</span>
          <CopyButton text={message.content} />
        </div>
        <div className="rounded-lg bg-surface-raised px-4 py-3 text-text-1">
          {message.content}
        </div>
      </div>
    </div>
  );
}
