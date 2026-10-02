// The browser UI colour (<meta name="theme-color">) follows the page background Nuxt UI
// paints: white in light mode, the neutral palette's 900 shade in dark mode (--ui-bg). The
// neutral comes from app.config.ts, so re-theming there keeps the browser chrome in step.
// Hex values of Tailwind v4's neutral palettes at 900; an unknown palette falls back to zinc,
// the console's locked neutral. Pure: unit-tested in test/unit/page-title.test.ts.

const NEUTRAL_900_HEX: Record<string, string> = {
  slate: '#0f172b',
  gray: '#101828',
  zinc: '#18181b',
  neutral: '#171717',
  stone: '#1c1917'
}

export function themeColorFor(mode: string, neutral: string | null | undefined): string {
  if (mode !== 'dark') return '#ffffff'
  return NEUTRAL_900_HEX[neutral ?? ''] ?? NEUTRAL_900_HEX.zinc!
}
