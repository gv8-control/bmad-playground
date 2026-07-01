/**
 * @jest-environment jsdom
 *
 * Unit tests for the Sheet UI primitive (shadcn/ui pattern on @radix-ui/react-dialog).
 * Covers: renders trigger, opens content on trigger click, closes on Escape,
 * closes on overlay click.
 */

import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Sheet, SheetTrigger, SheetContent, SheetClose } from './sheet';

describe('Sheet UI primitive', () => {
  it('renders the trigger button', () => {
    render(
      <Sheet>
        <SheetTrigger asChild>
          <button>Open</button>
        </SheetTrigger>
        <SheetContent>
          <p>Drawer content</p>
        </SheetContent>
      </Sheet>,
    );
    expect(screen.getByRole('button', { name: /open/i })).toBeInTheDocument();
  });

  it('opens content on trigger click', async () => {
    render(
      <Sheet>
        <SheetTrigger asChild>
          <button>Open</button>
        </SheetTrigger>
        <SheetContent>
          <p>Drawer content</p>
        </SheetContent>
      </Sheet>,
    );
    expect(screen.queryByText('Drawer content')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /open/i }));
    expect(screen.getByText('Drawer content')).toBeInTheDocument();
  });

  it('closes on Escape key', async () => {
    render(
      <Sheet>
        <SheetTrigger asChild>
          <button>Open</button>
        </SheetTrigger>
        <SheetContent>
          <p>Drawer content</p>
        </SheetContent>
      </Sheet>,
    );
    await userEvent.click(screen.getByRole('button', { name: /open/i }));
    expect(screen.getByText('Drawer content')).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByText('Drawer content')).not.toBeInTheDocument();
  });

  it('closes on overlay click', async () => {
    render(
      <Sheet>
        <SheetTrigger asChild>
          <button>Open</button>
        </SheetTrigger>
        <SheetContent>
          <p>Drawer content</p>
        </SheetContent>
      </Sheet>,
    );
    await userEvent.click(screen.getByRole('button', { name: /open/i }));
    expect(screen.getByText('Drawer content')).toBeInTheDocument();
    const overlay = document.querySelector('.bg-overlay');
    expect(overlay).not.toBeNull();
    await userEvent.click(overlay!);
    expect(screen.queryByText('Drawer content')).not.toBeInTheDocument();
  });

  it('renders SheetClose as a close button', async () => {
    render(
      <Sheet>
        <SheetTrigger asChild>
          <button>Open</button>
        </SheetTrigger>
        <SheetContent>
          <SheetClose asChild>
            <button>Close drawer</button>
          </SheetClose>
        </SheetContent>
      </Sheet>,
    );
    await userEvent.click(screen.getByRole('button', { name: /open/i }));
    await userEvent.click(screen.getByRole('button', { name: /close drawer/i }));
    expect(screen.queryByText('Close drawer')).not.toBeInTheDocument();
  });
});
