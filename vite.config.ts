import { defineConfig } from 'vite'

// Chemins relatifs : la page vit sous <compte>.github.io/heho/. Le service worker garde un nom fixe,
// sw.js, à la racine, pour que sa portée couvre toute l'appli.
export default defineConfig({
  base: './',
  build: {
    rollupOptions: {
      input: { main: 'index.html', sw: 'src/sw.ts' },
      output: { entryFileNames: chunk => (chunk.name === 'sw' ? 'sw.js' : 'assets/[name]-[hash].js') },
    },
  },
})
