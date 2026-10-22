import { describe, expect, it } from 'vitest';
import { DEFAULT_PREFERENCES, sanitizePreferences } from './preferences';

describe('sanitizePreferences', () => {
  it('keeps valid values and drops unknown or invalid ones', () => {
    expect(sanitizePreferences({ theme: 'light', accent: 'violet', fontScale: 110, density: 'huge', bogus: 1, infiniteScroll: false })).toEqual({
      ...DEFAULT_PREFERENCES,
      theme: 'light',
      accent: 'violet',
      fontScale: 110,
      infiniteScroll: false,
    });
  });

  it('falls back to defaults for garbage', () => {
    expect(sanitizePreferences(null)).toEqual(DEFAULT_PREFERENCES);
    expect(sanitizePreferences('dark')).toEqual(DEFAULT_PREFERENCES);
  });
});
