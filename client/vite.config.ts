import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    outDir: '../Shadows.Server/wwwroot',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        editor: resolve(__dirname, 'editor.html'),
      },
    },
  },
  server: {
    proxy: {
      '/ws': {
        target: 'http://localhost:5000',
        ws: true,
      },
    },
  },
  assetsInclude: ['**/*.wgsl'],
});
