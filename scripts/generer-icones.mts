// Génère le logo, les icônes Android et les ouvriers de l'appli dans public/. À relancer si le dessin change :
//   npm run icones -- [chemin de task-steps/hooks/sprites.ts]
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { homedir } from 'node:os'
import { join } from 'node:path'

const SPRITES = process.argv[2] ?? join(homedir(), '.claude', 'mods-perso', 'task-steps', 'hooks', 'sprites.ts')
const PUBLIC = new URL('../public/', import.meta.url)
mkdirSync(new URL('icones/', PUBLIC), { recursive: true })
mkdirSync(new URL('ouvriers/', PUBLIC), { recursive: true })

type Grille = (string | null)[][]

// ── Le logo : casque à lampe frontale et bulle « Hé ! », 28 × 22 pixels (BRIEF.md, direction B) ──

const ENCRE = '#0E0F11'
const T = { k: ENCRE, Y: '#F5C542', h: '#B8862A', W: '#FFF0BF', L: '#FFFFFF', bulle: '#EDEAE0' }
const ASPHALTE = '#1B1C1E'

const CASQUE = [
  '......kkkk......',
  '....kkYYYYkk....',
  '...kYYYhhYYYk...',
  '..kYWYYLLYYYYk..',
  '..kYWYYLLYYYYk..',
  '..kYYYYhhYYYYk..',
  '..kYYYYhhYYYYk..',
  'kkkkkkkkkkkkkkkk',
  'khhhhhhhhhhhhhhk',
  'kkkkkkkkkkkkkkkk',
]

const GLYPHES: [number, string[]][] = [
  [14, ['', '', 'X.X', 'X.X', 'XXX', 'X.X', 'X.X']],
  [18, ['..X', '', '.X.', 'X.X', 'XXX', 'X..', '.XX']],
  [23, ['', '', 'X', 'X', 'X', '.', 'X']],
]

const logo = (): Grille => {
  const g: Grille = Array.from({ length: 22 }, () => Array<string | null>(28).fill(null))
  for (let y = 0; y <= 9; y++)
    for (let x = 11; x <= 27; x++) {
      if ((y === 0 || y === 9) && (x === 11 || x === 27)) continue
      g[y]![x] = y === 0 || y === 9 || x === 11 || x === 27 ? T.k : T.bulle
    }
  for (const [x, y] of [[13, 9], [13, 10], [12, 10], [12, 11], [14, 9]] as const) g[y]![x] = T.k
  g[9]![13] = T.bulle
  for (const [x0, lignes] of GLYPHES)
    lignes.forEach((l, dy) => l.split('').forEach((c, dx) => { if (c === 'X') g[1 + dy]![x0 + dx] = T.k }))
  CASQUE.forEach((l, dy) =>
    l.split('').forEach((c, dx) => { if (c !== '.') g[12 + dy]![dx] = T[c as 'k' | 'Y' | 'h' | 'W' | 'L'] }),
  )

  return g
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

// Une image carrée de `taille` px : un fond (ou rien), la grille agrandie `echelle` fois, centrée.
const png = (taille: number, g: Grille, echelle: number, fond: string | null, teinte?: string): Buffer => {
  const rgba = Buffer.alloc(taille * taille * 4)
  const poser = (x: number, y: number, c: string) => {
    const i = (y * taille + x) * 4
    rgba.writeUInt32BE(((parseInt(c.slice(1), 16) << 8) | 0xff) >>> 0, i)
  }
  if (fond) for (let y = 0; y < taille; y++) for (let x = 0; x < taille; x++) poser(x, y, fond)
  const ox = Math.floor((taille - g[0]!.length * echelle) / 2)
  const oy = Math.floor((taille - g.length * echelle) / 2)
  g.forEach((l, gy) =>
    l.forEach((c, gx) => {
      if (!c) return
      for (let dy = 0; dy < echelle; dy++) for (let dx = 0; dx < echelle; dx++) poser(ox + gx * echelle + dx, oy + gy * echelle + dy, teinte ?? c)
    }),
  )
  const brut = Buffer.alloc((taille * 4 + 1) * taille)
  for (let y = 0; y < taille; y++) rgba.copy(brut, y * (taille * 4 + 1) + 1, y * taille * 4, (y + 1) * taille * 4)
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(taille, 0)
  ihdr.writeUInt32BE(taille, 4)
  ihdr.set([8, 6, 0, 0, 0], 8)

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    bloc('IHDR', ihdr),
    bloc('IDAT', deflateSync(brut)),
    bloc('IEND', Buffer.alloc(0)),
  ])
}

const L = logo()
// La petite icône de la barre d'état : Android n'en garde que la silhouette, le casque seul suffit.
const CASQUE_SEUL = L.slice(12)

writeFileSync(new URL('logo.svg', PUBLIC), svg(L))
writeFileSync(new URL('icones/icone-192.png', PUBLIC), png(192, L, 5, ASPHALTE))
writeFileSync(new URL('icones/icone-512.png', PUBLIC), png(512, L, 13, ASPHALTE))
// Maskable : le dessin reste dans le cercle sûr de 80 %.
writeFileSync(new URL('icones/icone-maskable-512.png', PUBLIC), png(512, L, 10, ASPHALTE))
writeFileSync(new URL('icones/favicon-32.png', PUBLIC), png(32, L, 1, null))
writeFileSync(new URL('icones/badge-96.png', PUBLIC), png(96, CASQUE_SEUL, 5, null, '#FFFFFF'))

// ── Les ouvriers, un par situation, tirés des sprites de task-steps ──

const { pixels, hex } = (await import(pathToFileURL(SPRITES).href)) as {
  pixels: (role: string, frame: number) => (number | null)[][]
  hex: (rgb: number) => string
}
const ROLES = { question: 'thinker', permission: 'foreman', done: 'resting', recap: 'painter', budget: 'mechanic' }
for (const [situation, role] of Object.entries(ROLES))
  writeFileSync(new URL(`ouvriers/${situation}.svg`, PUBLIC), svg(pixels(role, 1).map(l => l.map(c => (c === null ? null : hex(c))))))

console.log('Logo, 5 icônes et 5 ouvriers écrits dans public/')
