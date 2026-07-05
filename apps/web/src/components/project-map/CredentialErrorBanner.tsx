'use client';

import * as React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { reauthorizeGitHub } from '@/actions/credential-health.actions';

export interface CredentialErrorBannerProps {
  callbackUrl?: string;
}

export function CredentialErrorBanner({ callbackUrl }: CredentialErrorBannerProps = {}) {
  const [open, setOpen] = React.useState(false);
  const [isPending, startTransition] = React.useTransition();
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  const handleReconnect = () => {
    setErrorMessage(null);
    startTransition(async () => {
      try {
        await reauthorizeGitHub(callbackUrl);
      } catch {
        setErrorMessage(
          'Could not reconnect. Please try again or sign out and sign back in.',
        );
      }
    });
  };

  return (
    <>
      <div className="bg-negative-bg border-b border-negative px-4 py-2.5 text-sm text-text-1">
        Your repository connection needs attention.{' '}
        <a
          href="#"
          aria-label="Update access token"
          onClick={(e) => {
            e.preventDefault();
            setOpen(true);
          }}
          className="text-negative underline focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-surface"
        >
          Update access token
        </a>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reconnect your GitHub account</DialogTitle>
            <DialogDescription>
              Your access token may have expired or been revoked. Reconnect to
              continue syncing artifacts.
            </DialogDescription>
          </DialogHeader>
          {errorMessage && (
            <p className="text-sm text-negative">{errorMessage}</p>
          )}
          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleReconnect}
              disabled={isPending}
              className="inline-flex items-center justify-center rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg transition-colors hover:bg-accent-hover focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-surface disabled:opacity-50 disabled:pointer-events-none"
            >
              Reconnect
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
