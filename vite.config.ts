import { createHash } from 'node:crypto'
import { readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { defineConfig, type Plugin } from 'vite'

// Les fichiers de public/, sauf les grandes images des notifications et des médailles : Chrome les télécharge lui-même à
// l'arrivée d'un push, qui suppose le réseau.
const fichiersPublics = (dossier: string): string[] =>
  readdirSync(dossier, { withFileTypes: true, recursive: true })
    .filter(f => f.isFile())
    .map(f => relative(dossier, join(f.parentPath, f.name)).replace(/\\/g, '/'))
    .filter(f => !f.startsWith('notifications/') && !f.startsWith('medailles/'))

// Écrit dans sw.js la liste des fichiers que l'appli garde pour s'ouvrir hors ligne, et une version tirée de
// cette liste : un nouveau build change la version, le service worker remplace alors l'ancien cache.
const listeHorsLigne = (): Plugin => ({
  name: 'heho-hors-ligne',
  apply: 'build',
  generateBundle(_, bundle) {
    const sw = bundle['sw.js']
    if (!sw || sw.type !== 'chunk') return
    const fichiers = ['./', ...[...Object.keys(bundle).filter(f => f !== 'sw.js'), ...fichiersPublics('public')].map(f => `./${f}`)]
    const version = createHash('sha256').update(fichiers.join('\n')).digest('hex').slice(0, 12)
    // Les marques sont remplacées telles quelles, quels que soient les guillemets que le minificateur a mis
    // autour : d'où une liste séparée par « | », sans guillemet ni « $ » (vérifié ci-dessous).
    if (fichiers.some(f => /[|'"`$\\]/.test(f))) this.error(`nom de fichier impossible à écrire dans sw.js : ${fichiers.join(', ')}`)
    if (!sw.code.includes('__FICHIERS__') || !sw.code.includes('__VERSION__')) this.error('sw.js : marques __FICHIERS__ ou __VERSION__ introuvables')
    sw.code = sw.code.replace('__FICHIERS__', fichiers.join('|')).replace('__VERSION__', version)
  },
})

// Chemins relatifs : la page vit sous <compte>.github.io/heho/. Le service worker garde un nom fixe,
// sw.js, à la racine, pour que sa portée couvre toute l'appli.
export default defineConfig({
  base: './',
  // L'heure du build, affichée dans Réglages (src/main.ts).
  define: { __CONSTRUIT__: JSON.stringify(new Date().toISOString()) },
  plugins: [listeHorsLigne()],
  build: {
    rollupOptions: {
      input: { main: 'index.html', sw: 'src/sw.ts' },
      output: { entryFileNames: chunk => (chunk.name === 'sw' ? 'sw.js' : 'assets/[name]-[hash].js') },
    },
  },
})
