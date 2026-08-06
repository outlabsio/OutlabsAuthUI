// The ENTIRE theme. Non-negotiable: vanilla Nuxt UI, semantic colors only, primary = amber.
// No bespoke components, no `ui`-prop surgery, no custom CSS. Change these two lines to re-theme.
export default defineAppConfig({
  ui: {
    colors: {
      primary: 'amber',
      neutral: 'zinc'
    }
  }
})
