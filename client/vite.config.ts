import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    outDir: '../Shadows.Server/wwwroot',
    emptyOutDir: true,
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
