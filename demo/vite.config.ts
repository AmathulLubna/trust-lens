import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
export default defineConfig({root,plugins:[react()],server:{host:'127.0.0.1',port:5175,strictPort:true},
  build:{outDir:'dist-controlled-demo',emptyOutDir:true,rollupOptions:{input:fileURLToPath(new URL('./index.html',import.meta.url))}}});
