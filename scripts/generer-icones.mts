// Génère le logo, les icônes Android et les ouvriers de l'appli dans public/. À relancer si le dessin change :
//   npm run icones -- [chemin de task-steps/hooks/sprites.ts]
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { BADGES, ROLES as ROLES_EQUIPE } from '../src/message.ts'

const SPRITES = process.argv[2] ?? join(homedir(), '.claude', 'mods-perso', 'task-steps', 'hooks', 'sprites.ts')
const PUBLIC = new URL('../public/', import.meta.url)
mkdirSync(new URL('icones/', PUBLIC), { recursive: true })
mkdirSync(new URL('ouvriers/', PUBLIC), { recursive: true })

type Grille = (string | null)[][]

// ── Le logo : casque à lampe frontale et bulle « HÉ ! », 32 × 25 pixels (BRIEF.md, direction B) ──

const ENCRE = '#0E0F11'
const ASPHALTE = '#1B1C1E'
const T: Record<string, string> = { k: ENCRE, Y: '#F5C542', h: '#B8862A', W: '#FFF0BF', L: '#FFFFFF', b: '#EDEAE0' }

// Dessiné tel quel, pixel par pixel : k encre, Y jaune lampe, h son ombre, W reflet, L lampe, b la bulle.
const LOGO = [
  '...............kkkkkkkkkkkkkkkk.',
  '..............kbbbbbbbbbbbbbbbbk',
  '..............kbbbbbbbbbkbbbbbbk',
  '..............kbbbbbbbbkbbbbbbbk',
  '..............kbbbbbbbbbbbbbbbbk',
  '..............kbbbkbkbkkkbbkbbbk',
  '..............kbbbkbkbkbbbbkbbbk',
  '..............kbbbkkkbkkbbbkbbbk',
  '..............kbbbkbkbkbbbbbbbbk',
  '..............kbbbkbkbkkkbbkbbbk',
  '..............kbbbbbbbbbbbbbbbbk',
  '..............kbbkkkkkkkkkkkkkk.',
  '..............kbk...............',
  '........kkkkkkkk................',
  '......kkYYhhYYkk................',
  '.....kYYYYhhYYYYk...............',
  '....kYWYYYkkYYYYYk..............',
  '...kYWYYYkLLkYYYYYk.............',
  '...kYWYYYkLLkYYYYYk.............',
  '..kYYYYYYkkkkYYYYYYk............',
  '..kYYYYYYYhhYYYYYYYk............',
  '..kYYYYYYYhhYYYYYYYk............',
  'kkkkkkkkkkkkkkkkkkkkkk..........',
  'khhhhhhhhhhhhhhhhhhhhk..........',
  'kkkkkkkkkkkkkkkkkkkkkk..........',
]
// Le casque seul, pour la petite icône de la barre d'état.
const LIGNE_CASQUE = 13
const LARGEUR_CASQUE = 22

const logo = (): Grille => {
  if (LOGO.some(l => l.length !== 32)) throw new Error('LOGO : chaque ligne doit faire 32 pixels')

  return LOGO.map(l => l.split('').map(c => (c === '.' ? null : T[c]!)))
}

// ── Sorties ──────────────────────────────────────────────────────────────

const svg = (g: Grille): string => {
  const h = g.length
  const w = g[0]!.length
  const rects = g.flatMap((l, y) => l.map((c, x) => (c ? `<rect x="${x}" y="${y}" width="1" height="1" fill="${c}"/>` : ''))).join('')

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges">${rects}</svg>`
}

const crcT = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1

  return c >>> 0
})
const crc = (b: Buffer): number => {
  let c = 0xffffffff
  for (const x of b) c = crcT[(c ^ x) & 255]! ^ (c >>> 8)

  return (c ^ 0xffffffff) >>> 0
}
const bloc = (type: string, d: Buffer): Buffer => {
  const l = Buffer.alloc(4)
  l.writeUInt32BE(d.length)
  const td = Buffer.concat([Buffer.from(type), d])
  const c = Buffer.alloc(4)
  c.writeUInt32BE(crc(td))

  return Buffer.concat([l, td, c])
}

type Poser = (x: number, y: number, c: string) => void

// Une image de `largeur` × `hauteur` px : un fond (ou rien), un décor, puis la grille agrandie `echelle` fois,
// centrée en largeur et, sauf `bas` (la ligne de ses pieds), en hauteur.
const png = (
  [largeur, hauteur]: [number, number],
  g: Grille,
  echelle: number,
  fond: string | null,
  { teinte, decor, bas }: { teinte?: string; decor?: (poser: Poser) => void; bas?: number } = {},
): Buffer => {
  const rgba = Buffer.alloc(largeur * hauteur * 4)
  const poser: Poser = (x, y, c) => {
    if (x < 0 || y < 0 || x >= largeur || y >= hauteur) return
    rgba.writeUInt32BE(((parseInt(c.slice(1), 16) << 8) | 0xff) >>> 0, (y * largeur + x) * 4)
  }
  if (fond) for (let y = 0; y < hauteur; y++) for (let x = 0; x < largeur; x++) poser(x, y, fond)
  decor?.(poser)
  const ox = Math.floor((largeur - g[0]!.length * echelle) / 2)
  const oy = bas === undefined ? Math.floor((hauteur - g.length * echelle) / 2) : bas - g.length * echelle
  g.forEach((l, gy) =>
    l.forEach((c, gx) => {
      if (!c) return
      for (let dy = 0; dy < echelle; dy++) for (let dx = 0; dx < echelle; dx++) poser(ox + gx * echelle + dx, oy + gy * echelle + dy, teinte ?? c)
    }),
  )
  const brut = Buffer.alloc((largeur * 4 + 1) * hauteur)
  for (let y = 0; y < hauteur; y++) rgba.copy(brut, y * (largeur * 4 + 1) + 1, y * largeur * 4, (y + 1) * largeur * 4)
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(largeur, 0)
  ihdr.writeUInt32BE(hauteur, 4)
  ihdr.set([8, 6, 0, 0, 0], 8)

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    bloc('IHDR', ihdr),
    bloc('IDAT', deflateSync(brut)),
    bloc('IEND', Buffer.alloc(0)),
  ])
}

const L = logo()
// Le casque seul, sans le bout de la queue de bulle posé sur sa première ligne. C'est l'icône de l'écran
// d'accueil (le logo entier y serait minuscule une fois découpé par Android ; choisi le 27 octobre 2026) et,
// en silhouette, la petite icône de la barre d'état.
const CASQUE_SEUL = L.slice(LIGNE_CASQUE).map((l, y) => l.slice(0, LARGEUR_CASQUE).map((c, x) => (y === 0 && x >= 14 ? null : c)))

// Le plus grand agrandissement entier (un pixel du dessin = n pixels de l'écran, donc net) qui tient :
// dans le cercle sûr de 80 % pour une icône maskable, dans 7/8 de la largeur sinon.
const echelle = (g: Grille, taille: number, maskable: boolean): number => {
  const h = g.length
  const l = g[0]!.length
  if (!maskable) return Math.floor((taille * 7) / 8 / Math.max(l, h))
  let rayon = 0
  g.forEach((ligne, y) =>
    ligne.forEach((c, x) => {
      if (c) rayon = Math.max(rayon, Math.hypot(Math.max(Math.abs(x - l / 2), Math.abs(x + 1 - l / 2)), Math.max(Math.abs(y - h / 2), Math.abs(y + 1 - h / 2))))
    }),
  )

  return Math.floor((taille * 0.4) / rayon)
}

// Une icône par densité d'écran Android (48 dp × 1 à 4) et la 512 du manifeste : aucune n'est réduite par le
// téléphone, qui prend la taille la plus proche.
// Le manifeste les déclare toutes (public/manifest.webmanifest).
const TAILLES = [48, 72, 96, 144, 192, 512]
for (const taille of TAILLES) {
  writeFileSync(new URL(`icones/icone-${taille}.png`, PUBLIC), png([taille, taille], CASQUE_SEUL, echelle(CASQUE_SEUL, taille, false), ASPHALTE))
  writeFileSync(new URL(`icones/icone-maskable-${taille}.png`, PUBLIC), png([taille, taille], CASQUE_SEUL, echelle(CASQUE_SEUL, taille, true), ASPHALTE))
}

writeFileSync(new URL('logo.svg', PUBLIC), svg(L))
writeFileSync(new URL('icones/favicon-32.png', PUBLIC), png([32, 32], L, 1, null))
writeFileSync(new URL('icones/badge-96.png', PUBLIC), png([96, 96], CASQUE_SEUL, 4, null, { teinte: '#FFFFFF' }))

// ── Les ouvriers, un par situation, tirés des sprites de task-steps ──

const { pixels, hex } = (await import(pathToFileURL(SPRITES).href)) as {
  pixels: (role: string, frame: number) => (number | null)[][]
  hex: (rgb: number) => string
}
const ROLES = { question: 'thinker', permission: 'foreman', done: 'resting', recap: 'painter', budget: 'mechanic', fond: 'courier' }

// Les sprites sont en Catppuccin, pour le terminal ; dans Hého ils passent aux couleurs de l'équipe de nuit :
// casques jaune lampe, gilets orange balise, bleus de travail, et un contour d'encre qui les détache de
// n'importe quelle couleur de badge.
const NUIT: Record<string, string> = {
  // peau, yeux ; bottes, pantalons et cheveux en ardoise, assez clairs pour que le contour d'encre se voie
  '#f2cdcd': '#E9B48F', '#11111b': ENCRE, '#585b70': '#505664', '#45475a': '#3C404A',
  // blancs et gris
  '#cdd6f4': '#F4F1E8', '#a6adc8': '#B9B6AC', '#9399b2': '#8C8F96', '#7f849c': '#9A968C',
  // jaune et orange : casques, gilets, accents
  '#f9e2af': '#F5C542', '#df8e1d': '#B8862A', '#fab387': '#FF7A2F',
  // vert : chercheur, ouvrier au café, coche de la planchette
  '#a6e3a1': '#6FAF5B', '#40a02b': '#3E7A34',
  // bleus : mécanicien, pantalon du bâtisseur, verre de la loupe
  '#89b4fa': '#3366AA', '#1e66f5': '#22477A', '#74c7ec': '#2F7FA8', '#209fb5': '#1F5A78', '#89dceb': '#9FD8F0',
  // penseur
  '#b4befe': '#8E8CD8', '#7287fd': '#5E5BB0',
  // peintre
  '#f38ba8': '#E0443C', '#d20f39': '#A82A24', '#f5c2e7': '#E879A8',
  // coursier
  '#94e2d5': '#3FA89A', '#179299': '#22766C',
  // chapeau safari et bois des outils : déjà dans le ton
  '#e5c890': '#D9B97A', '#c6a76d': '#A88A4E', '#b4846c': '#B4846C', '#8a5a44': '#8A5A44',
}

const recolorer = (c: string): string => {
  const nuit = NUIT[c.toLowerCase()]
  if (!nuit) throw new Error(`couleur de sprite sans équivalent dans NUIT : ${c}`)

  return nuit
}

// Un pixel d'encre autour de chaque pixel dessiné (voisins haut, bas, gauche, droite) ; la grille s'agrandit d'un pixel.
const contour = (g: Grille): Grille => {
  const h = g.length + 2
  const l = g[0]!.length + 2
  const plein = (x: number, y: number) => g[y - 1]?.[x - 1] != null

  return Array.from({ length: h }, (_, y) =>
    Array.from({ length: l }, (_, x) =>
      plein(x, y) ? g[y - 1]![x - 1]! : plein(x - 1, y) || plein(x + 1, y) || plein(x, y - 1) || plein(x, y + 1) ? ENCRE : null,
    ),
  )
}

const ouvrier = (role: string, image = 1): Grille => contour(pixels(role, image).map(l => l.map(c => (c === null ? null : recolorer(hex(c))))))
for (const [situation, role] of Object.entries(ROLES)) writeFileSync(new URL(`ouvriers/${situation}.svg`, PUBLIC), svg(ouvrier(role)))

// L'animation de chantier : chaque rôle de l'équipe en deux images, qui alternent.
mkdirSync(new URL('ouvriers/roles/', PUBLIC), { recursive: true })
for (const role of ROLES_EQUIPE)
  for (const image of [0, 1]) writeFileSync(new URL(`ouvriers/roles/${role}-${image}.svg`, PUBLIC), svg(ouvrier(role, image)))

// ── Les grandes images des notifications : l'ouvrier sur la couleur du badge, debout sur le marquage au sol ──

const IMAGE: [number, number] = [512, 256]
const SOL = 36

// Une bande d'asphalte en bas, coupée de tirets jaunes, comme sous la barre de l'appli.
const marquage: (poser: Poser) => void = poser => {
  const [l, h] = IMAGE
  for (let y = h - SOL; y < h; y++) for (let x = 0; x < l; x++) poser(x, y, ASPHALTE)
  for (let y = h - SOL / 2 - 3; y < h - SOL / 2 + 3; y++) for (let x = 0; x < l; x++) if (x % 48 < 24) poser(x, y, T.Y)
}

mkdirSync(new URL('notifications/', PUBLIC), { recursive: true })
for (const [situation, role] of Object.entries(ROLES))
  for (const badge of BADGES)
    writeFileSync(
      new URL(`notifications/${situation}-${badge}.png`, PUBLIC),
      png(IMAGE, ouvrier(role), 14, `#${badge}`, { decor: marquage, bas: IMAGE[1] - SOL + 4 }),
    )

console.log(`Logo, ${TAILLES.length * 2 + 2} icônes, ${Object.keys(ROLES).length} ouvriers et ${Object.keys(ROLES).length * BADGES.length} images de notification écrits dans public/`)
