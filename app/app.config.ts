// The entire theme: semantic colour aliases mapped to stock Tailwind palettes. primary = amber
// and neutral = zinc are locked; the other aliases get distinct hues so status and badge colours
// are distinguishable (the stock warning and secondary collide with primary and info), and
// `accent` + `special` add range. Keeping this 9-alias palette is a recorded owner decision
// (ARCHITECTURE.md, "Decisions"). Components use the aliases only; lint rejects raw palette
// classes, arbitrary values and `:ui` outside its allowlist (AGENTS.md, "Styling").
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
