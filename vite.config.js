import { defineConfig } from 'vite';
import { resolve } from 'path';
import { readdirSync } from 'fs';

// Find all HTML files
const htmlFiles = readdirSync('.').filter(f => f.endsWith('.html'));
const input = Object.fromEntries(
  htmlFiles.map(file => [file.replace('.html', ''), resolve(__dirname, file)])
);

export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: { input }
  },
  server: {
    port: 3000,
    open: '/index.html'
  },
  preview: {
    port: 4173
  }
});
