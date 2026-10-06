import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/* `@/`-alias kuten tsconfigissa, jotta komponentteja voi testata, ja
   `server-only` tyhjäksi: se heittää tarkoituksella kaikkialla paitsi
   Nextin palvelinpaketissa, mutta PDF-generaattoreita halutaan testata. */
export default defineConfig({
  esbuild: { jsx: 'automatic' },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      'server-only': fileURLToPath(new URL('./tests/stubs/server-only.ts', import.meta.url)),
    },
  },
});
