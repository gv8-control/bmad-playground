/**
 * @jest-environment jsdom
 *
 * Story 3.2: Invoke BMAD Skills via Slash Command
 * Unit tests for SlashCommandPicker Client Component.
 *
 * Covers: AC-1 (picker renders skills, highlights selected, keyboard nav),
 * AC-2 (empty skills state).
 *
 * TDD RED PHASE: All tests are skipped (it.skip). Remove skips
 * one describe-block at a time per task during implementation.
 */
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { SlashCommandPicker } from './SlashCommandPicker';
import type { SkillInfo } from '@bmad-easy/shared-types';

const SKILLS: SkillInfo[] = [
  { name: 'bmad-prd' },
  { name: 'bmad-architect' },
  { name: 'bmad-dev-story' },
];

describe('[P0] SlashCommandPicker rendering', () => {
  it('renders all skills passed as props', () => {
    render(
      <SlashCommandPicker
        skills={SKILLS}
        selectedIndex={0}
        onSelect={jest.fn()}
      />,
    );

    expect(screen.getByText('bmad-prd')).toBeInTheDocument();
    expect(screen.getByText('bmad-architect')).toBeInTheDocument();
    expect(screen.getByText('bmad-dev-story')).toBeInTheDocument();
  });

  it('highlights the item at selectedIndex', () => {
    render(
      <SlashCommandPicker
        skills={SKILLS}
        selectedIndex={1}
        onSelect={jest.fn()}
      />,
    );

    const items = screen.getAllByRole('option');
    expect(items[1].className).toContain('bg-surface-raised');
  });

  it('shows "No skills found in this repository." when skills array is empty', () => {
    render(
      <SlashCommandPicker
        skills={[]}
        selectedIndex={0}
        onSelect={jest.fn()}
      />,
    );

    expect(screen.getByText('No skills found in this repository.')).toBeInTheDocument();
  });
});

describe('[P0] SlashCommandPicker interactions', () => {
  it('calls onSelect when an item is clicked', () => {
    const onSelect = jest.fn();
    render(
      <SlashCommandPicker
        skills={SKILLS}
        selectedIndex={0}
        onSelect={onSelect}
      />,
    );

    fireEvent.click(screen.getByText('bmad-prd'));

    expect(onSelect).toHaveBeenCalledWith({ name: 'bmad-prd' });
  });

  it('assigns unique ids to each option', () => {
    render(
      <SlashCommandPicker
        skills={SKILLS}
        selectedIndex={0}
        onSelect={jest.fn()}
      />,
    );

    const options = screen.getAllByRole('option');
    expect(options[0]).toHaveAttribute('id', 'skill-option-0');
    expect(options[1]).toHaveAttribute('id', 'skill-option-1');
    expect(options[2]).toHaveAttribute('id', 'skill-option-2');
  });
});
