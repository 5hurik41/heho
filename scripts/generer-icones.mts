// Génère le logo, les icônes Android et les ouvriers de l'appli dans public/. À relancer si le dessin change :
//   npm run icones
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { grilleMedaille, MEDAILLES } from '../src/medailles.ts'
import { ouvrierEnBoite, ouvrierSerre } from '../src/equipe.ts'
import { BADGES, ROLES as ROLES_EQUIPE, type Role } from '../src/message.ts'

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

// ── Les ouvriers, un par situation, et l'équipe de la scène (src/equipe.ts) ──

const ROLES: Record<string, Role> = { question: 'thinker', permission: 'foreman', done: 'resting', recap: 'painter', budget: 'mechanic', fond: 'courier', bilan: 'builder', arret: 'signaler' }
for (const [situation, role] of Object.entries(ROLES)) writeFileSync(new URL(`ouvriers/${situation}.svg`, PUBLIC), svg(ouvrierSerre(role, 1)))

// L'animation de la scène : chaque rôle en deux images, toutes dans la même boîte, les pieds sur la même ligne.
mkdirSync(new URL('ouvriers/roles/', PUBLIC), { recursive: true })
for (const role of ROLES_EQUIPE)
  for (const image of [0, 1]) writeFileSync(new URL(`ouvriers/roles/${role}-${image}.svg`, PUBLIC), svg(ouvrierEnBoite(role, image)))

// ── Les grandes images des notifications : l'ouvrier sur la couleur du badge, debout sur le marquage au sol ──

const IMAGE: [number, number] = [512, 256]
const SOL = 36

// Une bande d'asphalte en bas, coupée de tirets jaunes, comme sous la barre de l'appli.
const marquage: (poser: Poser) => void = poser => {
  const [l, h] = IMAGE
  for (let y = h - SOL; y < h; y++) for (let x = 0; x < l; x++) poser(x, y, ASPHALTE)
  for (let y = h - SOL / 2 - 3; y < h - SOL / 2 + 3; y++) for (let x = 0; x < l; x++) if (x % 48 < 24) poser(x, y, T.Y)
}

// Le plus grand agrandissement entier, 12 au plus, qui loge l'ouvrier (et sa bulle) au-dessus du sol.
const agrandissement = (g: Grille): number => Math.min(12, Math.floor((IMAGE[1] - SOL - 8) / g.length))

mkdirSync(new URL('notifications/', PUBLIC), { recursive: true })
for (const [situation, role] of Object.entries(ROLES)) {
  const g = ouvrierSerre(role, 1)
  for (const badge of BADGES)
    writeFileSync(new URL(`notifications/${situation}-${badge}.png`, PUBLIC), png(IMAGE, g, agrandissement(g), `#${badge}`, { decor: marquage, bas: IMAGE[1] - SOL + 4 }))
}

// ── Les médailles : la grande image de leur notification, la médaille gagnée sur l'asphalte (src/medailles.ts) ──

mkdirSync(new URL('medailles/', PUBLIC), { recursive: true })
for (const m of MEDAILLES)
  writeFileSync(new URL(`medailles/${m.id}.png`, PUBLIC), png(IMAGE, grilleMedaille(m, true), 12, ASPHALTE, { decor: marquage, bas: IMAGE[1] - SOL - 6 }))

console.log(
  `Logo, ${TAILLES.length * 2 + 2} icônes, ${Object.keys(ROLES).length} ouvriers, ${Object.keys(ROLES).length * BADGES.length} images de notification et ${MEDAILLES.length} médailles écrits dans public/`,
)
