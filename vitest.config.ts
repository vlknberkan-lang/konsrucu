/** KonsRücü — vitest yapılandırması. Testler tests/ altında; '@/...' takma adı tsconfig ile aynı. */
import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname) },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
})
