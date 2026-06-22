/**
 * design-sync standalone Tailwind config.
 * Reuses the repo's theme but widens `content` to include the authored preview
 * cards so utilities used only in previews are emitted into ds-styles.css.
 * Compile (from repo root):
 *   npx tailwindcss -c .design-sync/tailwind.dssync.ts -i app/globals.css -o .design-sync/ds-styles.css --minify
 */
import type { Config } from 'tailwindcss'
import base from '../tailwind.config'

const config: Config = {
  ...base,
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
    './.design-sync/previews/**/*.{ts,tsx}',
    './.design-sync/ds-entry.tsx',
  ],
}

export default config
