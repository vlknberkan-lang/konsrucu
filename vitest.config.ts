/** KonsRücü — vitest yapılandırması. Testler tests/ altında; '@/...' takma adı tsconfig ile aynı. */
import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname),
      // 'server-only' Node/vitest ortamında import edilince throw eder (react-server condition yok).
      // Saf fonksiyonları (ör. masraf-cikar → pdf-metin) test edebilmek için boş modüle yönlendir.
      'server-only': path.resolve(__dirname, 'tests/stubs/server-only.ts'),
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    // prisma/supabase import eden modüller (durum.ts, masraf-cikar.ts) construct sırasında env ister;
    // testler yalnız saf fonksiyon çağırır (DB'ye gitmez), sahte env yeterli.
    setupFiles: ['tests/setup.ts'],
  },
})
