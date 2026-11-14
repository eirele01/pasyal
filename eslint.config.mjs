// Pasyal — ESLint flat config (NFR-MNT-03).
// `@nuxt/eslint` + `eslint` were owner-approved on 2026-11-11 (not in the
// SPEC §1.5 list — recorded in README "Dependencies" and project-state.md
// D22). The module generates `.nuxt/eslint.config.mjs` (run `nuxt prepare`),
// which already covers Vue SFCs, TypeScript, `app/`, `server/`, `tests/`
// and ignores build output.
import withNuxt from './.nuxt/eslint.config.mjs'

export default withNuxt(
  // Project-level adjustments on top of the generated Nuxt preset.
  {
    rules: {
      // The M0–M6 code was written before linting existed; these keep the
      // preset's correctness rules while avoiding pure style churn on a
      // reviewed codebase. Loosen deliberately, never silently.
      'vue/html-self-closing': 'off',
      'vue/max-attributes-per-line': 'off',
      'vue/singleline-html-element-content-newline': 'off',
      'vue/html-indent': 'off',
      'vue/html-closing-bracket-newline': 'off',
      'vue/first-attribute-linebreak': 'off',
    },
  },
  // Lint the standalone scripts too (check-bundle.mjs, lighthouse.mjs).
  {
    files: ['scripts/**/*.mjs'],
    rules: {
      'nuxt/prefer-import-meta-types': 'off',
    },
  },
  // shadcn-vue generated components (app/components/ui/**): the
  // `require-default-prop` rule fights the generated code style — optional
  // props (class/variant/size) intentionally carry no `default` because
  // cva/the cn() merge supplies runtime defaults. Upstream shadcn-vue
  // projects disable this rule; regenerate-friendly, no hand edits.
  {
    files: ['app/components/ui/**'],
    rules: {
      'vue/require-default-prop': 'off',
    },
  },
)
