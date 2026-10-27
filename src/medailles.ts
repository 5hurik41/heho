// Les médailles du chef (BRIEF.md, « Médailles » ; planche docs/bloc3.html) : leurs paliers, le calcul de celles
// qui sont gagnées, et leur dessin en 16 × 16 pixels, que scripts/generer-icones.mts reprend pour les images des
// notifications. Aucun import à l'exécution : le script le charge tel quel.
import type { Batiment, Journee } from './stockage'

type Famille = 'etages' | 'batiments' | 'series' | 'exploits'
type Icone = 'etage' | 'batiment' | 'serie' | 'tour' | 'trois' | 'minuit'

export type Medaille = { id: string; famille: Famille; titre: string; texte: string; icone: Icone; ruban: string; palier: 0 | 1 | 2 | 3 }

const paliers = (famille: Famille, icone: Icone, ruban: string, liste: [number, string][], unite: (n: number) => string): Medaille[] =>
  liste.map(([n, titre], i) => ({
    id: `${famille}-${n}`,
    famille,
    titre,
    texte: unite(n),
    icone,
    ruban,
    // Bronze, argent, or ; le quatrième palier d'une famille, à la lampe.
    palier: (i === 3 ? 3 : Math.min(i, 2)) as Medaille['palier'],
  }))

export const MEDAILLES: Medaille[] = [
  ...paliers('etages', 'etage', '#89b4fa', [[10, 'Premiers étages'], [100, 'Cent étages'], [500, 'Cinq cents'], [1000, 'Mille étages']], n => `${n} étages posés`),
  ...paliers('batiments', 'batiment', '#a6e3a1', [[1, 'Premier bâtiment'], [10, 'Une rue'], [50, 'Un quartier'], [100, 'Une ville']], n => (n === 1 ? 'Un chantier fini' : `${n} chantiers finis`)),
  ...paliers('series', 'serie', '#fab387', [[3, 'Trois jours'], [7, 'Une semaine'], [30, 'Un mois']], n => `${n} jours d'affilée avec au moins une brique`),
  { id: 'exploit-tour', famille: 'exploits', titre: 'La tour', texte: 'Un bâtiment de 12 étages ou plus', icone: 'tour', ruban: '#cba6f7', palier: 2 },
  { id: 'exploit-triple', famille: 'exploits', titre: 'Triplé', texte: '3 bâtiments dans la même journée', icone: 'trois', ruban: '#cba6f7', palier: 2 },
  { id: 'exploit-nuit', famille: 'exploits', titre: 'Équipe de nuit', texte: 'Un chantier fini entre minuit et 5 h', icone: 'minuit', ruban: '#cba6f7', palier: 2 },
]

// Le jour qui précède « 2026-10-27 », sans passer par les fuseaux.
const veille = (jour: string): string => {
  const [a, m, j] = jour.split('-').map(Number)
  const d = new Date(a!, m! - 1, j! - 1)

  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// La plus longue suite de jours d'affilée avec au moins une brique.
export const plusLongueSerie = (journees: Journee[]): number => {
  const actifs = new Set(journees.filter(j => j.briques > 0).map(j => j.jour))
  let meilleure = 0
  for (const jour of actifs) {
    if (actifs.has(veille(jour))) continue
    let n = 1
    let suivant = jour
    // Chaque série se compte depuis son premier jour, en avançant tant que le lendemain a des briques.
    for (;;) {
      const [a, m, j] = suivant.split('-').map(Number)
      const d = new Date(a!, m! - 1, j! + 1)
      suivant = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      if (!actifs.has(suivant)) break
      n += 1
    }
    meilleure = Math.max(meilleure, n)
  }

  return meilleure
}

// Les médailles gagnées, d'après le mur du chef (tous les jours, sans plafond) et le quartier (ses derniers bâtiments).
export const gagnees = (journees: Journee[], quartier: Batiment[]): Set<string> => {
  const etages = journees.reduce((s, j) => s + j.briques, 0)
  const batiments = journees.reduce((s, j) => s + j.murs, 0)
  const serie = plusLongueSerie(journees)
  const ids = new Set<string>()
  for (const m of MEDAILLES) {
    const seuil = Number(m.id.split('-')[1])
    if (m.famille === 'etages' && etages >= seuil) ids.add(m.id)
    if (m.famille === 'batiments' && batiments >= seuil) ids.add(m.id)
    if (m.famille === 'series' && serie >= seuil) ids.add(m.id)
  }
  if (quartier.some(b => b.etages >= 12)) ids.add('exploit-tour')
  if (journees.some(j => j.murs >= 3)) ids.add('exploit-triple')
  if (quartier.some(b => new Date(b.date).getHours() < 5)) ids.add('exploit-nuit')

  return ids
}

// ── Le dessin : un ruban en V, un disque du métal du palier, l'icône à l'encre au centre ──

const ICONES: Record<Icone, string[]> = {
  etage: ['.XXXXX.', '.X.X.X.', '.XXXXX.', '.X.X.X.', '.XXXXX.', '.X.X.X.', '.XXXXX.'],
  batiment: ['...X...', '..XXX..', '.XXXXX.', 'XXXXXXX', '.X...X.', '.X.X.X.', '.XXXXX.'],
  serie: ['...X...', '..XX...', '..XXX..', '.XXXXX.', '.XX.XX.', '.X...X.', '..XXX..'],
  tour: ['..XXX..', '..X.X..', '..XXX..', '..X.X..', '..XXX..', '..X.X..', '.XXXXX.'],
  trois: ['.....X.', '.X...X.', '.X.X.X.', '.X.X.X.', '.X.X.X.', 'XX.X.XX', 'XXXXXXX'],
  minuit: ['..XXX..', '.XX....', 'XX.....', 'XX.....', 'XX.....', '.XX....', '..XXX..'],
}
const METAUX: [string, string][] = [['#C9814A', '#8A532B'], ['#C7CBD3', '#878C96'], ['#F2C14E', '#B48A22'], ['#F5C542', '#FF7A2F']]

export const grilleMedaille = (m: Medaille, gagnee: boolean): (string | null)[][] => {
  const [metal, bord] = gagnee ? METAUX[m.palier]! : ['#34363C', '#2A2C30']
  const encre = gagnee ? '#1B1C1E' : '#202226'

  return Array.from({ length: 16 }, (_, y) =>
    Array.from({ length: 16 }, (_, x) => {
      const d = Math.hypot(x + 0.5 - 8, y + 0.5 - 10)
      let c: string | null = null
      if (y < 5 && ((x >= 3 + y && x <= 4 + y) || (x >= 11 - y && x <= 12 - y))) c = gagnee ? m.ruban : '#2A2C30'
      if (d <= 5.9) c = d > 4.7 ? bord : metal
      const iy = y - 7
      const ix = x - 4
      if (iy >= 0 && iy < 7 && ix >= 0 && ix < 7 && ICONES[m.icone][iy]![ix] === 'X' && d <= 4.7) c = encre

      return c
    }),
  )
}

export const svgMedaille = (m: Medaille, gagnee: boolean): string => {
  const rects = grilleMedaille(m, gagnee).flatMap((l, y) => l.map((c, x) => (c ? `<rect x="${x}" y="${y}" width="1" height="1" fill="${c}"/>` : '')))

  return `<svg viewBox="0 0 16 16" shape-rendering="crispEdges" aria-hidden="true">${rects.join('')}</svg>`
}
