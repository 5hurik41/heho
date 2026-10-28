// Les douze ouvriers de Hého (BRIEF.md, « Refonte graphique », lot B de docs/refonte/planche.html) : un corps de
// 11 × 13 pixels, un chapeau, des couleurs et un outil par métier, deux images chacun, et un contour d'encre.
// scripts/generer-icones.mts en tire les SVG de la scène, les vignettes et les grandes images des notifications.
import type { Role } from './message'

export type Grille = (string | null)[][]

const ENCRE = '#0E0F11'

// De face, tourné vers la droite. H chapeau (h ombre, W reflet), S peau (s ombre), k encre, V veste (v ombre),
// R bande réfléchissante, A manche, G main, P pantalon (p ombre), B botte.
const CORPS = ['....HHH....', '...HWHHH...', '..hhhhhhh..', '....SSkS...', '....sSSS...', '...AVVVVA..', '...AVRRVA..', '...AVVVVA..', '...GvvvvG..', '....PPPP...', '....PP.PP..', '....Pp.Pp..', '....BBB.BBB']
const MARCHE: Record<number, string> = { 9: '....PPPP...', 10: '...PP..PP..', 11: '...Pp..Pp..', 12: '..BBB..BBB.' }
export const HAUTEUR_CORPS = CORPS.length
export const LARGEUR_CORPS = CORPS[0]!.length

// Les trois premières lignes remplacent celles du corps ; les suivantes se posent par-dessus.
const CHAPEAUX: Record<string, string[]> = {
  casque: ['....HHH....', '...HWHHH...', '..hhhhhhh..'],
  casquette: ['...........', '...HHHH....', '...HHHHhhh.'],
  bonnet: ['.....h.....', '....HHH....', '...hhhhh...'],
  cheveux: ['...........', '....HHH....', '...HHHHH...', '...HHSkS...'],
  safari: ['....HHH....', '...HHHHH...', '.hhhhhhhhh.'],
  masque: ['....HHH....', '...HWHHH...', '..hhhhhhh..', '....TNNT...', '....TTTT...'],
}

type Pixel = [x: number, y: number, c: string]
const forme = (lignes: string[], x: number, y: number): Pixel[] =>
  lignes.flatMap((l, j) => [...l].flatMap((c, i): Pixel[] => (c === '.' ? [] : [[x + i, y + j, c]])))
const manche = (x: number, y: number, l: number): Pixel[] => Array.from({ length: l }, (_, i): Pixel => [x, y + i, 't'])

// Chaque outil en deux images ; la main de devant est en (8, 8).
const OUTILS: Record<string, [Pixel[], Pixel[]]> = {
  marteau: [[...manche(9, 5, 3), ...forme(['TTT'], 8, 4), [8, 3, 'T']], [[9, 8, 't'], [10, 8, 't'], [11, 8, 't'], ...forme(['T', 'TT', 'T'], 12, 7)]],
  planchette: [forme(['TT.', 'WDW', 'WWW', 'WDW'], 9, 5), forme(['TT.', 'WDW', 'WZW', 'ZWW'], 9, 5)],
  cle: [[...manche(9, 5, 3), ...forme(['T.T', 'T.T'], 8, 3)], [[9, 8, 'T'], [10, 7, 'T'], [11, 6, 'T'], [12, 5, 'T'], [11, 4, 'T'], [13, 5, 'T'], [13, 6, 'T']]],
  rouleau: [[...manche(9, 6, 2), [9, 5, 'T'], [9, 4, 'T'], ...forme(['CCCC', 'cccc'], 8, 2)], [...manche(9, 7, 2), [9, 6, 'T'], ...forme(['CCCC', 'cccc'], 8, 4)]],
  colis: [forme(['UTUU', 'UTUU', 'uuuu'], 8, 6), forme(['UTUU', 'UTUU', 'uuuu'], 8, 5)],
  loupe: [[...manche(9, 6, 2), ...forme(['TTT', 'TFT', 'TTT'], 9, 3)], [...manche(9, 5, 2), ...forme(['TTT', 'TWT', 'TTT'], 9, 2)]],
  bulle: [
    [...forme(['.WWWWW.', 'WWkkWWW', 'WWWWkWW', 'WWWkWWW', 'WWWWWWW', 'WWWkWWW', '.WWWWW.'], 8, -9), [8, -2, 'W']],
    [...forme(['.WWWWW.', 'WWkkWWW', 'WWWWkWW', 'WWWkWWW', 'WWWWWWW', 'WWWkWWW', '.WWWWW.'], 8, -10), [8, -3, 'W']],
  ],
  tasse: [[...forme(['WWW', 'WW.'], 9, 7), [9, 5, 'D'], [10, 4, 'D']], [...forme(['WWW', 'WW.'], 9, 6), [10, 4, 'D'], [9, 3, 'D'], [10, 2, 'D']]],
  chalumeau: [[...forme(['TTT'], 9, 8), [12, 8, 'F'], [13, 7, 'Y'], [13, 9, 'O']], [...forme(['TTT'], 9, 8), [12, 8, 'F'], [13, 8, 'F'], [14, 6, 'Y'], [14, 10, 'Y'], [13, 10, 'O']]],
  panneau: [[...manche(9, 4, 5), ...forme(['.XX.', 'XWWX', 'XXXX', '.XX.'], 8, 0)], [...manche(9, 4, 5), ...forme(['.ZZ.', 'ZWWZ', 'ZZZZ', '.ZZ.'], 8, 0)]],
  piqueur: [
    [...forme(['TTTT', '.NN.', '.NN.', '.NN.', '.T..', '.T..'], 8, 7)],
    [...forme(['TTTT', '.NN.', '.NN.', '.T..', '.T..'], 8, 8), [7, 12, 'D'], [11, 12, 'D'], [12, 11, 'D']],
  ],
  brouette: [
    [[9, 8, 't'], [10, 8, 't'], ...forme(['MMMMM', 'MmmM.', '.MM..'], 11, 8), [12, 11, 't'], ...forme(['.N.', 'NAN', '.N.'], 13, 11)],
    [[9, 8, 't'], [10, 8, 't'], ...forme(['MMMMM', 'MmmM.', '.MM..'], 11, 8), [12, 11, 't'], ...forme(['.N.', 'ANA', '.N.'], 13, 11)],
  ],
}

type Metier = { nom: string; chapeau: string; outil: string; H: [string, string]; V: [string, string]; R: string; A: string | 'peau'; P: [string, string]; peau: 0 | 1 | 2; marche?: boolean }

// Les huit rôles de task-steps et les quatre de l'équipe tirée des outils (BRIEF.md, « Équipe tirée des outils »).
export const METIERS: Record<Role, Metier> = {
  builder: { nom: 'Le bâtisseur', chapeau: 'casque', outil: 'marteau', H: ['#F5C542', '#B8862A'], V: ['#FF7A2F', '#C4531A'], R: '#F4F1E8', A: '#3366AA', P: ['#3366AA', '#22477A'], peau: 0 },
  foreman: { nom: 'La cheffe', chapeau: 'casque', outil: 'planchette', H: ['#F4F1E8', '#B9B6AC'], V: ['#F5C542', '#B8862A'], R: '#F4F1E8', A: '#F4F1E8', P: ['#505664', '#3C404A'], peau: 2 },
  mechanic: { nom: 'Le mécanicien', chapeau: 'casquette', outil: 'cle', H: ['#3366AA', '#22477A'], V: ['#2F7FA8', '#1F5A78'], R: '#F5C542', A: '#2F7FA8', P: ['#2F7FA8', '#1F5A78'], peau: 1 },
  painter: { nom: 'La peintre', chapeau: 'casquette', outil: 'rouleau', H: ['#F4F1E8', '#B9B6AC'], V: ['#F4F1E8', '#C9C6BC'], R: '#E879A8', A: '#E0443C', P: ['#F4F1E8', '#C9C6BC'], peau: 0 },
  courier: { nom: 'Le coursier', chapeau: 'casquette', outil: 'colis', H: ['#3FA89A', '#22766C'], V: ['#3FA89A', '#22766C'], R: '#F5C542', A: '#3FA89A', P: ['#505664', '#3C404A'], peau: 2, marche: true },
  researcher: { nom: 'La géomètre', chapeau: 'safari', outil: 'loupe', H: ['#D9B97A', '#A88A4E'], V: ['#6FAF5B', '#3E7A34'], R: '#F4F1E8', A: '#6FAF5B', P: ['#505664', '#3C404A'], peau: 1 },
  thinker: { nom: 'Le penseur', chapeau: 'cheveux', outil: 'bulle', H: ['#3C2E25', '#2A201A'], V: ['#8E8CD8', '#5E5BB0'], R: '#8E8CD8', A: '#8E8CD8', P: ['#505664', '#3C404A'], peau: 0 },
  resting: { nom: 'La pause café', chapeau: 'bonnet', outil: 'tasse', H: ['#E0443C', '#A82A24'], V: ['#6FAF5B', '#3E7A34'], R: '#F4F1E8', A: '#6FAF5B', P: ['#3366AA', '#22477A'], peau: 2 },
  welder: { nom: 'La soudeuse', chapeau: 'masque', outil: 'chalumeau', H: ['#5E606A', '#3C404A'], V: ['#8A5A44', '#5E3E2E'], R: '#8A5A44', A: '#8A5A44', P: ['#505664', '#3C404A'], peau: 1 },
  signaler: { nom: 'Le signaleur', chapeau: 'casque', outil: 'panneau', H: ['#FF7A2F', '#C4531A'], V: ['#D8F04A', '#9AB02A'], R: '#F4F1E8', A: '#D8F04A', P: ['#3366AA', '#22477A'], peau: 1 },
  digger: { nom: 'Le terrassier', chapeau: 'casque', outil: 'piqueur', H: ['#F5C542', '#B8862A'], V: ['#FF7A2F', '#C4531A'], R: '#F4F1E8', A: 'peau', P: ['#FF7A2F', '#C4531A'], peau: 2 },
  mason: { nom: 'La maçonne', chapeau: 'casque', outil: 'brouette', H: ['#F4F1E8', '#B9B6AC'], V: ['#FF7A2F', '#C4531A'], R: '#F4F1E8', A: '#505664', P: ['#3366AA', '#22477A'], peau: 0, marche: true },
}

const PEAUX: [string, string][] = [['#E9B48F', '#C98F6B'], ['#C68B5E', '#A06C44'], ['#8D5A3B', '#6E4329']]

// Les pixels d'un ouvrier, en coordonnées du corps (le coin haut gauche du corps en 0, 0).
const pixels = (role: Role, image: number): Map<string, string> => {
  const m = METIERS[role]
  const grille = CORPS.map(l => [...l])
  CHAPEAUX[m.chapeau]!.forEach((l, y) => {
    if (y < 3) grille[y] = [...l]
    else [...l].forEach((c, x) => c !== '.' && (grille[y]![x] = c))
  })
  if (m.marche && image === 1) for (const [y, l] of Object.entries(MARCHE)) grille[Number(y)] = [...l]
  const [peau, peau2] = PEAUX[m.peau]!
  const pal: Record<string, string> = {
    H: m.H[0], h: m.H[1], W: '#FFF0BF', S: peau, s: peau2, k: ENCRE, V: m.V[0], v: m.V[1], R: m.R, A: m.A === 'peau' ? peau : m.A,
    G: m.chapeau === 'masque' ? '#3C2E25' : peau, P: m.P[0], p: m.P[1], B: '#4A3A2E', T: '#9CA0A8', t: '#A88A4E', N: '#2B2D33',
    C: '#E0443C', c: '#A82A24', U: '#C9A06A', u: '#9A7444', F: '#BFF0FF', Y: '#FFE45C', O: '#FF9A3C', X: '#E0443C', Z: '#5FBF5A',
    D: '#9A968C', M: '#8C9098', m: '#C9B48A',
  }
  const p = new Map<string, string>()
  grille.forEach((l, y) => l.forEach((c, x) => c !== '.' && p.set(`${x},${y}`, pal[c]!)))
  for (const [x, y, c] of OUTILS[m.outil]![image % 2]!) p.set(`${x},${y}`, pal[c]!)

  return p
}

// La boîte commune à tous les ouvriers et toutes leurs images, contour compris : dans la scène, chaque SVG a la
// même taille et le corps à la même place, les pieds sur la même ligne.
const ROLES_DESSINES = Object.keys(METIERS) as Role[]
const etendue = (() => {
  let x0 = 0, y0 = 0, x1 = LARGEUR_CORPS - 1, y1 = HAUTEUR_CORPS - 1
  for (const r of ROLES_DESSINES)
    for (const i of [0, 1])
      for (const k of pixels(r, i).keys()) {
        const [x, y] = k.split(',').map(Number) as [number, number]
        x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y)
      }

  return { x0: x0 - 1, y0: y0 - 1, x1: x1 + 1, y1: y1 + 1 }
})()
// `corpsX`, `corpsY` : le coin haut gauche du corps dans la boîte ; `pieds` : la ligne sous les semelles.
export const BOITE = {
  largeur: etendue.x1 - etendue.x0 + 1,
  hauteur: etendue.y1 - etendue.y0 + 1,
  corpsX: -etendue.x0,
  corpsY: -etendue.y0,
  pieds: -etendue.y0 + HAUTEUR_CORPS,
}

const avecContour = (p: Map<string, string>, x0: number, y0: number, l: number, h: number): Grille => {
  const plein = (x: number, y: number) => p.has(`${x + x0},${y + y0}`)

  return Array.from({ length: h }, (_, y) =>
    Array.from({ length: l }, (_, x) =>
      p.get(`${x + x0},${y + y0}`) ?? (plein(x - 1, y) || plein(x + 1, y) || plein(x, y - 1) || plein(x, y + 1) ? ENCRE : null),
    ),
  )
}

// Un ouvrier dans la boîte commune (la scène, les passants).
export const ouvrierEnBoite = (role: Role, image: number): Grille => avecContour(pixels(role, image), etendue.x0, etendue.y0, BOITE.largeur, BOITE.hauteur)

// Un ouvrier au plus juste (les vignettes et les grandes images des notifications).
export const ouvrierSerre = (role: Role, image: number): Grille => {
  const p = pixels(role, image)
  const xs = [...p.keys()].map(k => Number(k.split(',')[0]))
  const ys = [...p.keys()].map(k => Number(k.split(',')[1]))
  const x0 = Math.min(...xs) - 1, y0 = Math.min(...ys) - 1

  return avecContour(p, x0, y0, Math.max(...xs) - x0 + 2, Math.max(...ys) - y0 + 2)
}
