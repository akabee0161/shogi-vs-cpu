import { defineConfig } from 'vite';

export default defineConfig({
  base: '/play/shogi-vs-cpu/',
  build: {
    outDir: 'out/play/shogi-vs-cpu',
    emptyOutDir: true,
  },
});
