'use client';

import type { SkillInfo } from '@bmad-easy/shared-types';
import { cn } from '@/lib/utils';

export interface SlashCommandPickerProps {
  skills: SkillInfo[];
  selectedIndex: number;
  onSelect: (skill: SkillInfo) => void;
}

export function SlashCommandPicker({
  skills,
  selectedIndex,
  onSelect,
}: SlashCommandPickerProps) {
  if (skills.length === 0) {
    return (
      <div
        className="absolute bottom-full left-0 mb-2 min-w-[240px] border border-border rounded-lg bg-surface-raised p-2 z-10"
        role="listbox"
        id="skill-listbox"
      >
        <p className="text-text-3 text-sm px-3 py-2">
          No skills found in this repository.
        </p>
      </div>
    );
  }

  return (
    <div
      className="absolute bottom-full left-0 mb-2 min-w-[240px] max-h-[320px] overflow-y-auto border border-border rounded-lg bg-surface-raised z-10"
      role="listbox"
      id="skill-listbox"
    >
      {skills.map((skill, index) => (
        <button
          key={skill.name}
          id={`skill-option-${index}`}
          type="button"
          role="option"
          aria-selected={index === selectedIndex}
          onClick={() => onSelect(skill)}
          className={cn(
            'w-full text-left px-3 py-2 text-sm font-medium text-text-1 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-surface',
            index === selectedIndex && 'bg-surface-raised',
          )}
        >
          {skill.name}
        </button>
      ))}
    </div>
  );
}
