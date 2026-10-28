// Un pictogramme de 8 × 8 pixels par type d'appel, posé sur la vignette de l'historique : on reconnaît le type sans
// lire. Dessinés tels quels, X = pixel plein ; la couleur vient du CSS (currentColor).
import type { Situation } from './message'

const DESSINS: Record<Situation, string[]> = {
  question: ['.XXXX...', 'XX..XX..', '....XX..', '...XX...', '..XX....', '........', '..XX....', '........'],
  permission: ['........', '.XXX....', 'X...X...', 'X...XXXX', 'X...X.XX', '.XXX....', '........', '........'],
  done: ['........', '.......X', '......XX', 'X....XX.', 'XX..XX..', '.XXXX...', '..XX....', '........'],
  recap: ['..XXXX..', '.X....X.', '.XXXXXX.', '.X....X.', '.X.XX.X.', '.X....X.', '.X.XX.X.', '.XXXXXX.'],
  budget: ['........', '..XXXX..', '.X....X.', 'X..X...X', 'X...X..X', 'X....X.X', '........', '........'],
  fond: ['........', '.XXXXXX.', 'X..XX..X', 'XXXXXXXX', 'X..XX..X', 'X..XX..X', 'XXXXXXXX', '........'],
  'fond-fini': ['........', '.XXXXXX.', 'X..XX..X', 'XXXXXXXX', 'X..XX..X', 'X..XX..X', 'XXXXXXXX', '........'],
  bilan: ['XXX.XXXX', 'XXX.XXXX', '........', 'X.XXXX.X', 'X.XXXX.X', '........', 'XXX.XXXX', 'XXX.XXXX'],
  // Un panneau stop : le chantier ne bouge plus.
  arret: ['..XXXX..', '.XXXXXX.', 'XXXXXXXX', 'X......X', 'XXXXXXXX', '.XXXXXX.', '..XXXX..', '........'],
}

const svg = (dessin: string[]): string => {
  const rects = dessin.flatMap((l, y) => l.split('').map((c, x) => (c === 'X' ? `<rect x="${x}" y="${y}" width="1" height="1"/>` : ''))).join('')

  return `<svg viewBox="0 0 8 8" shape-rendering="crispEdges" fill="currentColor" aria-hidden="true">${rects}</svg>`
}

const PICTOS = Object.fromEntries(Object.entries(DESSINS).map(([s, d]) => [s, svg(d)])) as Record<Situation, string>

export const picto = (s: Situation): string => `<span class="picto">${PICTOS[s]}</span>`
