/**
 * Story 1.1-AC2: Tailwind theme = DESIGN.md tokens, dark-only
 * Story 5.4: AC-8 (boxShadow.floating), AC-10 (fontWeight full override),
 *            AC-11 (colors/borderRadius/fontFamily full theme overrides)
 *
 * Asserts that key theme tokens in tailwind.config.ts match the values
 * documented in DESIGN.md (`ux-bmad-easy-2026-06-15/DESIGN.md`).
 * This is a structural token-presence test, not a visual test.
 */
import config from '../../tailwind.config';

const theme = config.theme ?? {};
const extend = theme.extend ?? {};

describe('1.1-AC2 — Tailwind theme tokens match DESIGN.md', () => {
  describe('dark mode only', () => {
    it('darkMode is set to "class"', () => {
      expect(config.darkMode).toBe('class');
    });
  });

  describe('background colors', () => {
    it('bg matches DESIGN.md (#0D0D11)', () => {
      expect(theme.colors?.bg).toBe('#0D0D11');
    });

    it('surface matches DESIGN.md (#16161C)', () => {
      expect(theme.colors?.surface).toBe('#16161C');
    });

    it('surface-raised matches DESIGN.md (#1E1E26)', () => {
      expect(theme.colors?.['surface-raised']).toBe('#1E1E26');
    });
  });

  describe('border colors', () => {
    it('border matches DESIGN.md (#2B2B38)', () => {
      expect(theme.colors?.border).toBe('#2B2B38');
    });

    it('border-subtle matches DESIGN.md (#232330)', () => {
      expect(theme.colors?.['border-subtle']).toBe('#232330');
    });
  });

  describe('text colors', () => {
    it('text-1 matches DESIGN.md (#EDECF5)', () => {
      expect(theme.colors?.['text-1']).toBe('#EDECF5');
    });

    it('text-2 matches DESIGN.md (#8D8CA0)', () => {
      expect(theme.colors?.['text-2']).toBe('#8D8CA0');
    });

    it('text-3 matches DESIGN.md (#56556A)', () => {
      expect(theme.colors?.['text-3']).toBe('#56556A');
    });
  });

  describe('accent colors', () => {
    it('accent matches DESIGN.md (#7B6EE8)', () => {
      expect(theme.colors?.accent).toBe('#7B6EE8');
    });

    it('accent-hover matches DESIGN.md (#9083F2)', () => {
      expect(theme.colors?.['accent-hover']).toBe('#9083F2');
    });

    it('accent-fg matches DESIGN.md (#FFFFFF)', () => {
      expect(theme.colors?.['accent-fg']).toBe('#FFFFFF');
    });
  });

  describe('semantic colors', () => {
    it('positive matches DESIGN.md (#3ECF8E)', () => {
      expect(theme.colors?.positive).toBe('#3ECF8E');
    });

    it('caution matches DESIGN.md (#F2A944)', () => {
      expect(theme.colors?.caution).toBe('#F2A944');
    });

    it('negative matches DESIGN.md (#F06B6B)', () => {
      expect(theme.colors?.negative).toBe('#F06B6B');
    });
  });

  describe('typography', () => {
    it('font-sans includes Inter as primary', () => {
      expect(theme.fontFamily?.sans?.[0]).toBe('Inter');
    });

    it('font-mono includes JetBrains Mono as primary', () => {
      expect(theme.fontFamily?.mono?.[0]).toBe('JetBrains Mono');
    });
  });

  describe('spacing scale', () => {
    it('spacing.1 is 4px', () => {
      expect(extend.spacing?.['1']).toBe('4px');
    });

    it('spacing.2 is 8px', () => {
      expect(extend.spacing?.['2']).toBe('8px');
    });

    it('spacing.3 is 12px', () => {
      expect(extend.spacing?.['3']).toBe('12px');
    });

    it('spacing.4 is 16px', () => {
      expect(extend.spacing?.['4']).toBe('16px');
    });

    it('spacing.5 is 20px', () => {
      expect(extend.spacing?.['5']).toBe('20px');
    });

    it('spacing.6 is 24px', () => {
      expect(extend.spacing?.['6']).toBe('24px');
    });

    it('spacing.8 is 32px', () => {
      expect(extend.spacing?.['8']).toBe('32px');
    });

    it('spacing.10 is 40px', () => {
      expect(extend.spacing?.['10']).toBe('40px');
    });

    it('spacing.12 is 48px', () => {
      expect(extend.spacing?.['12']).toBe('48px');
    });

    it('spacing.16 is 64px', () => {
      expect(extend.spacing?.['16']).toBe('64px');
    });
  });
});

// ─── Story 5.4: Token-config gaps (AC-8, AC-10, AC-11) ──────────────────────
//
// Story 5.4: AC-8:  boxShadow.floating token added to theme.extend.
// AC-10: fontWeight full theme override (regular/medium/semibold only).
// AC-11: colors, borderRadius, fontFamily moved from theme.extend to full theme.

describe('Story 5.4 — Token-config gaps (AC-8, AC-10, AC-11)', () => {
  describe('AC-8: Floating box-shadow token', () => {
    it('[P0] theme.extend.boxShadow.floating matches DESIGN.md (0 8px 24px rgba(0,0,0,0.4)) (AC-8)', () => {
      const extend = (config.theme ?? {}).extend ?? {};
      expect(extend.boxShadow?.floating).toBe('0 8px 24px rgba(0,0,0,0.4)');
    });
  });

  describe('AC-10: Font-weight full theme override', () => {
    it('[P0] theme.fontWeight.regular is 400 (AC-10)', () => {
      const topLevel = config.theme ?? {};
      expect(topLevel.fontWeight?.regular).toBe('400');
    });

    it('[P0] theme.fontWeight.medium is 500 (AC-10)', () => {
      const topLevel = config.theme ?? {};
      expect(topLevel.fontWeight?.medium).toBe('500');
    });

    it('[P0] theme.fontWeight.semibold is 600 (AC-10)', () => {
      const topLevel = config.theme ?? {};
      expect(topLevel.fontWeight?.semibold).toBe('600');
    });

    it('[P0] fontWeight is a full theme override (not in extend) — font-bold is blocked (AC-10)', () => {
      const topLevel = config.theme ?? {};
      const extend = topLevel.extend ?? {};
      expect(topLevel.fontWeight).toBeDefined();
      expect(extend.fontWeight).toBeUndefined();
    });
  });

  describe('AC-11: Full theme overrides for colors, borderRadius, fontFamily', () => {
    it('[P0] colors is a full theme override (in config.theme, not in extend) (AC-11)', () => {
      const topLevel = config.theme ?? {};
      const extend = topLevel.extend ?? {};
      expect(topLevel.colors).toBeDefined();
      expect(extend.colors).toBeUndefined();
    });

    it('[P0] borderRadius is a full theme override (in config.theme, not in extend) (AC-11)', () => {
      const topLevel = config.theme ?? {};
      const extend = topLevel.extend ?? {};
      expect(topLevel.borderRadius).toBeDefined();
      expect(extend.borderRadius).toBeUndefined();
    });

    it('[P0] fontFamily is a full theme override (in config.theme, not in extend) (AC-11)', () => {
      const topLevel = config.theme ?? {};
      const extend = topLevel.extend ?? {};
      expect(topLevel.fontFamily).toBeDefined();
      expect(extend.fontFamily).toBeUndefined();
    });

    it('[P0] spacing remains in theme.extend (not a full override) (AC-11)', () => {
      const extend = (config.theme ?? {}).extend ?? {};
      expect(extend.spacing).toBeDefined();
    });

    it('[P0] fontSize remains in theme.extend (not a full override) (AC-11)', () => {
      const extend = (config.theme ?? {}).extend ?? {};
      expect(extend.fontSize).toBeDefined();
    });

    it('[P0] boxShadow remains in theme.extend (not a full override) (AC-11)', () => {
      const extend = (config.theme ?? {}).extend ?? {};
      expect(extend.boxShadow).toBeDefined();
    });
  });
});
