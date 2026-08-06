// The ENTIRE theme. Still vanilla Nuxt UI — semantic aliases mapped to Tailwind built-in
// palettes (no custom CSS, no `ui`-prop surgery, no bespoke components). primary = amber,
// neutral = zinc are locked. The rest are mapped to DISTINCT hues (the stock defaults collide:
// warning≈primary both amber/yellow, secondary≈info both blue) so badges get real variety, and
// `accent` + `special` are extra aliases for more range. Re-theme by editing this map.
export default defineAppConfig({
  ui: {
    colors: {
      primary: 'amber',
      secondary: 'violet',
      success: 'green',
      info: 'sky',
      warning: 'orange',
      error: 'red',
      neutral: 'zinc',
      accent: 'teal',
      special: 'fuchsia'
    }
  }
})
