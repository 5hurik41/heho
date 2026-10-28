// Le dessin du quartier (BRIEF.md, « Refonte graphique », lot B de docs/refonte/planche.html) : une toile en pixels,
// la palette qui suit le soleil, et les bâtiments, chantiers, grue, lampadaires et petit décor. Un pixel de dessin
// vaut un pixel CSS : ouvriers, bâtiments et décor partagent la même trame. Tout porte un contour d'encre.

// ── Hasard stable : un même nom donne toujours le même tirage ──
export const hasard = (graine: string): (() => number) => {
  let h = 2166136261
  for (const c of graine) h = Math.imul(h ^ c.charCodeAt(0), 16777619)

  return () => {
    h = (h + 0x6d2b79f5) | 0
    let t = h
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)

    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
export const choisir = <T>(r: () => number, liste: readonly T[]): T => liste[Math.floor(r() * liste.length)]!
export const entre = (r: () => number, a: number, b: number): number => a + Math.floor(r() * (b - a + 1))

// ── Couleurs ──
const CACHE = new Map<string, number[]>()
const rgba = (c: string): number[] => {
  let v = CACHE.get(c)
  if (!v) {
    const h = c.slice(1)
    v = [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), h.length > 6 ? parseInt(h.slice(6, 8), 16) : 255]
    CACHE.set(c, v)
  }

  return v
}
const deux = (v: number): string => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')
export const melanger = (a: string, b: string, t: number): string => {
  const A = rgba(a)
  const B = rgba(b)

  return `#${deux(A[0]! + (B[0]! - A[0]!) * t)}${deux(A[1]! + (B[1]! - A[1]!) * t)}${deux(A[2]! + (B[2]! - A[2]!) * t)}${A[3]! < 255 ? deux(A[3]!) : ''}`
}

// La palette de jour, dessinée à la main ; la nuit s'en déduit par un voile bleu nuit, sauf ce qui éclaire.
const JOUR = {
  lointain: '#A9BED0', lointain2: '#93AAC0', lointainFenetre: '#A9BED0',
  vitre: '#7FA3C0', vitre2: '#5D7F9C', reflet: '#C9DDEB',
  beton: '#A3A5A8', beton2: '#86888C', beton3: '#C2C3C4', joint: '#6E7074',
  enduit: '#D9C7A3', enduit2: '#BDA985', enduitB: '#C9A9A0', enduitB2: '#A98A80',
  pierre: '#E3D6B6', pierre2: '#C6B690', pierre3: '#F0E7D0',
  brique: '#A4553A', brique2: '#86432D', briqueJoint: '#B9806A',
  zinc: '#71818E', zinc2: '#56646F',
  tuile: '#B5533A', tuile2: '#8E3F2C',
  verre: '#4B7BA4', verre2: '#3A6186', meneau: '#C7D2DA', bureau: '#DDEBF5', bureau2: '#A9C3D6',
  bois: '#9A6A4E', bois2: '#6B4433',
  acier: '#5E606A', acier2: '#8C8F96', fut: '#3F4A44',
  jaune: '#F5C542', jaune2: '#B8901F', orange: '#FF7A2F', rouge: '#E0443C', blanc: '#F4F1E8', blanc2: '#C9C6BC',
  vegetal: '#5A9A4C', vegetal2: '#3F7537', vegetal3: '#7DB862', tronc: '#6B4433', sable: '#D8C49A', sable2: '#B8A274',
  trottoir: '#9A968E', trottoir2: '#86827A',
  lampe: '#E8E4D8', feu: '#C0392B', vitrine: '#C9DDEB', cabine: '#7FA3C0',
}
type Cle = keyof typeof JOUR
// Ce qui change de nature la nuit plutôt que de s'assombrir : vitres noires, lampes et feux allumés.
const NUIT: Partial<Record<Cle, string>> = {
  lointain: '#1C2030', lointain2: '#171A27', lointainFenetre: '#6B5A2E', vitre: '#17181C', vitre2: '#121316', reflet: '#26292F',
  lampe: '#FFE9A8', feu: '#FF3B30', vitrine: '#FFD27A', cabine: '#FFD98A', fut: '#2C2F36',
}
const SANS_VOILE = new Set<Cle>(['lampe', 'feu', 'vitrine', 'cabine'])
const ALLUMEES = ['#F5C542', '#FFD98A', '#FFB347', '#F5C542', '#FFE7B0', '#9FD8F0']
export const ENCRE = '#0E0F11'

export type Palette = Record<Cle, string> & { nuit: number; lumieres: number; allumees: string[] }

// `nuit` de 0 (plein jour) à 1 (nuit noire) ; `lumieres` : combien de fenêtres sur dix sont allumées (src/soleil.ts).
export const palette = (nuit: number, lumieres: number): Palette => {
  const P = { nuit, lumieres, allumees: ALLUMEES } as Palette
  for (const k of Object.keys(JOUR) as Cle[]) {
    const n = NUIT[k]
    P[k] = n ? melanger(JOUR[k], n, nuit) : SANS_VOILE.has(k) ? JOUR[k] : melanger(JOUR[k], '#0D1020', 0.6 * nuit)
  }

  return P
}

// ── La toile ──
export class Toile {
  readonly d: Uint8ClampedArray
  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    this.d = new Uint8ClampedArray(w * h * 4)
  }
  px(x: number, y: number, c: string | null | undefined): void {
    if (!c) return
    x = Math.round(x)
    y = Math.round(y)
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return
    const [r, g, b, a] = rgba(c) as [number, number, number, number]
    const i = (y * this.w + x) * 4
    const d = this.d
    if (a === 255 || d[i + 3] === 0) {
      d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = a
      return
    }
    const t = a / 255
    d[i] = d[i]! * (1 - t) + r * t
    d[i + 1] = d[i + 1]! * (1 - t) + g * t
    d[i + 2] = d[i + 2]! * (1 - t) + b * t
    d[i + 3] = Math.max(d[i + 3]!, a)
  }
  rect(x: number, y: number, w: number, h: number, c: string): void {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.px(x + i, y + j, c)
  }
  plein(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.w && y < this.h && this.d[(y * this.w + x) * 4 + 3]! > 0
  }
  ligne(x0: number, y0: number, x1: number, y1: number, c: string): void {
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0)
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1
    let e = dx + dy
    for (let garde = 0; garde < 2000; garde++) {
      this.px(x0, y0, c)
      if (x0 === x1 && y0 === y1) break
      const e2 = 2 * e
      if (e2 >= dy) { e += dy; x0 += sx }
      if (e2 <= dx) { e += dx; y0 += sy }
    }
  }
  sprite(lignes: string[], pal: Record<string, string>, x: number, y: number): void {
    lignes.forEach((l, j) => [...l].forEach((ch, i) => ch !== '.' && this.px(x + i, y + j, pal[ch])))
  }
  coller(src: Toile, x: number, y: number, miroir = false): void {
    const s = src.d, d = this.d
    for (let j = 0; j < src.h; j++) {
      const yy = y + j
      if (yy < 0 || yy >= this.h) continue
      for (let i = 0; i < src.w; i++) {
        const k = (j * src.w + i) * 4
        const a = s[k + 3]!
        if (!a) continue
        const xx = miroir ? x + src.w - 1 - i : x + i
        if (xx < 0 || xx >= this.w) continue
        const o = (yy * this.w + xx) * 4
        if (a === 255 || !d[o + 3]) { d[o] = s[k]!; d[o + 1] = s[k + 1]!; d[o + 2] = s[k + 2]!; d[o + 3] = a; continue }
        const t = a / 255
        for (let c = 0; c < 3; c++) d[o + c] = d[o + c]! * (1 - t) + s[k + c]! * t
        d[o + 3] = Math.max(d[o + 3]!, a)
      }
    }
  }
  // Un pixel d'encre autour de tout ce qui est opaque ; la toile grandit d'un pixel de chaque côté.
  contour(): Toile {
    const t = new Toile(this.w + 2, this.h + 2)
    for (let y = 0; y < t.h; y++)
      for (let x = 0; x < t.w; x++) {
        const opaque = (a: number, b: number) => this.plein(a, b) && this.d[(b * this.w + a) * 4 + 3]! === 255
        if (!this.plein(x - 1, y - 1) && (opaque(x - 2, y - 1) || opaque(x, y - 1) || opaque(x - 1, y - 2) || opaque(x - 1, y))) t.px(x, y, ENCRE)
      }
    t.coller(this, 1, 1)

    return t
  }
  // Une image PNG, pour une balise <img> : elle se clone (l'envol) et se met à l'échelle sans flou.
  url(): string {
    const c = document.createElement('canvas')
    c.width = this.w
    c.height = this.h
    c.getContext('2d')!.putImageData(new ImageData(this.d as Uint8ClampedArray<ArrayBuffer>, this.w, this.h), 0, 0)

    return c.toDataURL()
  }
}

// ── Les mesures du lot B ──
export const ETAGE = 15
export const RDC = 19
const PORTE = 17
const WH = Math.round(ETAGE * 0.5)
const WW = Math.round(ETAGE * 0.28)

// ── Les bâtiments ──────────────────────────────────────────────────────────
// Leur type suit leur nombre d'étages (BRIEF.md) ; le hasard de leur nom choisit parmi les types possibles.
export const TYPES = ['pavillon', 'commerce', 'atelier', 'brique', 'pierre', 'barre', 'bureaux'] as const
export type Type = (typeof TYPES)[number]
const POSSIBLES = (n: number): Type[] => (n <= 2 ? ['pavillon', 'commerce', 'atelier'] : n <= 5 ? ['commerce', 'brique', 'pierre'] : n <= 8 ? ['pierre', 'brique', 'barre'] : ['barre', 'bureaux'])
const LARGEURS: Record<Type, [number, number]> = { pavillon: [40, 46], commerce: [40, 48], atelier: [54, 60], brique: [46, 52], pierre: [56, 64], barre: [58, 64], bureaux: [46, 52] }

// `adn`, `jours` : la façade, les accessoires et l'âge du bâtiment (avecAdn, plus bas).
export type Plan = { id: string; type: Type; etages: number; largeur: number; badge: string; adn?: Adn; jours?: number }
export const planBatiment = (id: string, etages: number, badge: string): Plan => {
  const r = hasard(`plan-${id}`)
  const type = choisir(r, POSSIBLES(etages))
  const [a, b] = LARGEURS[type]

  return { id, type, etages, largeur: entre(r, a, b), badge }
}

// ── L'ADN d'un bâtiment (BRIEF.md, « Vie du quartier ») ──
// Tiré de son nom, à part du tirage des fenêtres : un bâtiment garde sa façade, ses géraniums et son chat.
export type Saison = 'printemps' | 'ete' | 'automne' | 'hiver'
export type Fete = 'halloween' | 'noel' | 'feux' | null
// Ce qui suit le calendrier et l'heure : la saison, la fête, l'heure (rideaux de fer, horloges), le dimanche.
export type Moment = { saison: Saison; fete: Fete; heure: number; dimanche: boolean }

export const BOUTIQUES = ['boulangerie', 'cafe', 'fleuriste', 'librairie', 'pharmacie', 'epicerie'] as const
export type Boutique = (typeof BOUTIQUES)[number]
export const ACCESSOIRES = ['jardinieres', 'linge', 'clim', 'parabole', 'stores', 'solaire', 'potager', 'antenne', 'drapeau', 'lierre', 'horloge', 'velo', 'haie', 'cheminee', 'graphique', 'eolienne'] as const
export type Accessoire = (typeof ACCESSOIRES)[number]

type Teinte = [nom: string, c: string, ombre: string]
const FACADES: Record<Type, Teinte[]> = {
  pavillon: [['ocre', '#D9C7A3', '#BDA985'], ['rose', '#D8AFA4', '#B88F84'], ["vert d'eau", '#AFCBB8', '#8FAE9A'], ['lavande', '#BDB7D6', '#9C96B6'], ['jaune paille', '#E4D08E', '#C6B270'], ['blanc cassé', '#E6E0D2', '#C8C2B4']],
  commerce: [['ocre', '#D9C7A3', '#BDA985'], ['rose', '#D8AFA4', '#B88F84'], ["vert d'eau", '#AFCBB8', '#8FAE9A'], ['pierre', '#E3D6B6', '#C6B690'], ['blanc cassé', '#E6E0D2', '#C8C2B4']],
  atelier: [['brique rouge', '#A4553A', '#86432D'], ['brique ocre', '#B98A55', '#96693C'], ['brique grise', '#8E8984', '#716C68'], ['brique brune', '#7E4A36', '#62382A']],
  brique: [['brique rouge', '#A4553A', '#86432D'], ['brique jaune', '#C2A26E', '#A3854F'], ['brique rose', '#B66E5A', '#97564A'], ['brique brune', '#7E4A36', '#62382A']],
  pierre: [['pierre blonde', '#E3D6B6', '#C6B690'], ['pierre grise', '#D2CEC4', '#B3AEA2'], ['pierre rosée', '#E5CDB8', '#C7AE98']],
  barre: [['béton brut', '#A3A5A8', '#6E7074'], ['béton crème', '#D8D0BC', '#ABA38E'], ['béton bleuté', '#A3B4C0', '#7A8D9A'], ['béton sable', '#C9B49A', '#A08B72']],
  bureaux: [['verre bleu', '#4B7BA4', '#3A6186'], ['verre vert', '#4F8F86', '#3C6F68'], ['verre bronze', '#7A6A58', '#5E5144'], ['verre ardoise', '#5F6E86', '#48546A']],
}
const TOITS: Partial<Record<Type, Teinte[]>> = {
  pavillon: [['tuiles rouges', '#B5533A', '#8E3F2C'], ['ardoise', '#59616E', '#454C57'], ['tuiles brunes', '#8A5A3C', '#6B4430'], ['tuiles ocre', '#B87A44', '#956032']],
  pierre: [['zinc', '#71818E', '#56646F'], ['ardoise', '#4F5866', '#3E4550']],
}
const VOLETS = ['#4F7A5A', '#4E6F96', '#8E5A3C', '#B8452F', '#C7A23A', '#6B6F78', '#7A9CB0']
const COULEURS = ['#C0392B', '#2E6E5A', '#2F4E7A', '#C79A2E', '#7A3E6E', '#E07B39']
const FLEURS = ['#D9443A', '#E58FB0', '#F2C94C', '#F4F1E8', '#B07AD9']
const ROBES: [string, string][] = [['roux', '#D9822B'], ['noir', '#2A2C33'], ['gris', '#8C8F96'], ['crème', '#EDE3D0']]
const SUPERGRAPHIQUES = [['#E07B39', '#E0B33A', '#C0392B'], ['#4E8F8A', '#E0B33A', '#F4F1E8'], ['#2F4E7A', '#4E9BD8', '#F4F1E8']]
const COMPATIBLES: Record<Type, Accessoire[]> = {
  pavillon: ['jardinieres', 'stores', 'antenne', 'lierre', 'velo', 'haie'],
  commerce: ['jardinieres', 'stores', 'horloge', 'velo', 'lierre', 'solaire'],
  atelier: ['lierre', 'cheminee', 'velo', 'drapeau'],
  brique: ['jardinieres', 'linge', 'clim', 'parabole', 'lierre', 'velo', 'potager', 'antenne'],
  pierre: ['jardinieres', 'stores', 'horloge', 'lierre', 'antenne', 'drapeau'],
  barre: ['linge', 'clim', 'parabole', 'solaire', 'graphique', 'potager', 'velo'],
  bureaux: ['eolienne', 'drapeau', 'potager', 'solaire', 'velo'],
}

export type Adn = {
  facade: Teinte
  toit: Teinte | null
  volets: string
  couleur: string
  fleurs: string
  accessoires: Accessoire[]
  boutique: Boutique | null
  chat: [string, string] | null
}
export const tirerAdn = (id: string, type: Type): Adn => {
  const r = hasard(`adn-${id}`)
  const facade = choisir(r, FACADES[type])
  const toits = TOITS[type]
  const toit = toits ? choisir(r, toits) : null
  const volets = choisir(r, VOLETS), couleur = choisir(r, COULEURS), fleurs = choisir(r, FLEURS)
  const possibles = [...COMPATIBLES[type]]
  const accessoires: Accessoire[] = []
  // De 2 à 4 accessoires, moins pour les types qui en ont peu : un atelier n'a pas toujours sa cheminée.
  for (let n = entre(r, possibles.length >= 6 ? 2 : 1, Math.min(4, possibles.length - 1)); n > 0 && possibles.length; n--) accessoires.push(...possibles.splice(Math.floor(r() * possibles.length), 1))
  // Un seul toit-terrasse : des panneaux ou un potager.
  if (accessoires.includes('solaire') && accessoires.includes('potager')) accessoires.splice(accessoires.indexOf('potager'), 1)
  const boutique = type === 'commerce' ? choisir(r, BOUTIQUES) : null
  const chat = r() < 0.35 ? choisir(r, ROBES) : null

  return { facade, toit, volets, couleur, fleurs, accessoires, boutique, chat }
}
// Le plan d'un bâtiment avec son ADN ; `jours` : son âge, qui fait pousser le lierre et vieillir la façade.
export const avecAdn = (plan: Plan, jours: number): Plan => ({ ...plan, adn: tirerAdn(plan.id, plan.type), jours })

// Les heures d'ouverture des boutiques : hors de ces heures, le rideau de fer est baissé.
const HORAIRES: Record<Boutique, { semaine: [number, number]; dimanche: [number, number] | null }> = {
  boulangerie: { semaine: [7, 19.5], dimanche: [7, 13] },
  cafe: { semaine: [7, 23], dimanche: [9, 20] },
  fleuriste: { semaine: [9, 19.5], dimanche: [9, 13] },
  librairie: { semaine: [9.5, 19.5], dimanche: null },
  pharmacie: { semaine: [8.5, 20], dimanche: null },
  epicerie: { semaine: [8, 21], dimanche: [9, 13] },
}
export const ouverte = (b: Boutique, m: Moment): boolean => {
  const h = m.dimanche ? HORAIRES[b].dimanche : HORAIRES[b].semaine

  return !!h && m.heure >= h[0] && m.heure < h[1]
}

// L'enseigne de chaque boutique, 5 × 5 sur son fond.
const ENSEIGNES: Record<Boutique, { fond: string; motif: string[]; pal: Record<string, string> }> = {
  boulangerie: { fond: '#C79A2E', motif: ['....b', '...bB', '..bB.', '.bB..', 'bB...'], pal: { b: '#8A5A2B', B: '#E8C27A' } },
  cafe: { fond: '#7A2E2E', motif: ['.w.w.', '.....', 'wwww.', 'wwwwW', '.ww..'], pal: { w: '#F4F1E8', W: '#C9C6BC' } },
  fleuriste: { fond: '#2E6E5A', motif: ['.p.p.', 'ppypp', '.ppp.', '..g..', '.ggg.'], pal: { p: '#E58FB0', y: '#F2C94C', g: '#7DB862' } },
  librairie: { fond: '#2F4E7A', motif: ['.....', 'ww.ww', 'wwkww', 'ww.ww', '.....'], pal: { w: '#F4F1E8', k: '#C9C6BC' } },
  pharmacie: { fond: '#1E3A2A', motif: ['..G..', '..G..', 'GGGGG', '..G..', '..G..'], pal: { G: '#3EE07A' } },
  epicerie: { fond: '#4F7A3A', motif: ['...g.', '.rgr.', 'rrrrr', 'rrrrr', '.rrr.'], pal: { r: '#D9443A', g: '#7DB862' } },
}

// La fenêtre se tire au sort de 0 à 9 ; elle s'allume quand le soleil allume au moins autant de fenêtres sur dix.
const fenetre = (t: Toile, x: number, y: number, ww: number, wh: number, P: Palette, r: () => number, { volets = null as string | null, appui = true, croisee = true } = {}): boolean => {
  const allumee = Math.floor(r() * 10) < P.lumieres
  const teinte = choisir(r, P.allumees)
  const rideau = r() < 0.3
  if (allumee) {
    t.rect(x, y, ww, wh, teinte)
    if (rideau) t.rect(x, y, Math.ceil(ww / 2), wh, melanger(teinte, '#000000', 0.25))
  } else {
    t.rect(x, y, ww, wh, P.vitre)
    if (P.nuit < 0.5) { t.px(x + ww - 2, y + 1, P.reflet); t.px(x + ww - 3, y + 2, P.reflet) }
  }
  if (croisee && ww >= 4 && wh >= 6) t.rect(x, y + Math.floor(wh / 2), ww, 1, allumee ? melanger(teinte, '#000000', 0.35) : P.vitre2)
  if (appui) t.rect(x - 1, y + wh, ww + 2, 1, P.blanc2)
  if (volets) { t.rect(x - 2, y, 2, wh, volets); t.rect(x + ww, y, 2, wh, volets) }

  return allumee
}

const colonnes = (w: number, ww: number, ecart: number, marge = 3): number[] => {
  const n = Math.max(1, Math.floor((w - 2 * marge + ecart) / (ww + ecart)))
  const x0 = Math.floor((w - (n * ww + (n - 1) * ecart)) / 2)

  return Array.from({ length: n }, (_, i) => x0 + i * (ww + ecart))
}

// La neige sur tout ce qui a le ciel au-dessus : deux pixels sous le contour du haut, un sur les pentes.
export const enneiger = (t: Toile, P: Palette): Toile => {
  const neige = melanger('#F4F6F8', '#0D1020', 0.5 * P.nuit)
  const poser: [number, number][] = []
  for (let x = 0; x < t.w; x++)
    for (let y = 1; y < t.h - 2; y++)
      if (t.plein(x, y) && !t.plein(x, y - 1)) {
        poser.push([x, y + 1])
        if (!t.plein(x - 1, y - 1) && !t.plein(x + 1, y - 1)) poser.push([x, y + 2])
      }
  for (const [x, y] of poser) if (t.plein(x, y)) t.px(x, y, neige)

  return t
}

// Une fenêtre ou une porte du dessin, à sa place dans la toile finie : la rue y anime la vie du soir.
export type Vue = { x: number; y: number; w: number; h: number; allumee: boolean; rdc: boolean }
// `cheminees` : le haut de chaque conduit, d'où la rue fait monter la fumée.
export type Dessin = { toile: Toile; vues: Vue[]; portes: { x: number; w: number; h: number }[]; cheminees: [number, number][] }

export const batiment = (plan: Plan, P: Palette, moment?: Moment): Toile => dessinerBatiment(plan, P, moment).toile

export const dessinerBatiment = (plan: Plan, P: Palette, moment?: Moment): Dessin => {
  const n = Math.max(1, plan.etages)
  const w = plan.largeur
  const r = hasard(plan.id)
  const corps = RDC + (n - 1) * ETAGE
  const t = new Toile(w + 4, corps + 2 * ETAGE + 14)
  const bas = t.h
  const x0 = 2
  const haut = bas - corps
  const top = (k: number) => bas - RDC - k * ETAGE
  const fy = (k: number) => top(k) + Math.max(1, Math.floor((ETAGE - WH) / 2))
  const badge = plan.badge
  const adn = plan.adn
  // L'ADN a son propre tirage pour placer ses accessoires : celui des fenêtres ne bouge pas.
  const ra = hasard(`adn-place-${plan.id}`)
  const v = (c: string) => melanger(c, '#0D1020', 0.6 * P.nuit)
  const F = adn ? [v(adn.facade[1]), v(adn.facade[2])] as const : null
  const vues: Vue[] = []
  const portes: Dessin['portes'] = []
  const cheminees: [number, number][] = []
  const fen = (x: number, y: number, ww: number, wh: number, opts: Parameters<typeof fenetre>[7] = {}) => {
    vues.push({ x, y, w: ww, h: wh, allumee: fenetre(t, x, y, ww, wh, P, r, opts), rdc: y >= bas - RDC })
  }
  const porte = (x: number, l: number, h: number, c: string) => {
    t.rect(x, bas - h, l, h, c)
    t.rect(x, bas - h, l, 1, melanger(c, '#000000', 0.3))
    t.px(x + l - 2, bas - Math.ceil(h / 2), P.jaune)
    portes.push({ x, w: l, h })
  }
  // Où poser un toit-terrasse (panneaux, potager), une antenne ou un drapeau, selon le type.
  const lieux: { terrasse?: number; antenne?: [number, number]; mat?: [number, number] } = {}

  switch (plan.type) {
    case 'pavillon': {
      const murTire = r() < 0.5 ? P.enduit : P.enduitB
      const mur = F ? F[0] : murTire
      t.rect(x0, haut, w, corps, mur)
      t.rect(x0, haut, 1, corps, F ? F[1] : mur === P.enduit ? P.enduit2 : P.enduitB2)
      const voletsTires = melanger(choisir(r, ['#4F7A5A', '#4E6F96', '#8E5A3C']), '#0D1020', 0.6 * P.nuit)
      const volets = adn ? v(adn.volets) : voletsTires
      const cols = colonnes(w, WW, WW + 4, 4)
      for (let k = 0; k < n; k++)
        cols.forEach((x, i) => {
          if (k === 0 && i === cols.length - 1) porte(x0 + x, WW + 1, PORTE, badge)
          else fen(x0 + x, fy(k), WW, WH, { volets })
        })
      const [tuile, tuile2] = adn?.toit ? [v(adn.toit[1]), v(adn.toit[2])] : [P.tuile, P.tuile2]
      const pente = Math.ceil((w + 4) / 2.6)
      for (let j = 0; j < pente; j++) {
        const l = Math.max(2, Math.round((w + 4) * (1 - j / pente)))
        t.rect(Math.round((w + 4 - l) / 2), haut - 1 - j, l, 1, j % 3 === 2 ? tuile2 : tuile)
      }
      t.rect(x0 + Math.round(w * 0.7), haut - pente + 1, 3, Math.round(pente * 0.7), P.brique2)
      lieux.antenne = [x0 + Math.round(w * 0.7) + 1, haut - pente + 1]
      cheminees.push([x0 + Math.round(w * 0.7) + 1, haut - pente])
      break
    }
    case 'commerce': {
      const murTire = choisir(r, [P.enduit, P.enduitB, P.pierre])
      t.rect(x0, haut, w, corps, F ? F[0] : murTire)
      // La vitrine, allumée le soir, le store rayé au badge et l'enseigne. Avec l'ADN : la boutique, ses
      // heures, et le rideau de fer quand elle est fermée.
      const hv = RDC - 6
      const ouvert = !adn?.boutique || !moment || ouverte(adn.boutique, moment)
      t.rect(x0, bas - RDC, w, RDC, P.bois2)
      t.rect(x0 + 2, bas - hv, w - 4, hv - 1, P.lumieres > 0 && ouvert ? P.vitrine : P.vitre)
      if (P.lumieres === 0) t.ligne(x0 + 4, bas - 3, x0 + 8, bas - hv + 1, P.reflet)
      if (adn?.boutique) {
        const xv = x0 + 2, lv = w - 11, yv = bas - hv
        if (ouvert) vitrine(t, adn.boutique, xv, yv, lv, hv - 1, P, ra)
        else {
          t.rect(xv, yv, w - 4, hv - 1, v('#9A9DA3'))
          for (let y = yv + 1; y < bas - 1; y += 2) t.rect(xv, y, w - 4, 1, v('#7C7F86'))
        }
      }
      porte(x0 + w - 7, 5, hv - 1, melanger(badge, '#000000', 0.2))
      t.rect(x0, bas - RDC, w, 4, melanger(badge, '#000000', 0.45))
      for (let i = 3; i < w - 3; i += 3) t.px(x0 + i, bas - RDC + 1 + (i % 2), P.blanc2)
      for (let i = -1; i < w + 1; i++) {
        const c = Math.floor((i + 1) / 3) % 2 ? P.blanc : badge
        t.rect(x0 + i, bas - RDC + 4, 1, 3, c)
        if (i % 3 === 1) t.px(x0 + i, bas - RDC + 7, c)
      }
      if (adn?.boutique) {
        // L'enseigne, au milieu du bandeau ; la croix de la pharmacie s'allume quand elle est ouverte.
        const e = ENSEIGNES[adn.boutique]
        const xe = x0 + Math.round(w / 2) - 4, ye = bas - RDC - 3
        t.rect(xe, ye, 9, 8, P.acier)
        t.rect(xe + 1, ye + 1, 7, 6, v(e.fond))
        const pal = Object.fromEntries(Object.entries(e.pal).map(([k, c]) => [k, adn.boutique === 'pharmacie' ? (ouvert ? c : v('#2F6A45')) : v(c)]))
        t.sprite(e.motif, pal, xe + 2, ye + 1)
        if (ouvert) devanture(t, adn.boutique, x0, w, bas, P, ra)
      }
      for (let k = 1; k < n; k++) for (const x of colonnes(w, WW, WW + 2)) fen(x0 + x, fy(k), WW, WH)
      t.rect(x0 - 1, haut - 2, w + 2, 2, P.blanc2)
      lieux.terrasse = x0 + 4
      lieux.mat = [x0 + w - 4, haut - 2]
      break
    }
    case 'atelier': {
      const [mur, mur2] = F ?? [P.brique, P.brique2]
      t.rect(x0, haut, w, corps, mur)
      for (let y = haut + 2; y < bas; y += 3) for (let x = x0 + ((y / 3) % 2 ? 0 : 2); x < x0 + w; x += 4) t.px(x, y, mur2)
      // La grande porte à lames, au badge, et les fenêtres hautes.
      const lp = Math.round(w * 0.45)
      t.rect(x0 + 3, bas - PORTE - 2, lp, PORTE + 2, melanger(badge, '#000000', 0.15))
      for (let y = bas - PORTE; y < bas; y += 2) t.rect(x0 + 3, y, lp, 1, melanger(badge, '#000000', 0.4))
      portes.push({ x: x0 + 3, w: lp, h: PORTE + 2 })
      for (let x = x0 + lp + 6; x + WW <= x0 + w - 2; x += WW + 2) fen(x, bas - RDC + 3, WW, Math.round(WH * 0.8), { appui: false })
      for (let k = 1; k < n; k++) for (const x of colonnes(w, WW + 2, 2)) fen(x0 + x, fy(k), WW + 2, WH - 2, { appui: false })
      // Le toit en sheds : des dents de scie vitrées.
      const dent = Math.round(ETAGE * 0.7)
      for (let x = 0; x < w; x += dent)
        for (let j = 0; j < Math.round(dent * 0.6); j++) {
          t.rect(x0 + x, haut - 1 - j, Math.max(0, Math.round(dent * (1 - j / (dent * 0.6)))), 1, P.beton2)
          t.px(x0 + x, haut - 1 - j, P.lumieres > 0 ? P.lointainFenetre : P.verre)
        }
      lieux.mat = [x0 + w - 3, haut - 1]
      break
    }
    case 'brique': {
      const [mur, mur2] = F ?? [P.brique, P.brique2]
      const joint = adn ? v(melanger(adn.facade[1], '#FFFFFF', 0.22)) : P.briqueJoint
      t.rect(x0, haut, w, corps, mur)
      for (let y = haut + 1; y < bas; y += 3) {
        t.rect(x0, y, w, 1, joint)
        for (let x = x0 + (Math.floor(y / 3) % 2 ? 1 : 3); x < x0 + w; x += 4) t.px(x, y + 1, mur2)
      }
      const cols = colonnes(w, WW, WW + 2)
      for (let k = 0; k < n; k++)
        cols.forEach((x, i) => {
          if (k === 0 && i === Math.floor(cols.length / 2)) return porte(x0 + x - 1, WW + 2, PORTE, badge)
          t.rect(x0 + x - 1, fy(k) - 1, WW + 2, 1, P.pierre2)
          fen(x0 + x, fy(k), WW, WH)
        })
      // L'escalier de secours sur la colonne de droite, et la citerne d'eau sur le toit.
      if (n >= 3) {
        const xc = x0 + cols[cols.length - 1]! - 2
        for (let k = 1; k < n; k++) {
          t.rect(xc, fy(k) + WH + 1, WW + 4, 1, P.acier)
          t.px(xc, fy(k) + WH, P.acier)
          t.px(xc + WW + 3, fy(k) + WH, P.acier)
          if (k < n - 1) t.ligne(xc + 1, fy(k) + WH, xc + WW + 2, fy(k + 1) + WH + 2, P.acier)
        }
      }
      t.rect(x0 - 1, haut - 2, w + 2, 2, P.pierre2)
      const cx = x0 + Math.round(w * 0.25) + entre(r, 0, 4)
      t.rect(cx, haut - 13, 10, 8, P.bois)
      t.rect(cx, haut - 13, 10, 1, P.bois2)
      t.rect(cx, haut - 9, 10, 1, P.bois2)
      t.rect(cx - 1, haut - 14, 12, 1, P.bois2)
      t.rect(cx + 2, haut - 15, 6, 1, P.bois2)
      t.rect(cx + 1, haut - 5, 1, 3, P.acier)
      t.rect(cx + 8, haut - 5, 1, 3, P.acier)
      lieux.terrasse = x0 + Math.round(w * 0.25) + 16
      lieux.antenne = [x0 + w - 4, haut - 2]
      break
    }
    case 'pierre': {
      const [mur, mur2] = F ?? [P.pierre, P.pierre2]
      const mur3 = adn ? v(melanger(adn.facade[1], '#FFFFFF', 0.35)) : P.pierre3
      t.rect(x0, haut, w, corps, mur)
      for (let k = 1; k < n; k++) t.rect(x0, top(k) + ETAGE - 1, w, 1, mur2)
      const cols = colonnes(w, WW, WW + 3)
      // Le rez-de-chaussée en bossages, la porte cochère au badge.
      t.rect(x0, bas - RDC, w, RDC, mur2)
      for (let y = bas - RDC + 3; y < bas; y += 3) t.rect(x0, y, w, 1, melanger(mur2, '#000000', 0.15))
      cols.forEach((x, i) => {
        if (i === Math.floor(cols.length / 2)) {
          t.rect(x0 + x - 1, bas - PORTE - 2, WW + 2, PORTE + 2, melanger(mur2, '#000000', 0.25))
          porte(x0 + x, WW, PORTE, badge)
        } else fen(x0 + x, bas - RDC + 3, WW, RDC - 5, { appui: false })
      })
      for (let k = 1; k < n; k++) {
        cols.forEach(x => fen(x0 + x, top(k) + 1, WW, ETAGE - 4, { appui: false }))
        // Balcons filants au deuxième et au dernier étage, balconnets ailleurs.
        const yb = top(k) + ETAGE - 3
        if (k === 1 || k === n - 1) {
          t.rect(x0, yb + 1, w, 1, mur2)
          for (let x = x0; x < x0 + w; x += 2) t.px(x, yb, ENCRE)
          t.rect(x0, yb - 1, w, 1, ENCRE)
        } else
          cols.forEach(x => {
            t.rect(x0 + x - 1, yb - 1, WW + 2, 1, ENCRE)
            for (let i = 0; i < WW + 2; i += 2) t.px(x0 + x - 1 + i, yb, ENCRE)
          })
      }
      t.rect(x0 - 1, haut - 2, w + 2, 2, mur3)
      // Le toit mansardé en zinc, ses lucarnes et ses souches de cheminée.
      const [zinc, zinc2] = adn?.toit ? [v(adn.toit[1]), v(adn.toit[2])] : [P.zinc, P.zinc2]
      const hm = Math.round(ETAGE * 1.1)
      for (let j = 0; j < hm; j++) t.rect(x0 + Math.round(j * 0.35), haut - 3 - j, w - 2 * Math.round(j * 0.35), 1, j % 4 === 3 ? zinc2 : zinc)
      cols.forEach((x, i) => {
        if (i % 2) return
        t.rect(x0 + x - 1, haut - hm + 1, WW + 2, hm - 3, mur3)
        t.rect(x0 + x - 2, haut - hm, WW + 4, 1, zinc2)
        fen(x0 + x, haut - hm + 3, WW, hm - 6, { appui: false, croisee: false })
      })
      for (const x of [x0 + 3, x0 + w - 8]) {
        t.rect(x, haut - hm - 4, 5, 5, P.brique)
        for (let i = 0; i < 5; i += 2) t.rect(x + i, haut - hm - 6, 1, 2, P.tuile2)
        cheminees.push([x + 2, haut - hm - 7])
      }
      lieux.antenne = [x0 + 5, haut - hm - 6]
      lieux.mat = [x0 + Math.round(w / 2), haut - hm - 2]
      break
    }
    case 'barre': {
      const [mur, joint] = F ?? [P.beton, P.joint]
      t.rect(x0, haut, w, corps, mur)
      if (adn?.accessoires.includes('graphique')) {
        // La peinture murale des années 70 : trois bandes en diagonale, sous les fenêtres.
        const [a, b, c] = choisir(ra, SUPERGRAPHIQUES).map(v) as [string, string, string]
        const o = Math.round(w * 0.2)
        for (let y = haut; y < bas - RDC; y++)
          for (let x = 0; x < w; x++) {
            const d = x + Math.round((bas - y) * 0.6) - o - Math.round(corps * 0.3)
            if (d >= 0 && d < 15) t.px(x0 + x, y, d < 5 ? a : d < 10 ? b : c)
          }
      }
      for (let k = 1; k < n; k++) t.rect(x0, top(k) + ETAGE - 1, w, 1, joint)
      const cols = colonnes(w, WW + 2, 3)
      const loggias = [badge, P.blanc, melanger(badge, P.blanc, 0.5)].map(c => melanger(c, '#0D1020', 0.5 * P.nuit))
      for (let k = 0; k < n; k++)
        cols.forEach((x, i) => {
          if (k === 0) {
            if (i === 1) porte(x0 + x, WW + 2, PORTE, badge)
            else fen(x0 + x, fy(0), WW + 2, WH, { appui: false })
            return
          }
          fen(x0 + x, fy(k), WW + 2, WH, { appui: false })
          // Une loggia sur deux, garde-corps coloré.
          if ((i + k) % 2 === 0) t.rect(x0 + x - 1, fy(k) + WH - 2, WW + 4, 3, loggias[i % 3]!)
        })
      t.rect(x0 - 1, haut - 2, w + 2, 2, P.beton2)
      t.rect(x0 + 4, haut - 7, 12, 5, P.beton2)
      for (const x of [x0 + w - 6, x0 + w - 10]) {
        t.rect(x, haut - 12, 1, 10, P.acier2)
        t.rect(x - 2, haut - 10, 5, 1, P.acier2)
      }
      lieux.terrasse = x0 + 18
      break
    }
    case 'bureaux': {
      const [verre, verre2] = F ?? [P.verre, P.verre2]
      t.rect(x0, haut, w, corps, verre)
      for (let x = x0 + 2; x < x0 + w; x += 4) t.rect(x, haut, 1, corps, verre2)
      for (let k = 0; k < n; k++) {
        const y = top(k)
        const h = (k === 0 ? RDC : ETAGE) - 3
        t.rect(x0, y, w, 1, P.meneau)
        // Des plateaux allumés d'un bloc, d'autres éteints : des bureaux le soir.
        if (Math.floor(r() * 10) < P.lumieres * 0.9) {
          const a = entre(r, 0, Math.floor(w / 2)), b = entre(r, a + 6, w)
          t.rect(x0 + a, y + 2, Math.min(b, w) - a, h, P.bureau)
          for (let x = x0 + 2; x < x0 + w; x += 4) t.rect(x, y + 2, 1, h, P.bureau2)
        } else r()
        if (P.lumieres === 0 && k % 3 === 1) t.ligne(x0 + 2 + (k % 5), y + ETAGE - 2, x0 + 6 + (k % 5), y + 2, P.reflet)
      }
      t.rect(x0, bas - RDC, w, RDC, verre2)
      porte(x0 + Math.round(w / 2) - 3, 6, PORTE, P.lumieres > 0 ? P.vitrine : P.reflet)
      t.rect(x0 + Math.round(w / 2) - 5, bas - PORTE - 2, 10, 2, badge)
      t.rect(x0, haut, 1, corps, P.meneau)
      t.rect(x0 + w - 1, haut, 1, corps, P.meneau)
      // Le couronnement en retrait, l'antenne et son feu rouge.
      t.rect(x0 + 3, haut - 6, w - 6, 6, verre2)
      t.rect(x0 + 3, haut - 6, w - 6, 1, P.meneau)
      const xa = x0 + Math.round(w / 2)
      t.rect(xa, haut - 22, 1, 16, P.acier2)
      t.rect(xa - 1, haut - 14, 3, 1, P.acier2)
      t.px(xa, haut - 23, P.feu)
      lieux.terrasse = xa + 3
      lieux.mat = [x0 + w - 5, haut - 6]
      break
    }
  }
  // Le liseré du badge sur les toits plats, comme avant la refonte.
  if (!['pavillon', 'pierre', 'atelier'].includes(plan.type)) t.rect(x0, haut, w, 1, badge)

  if (adn) orner(t, { plan, adn, P, moment, ra, v, vues, portes, lieux, x0, w, haut, bas, corps })
  if (adn?.accessoires.includes('cheminee')) cheminees.push([x0 + 5, haut - 29])
  const toile = t.contour()
  if (adn && moment?.saison === 'hiver') enneiger(toile, P)

  return { toile, vues: vues.map(q => ({ ...q, x: q.x + 1, y: q.y + 1 })), portes: portes.map(p => ({ ...p, x: p.x + 1 })), cheminees: cheminees.map(([x, y]) => [x + 1, y + 1]) }
}

// ── Les accessoires de l'ADN, puis la saison et la fête ──
type Ornement = {
  plan: Plan; adn: Adn; P: Palette; moment: Moment | undefined; ra: () => number; v: (c: string) => string
  vues: Vue[]; portes: Dessin['portes']; lieux: { terrasse?: number; antenne?: [number, number]; mat?: [number, number] }
  x0: number; w: number; haut: number; bas: number; corps: number
}
const orner = (t: Toile, o: Ornement): void => {
  const { adn, P, moment, ra, v, vues, portes, lieux, x0, w, haut, bas } = o
  const a = (x: Accessoire) => adn.accessoires.includes(x)
  const saison = moment?.saison ?? 'ete'
  const fete = moment?.fete ?? null
  const facade = vues.filter(q => q.y >= haut && !q.rdc)
  const rangees = [...new Set(facade.map(q => q.y))].map(y => facade.filter(q => q.y === y))
  const nuit = P.lumieres > 0

  // Le temps qui passe : des coulures sous les appuis après un mois.
  if ((o.plan.jours ?? 0) >= 30)
    for (const q of facade) if (ra() < 0.5) for (let j = 1; j <= 3; j++) t.px(q.x + Math.floor(q.w / 2), q.y + q.h + j, '#00000018')

  if (a('jardinieres')) {
    const fleur = v(saison === 'automne' ? '#E07B39' : adn.fleurs), feuille = v(saison === 'hiver' ? '#3F5A3A' : '#5A9A4C'), bac = v('#7A4A30')
    for (const q of facade)
      if (ra() < 0.55) {
        t.rect(q.x - 1, q.y + q.h, q.w + 2, 2, bac)
        if (saison !== 'hiver')
          for (let i = 0; i < q.w + 2; i++) {
            t.px(q.x - 1 + i, q.y + q.h - 1, i % 2 ? fleur : feuille)
            if (i % 3 === 1 && saison !== 'automne') t.px(q.x - 1 + i, q.y + q.h - 2, fleur)
          }
      }
  }
  if (a('stores')) {
    const c = v(adn.couleur), b = v('#F4F1E8')
    for (const q of facade)
      if (ra() < (saison === 'ete' ? 0.8 : 0.4))
        for (let i = 0; i < q.w + 2; i++) {
          const ci = i % 2 ? b : c
          t.rect(q.x - 1 + i, q.y - 2, 1, 2, ci)
          if (i % 2 === 0) t.px(q.x - 1 + i, q.y, ci)
        }
  }
  if (a('linge') && rangees.length > 1) {
    const rang = rangees[Math.floor(ra() * (rangees.length - 1))]!
    const xa = rang[0]!.x, xb = rang[rang.length - 1]!.x + rang[0]!.w, y = rang[0]!.y + rang[0]!.h + 2
    t.rect(xa, y, xb - xa, 1, v('#3A3C40'))
    for (let x = xa + 1; x < xb - 2; x += entre(ra, 3, 4)) {
      const c = v(choisir(ra, ['#E0443C', '#F4F1E8', '#4E6F96', '#F5C542', '#5A9A4C', '#E58FB0']))
      if (ra() < 0.6) t.rect(x, y + 1, 3, 2, c)
      else t.rect(x, y + 1, 1, 2, c)
    }
  }
  if (a('clim'))
    for (const q of facade.filter(() => ra() < 0.25).slice(0, 3)) {
      t.rect(q.x, q.y + q.h + 1, 4, 3, v('#C9C6BC'))
      t.rect(q.x + 1, q.y + q.h + 2, 2, 1, v('#86888C'))
    }
  if (a('parabole')) {
    const q = rangees.length ? choisir(ra, rangees).at(-1)! : null
    if (q && q.x + q.w + 4 <= x0 + w) t.sprite(['.ww', 'www', '.ww', '..a'], { w: v('#DADBD5'), a: P.acier }, q.x + q.w + 1, q.y + 1)
  }
  if (lieux.terrasse !== undefined && (a('solaire') || a('potager'))) {
    const yb = haut - 3, xs = lieux.terrasse
    if (a('solaire'))
      for (let i = 0; i < 2; i++) {
        const xp = xs + i * 8
        if (xp + 7 > x0 + w - 2) break
        t.rect(xp + 2, yb - 2, 5, 1, nuit ? '#1E2A44' : '#3E5C8E')
        t.rect(xp + 1, yb - 1, 6, 1, nuit ? '#1A2440' : '#34507E')
        t.rect(xp, yb, 7, 1, nuit ? '#16203A' : '#2C4470')
        t.px(xp + 4, yb - 1, nuit ? '#2A3858' : '#7FA3C0')
      }
    else {
      const l = Math.min(14, x0 + w - 3 - xs)
      t.rect(xs, yb - 1, l, 2, v('#9A6A4E'))
      if (saison !== 'hiver')
        for (let x = xs; x < xs + l; x++) {
          if (ra() < 0.8) t.px(x, yb - 2, v(saison === 'automne' ? '#B8862E' : '#5A9A4C'))
          if (ra() < 0.4) t.px(x, yb - 3, v(ra() < 0.3 ? '#D9443A' : '#7DB862'))
        }
    }
  }
  if (a('antenne') && lieux.antenne) {
    const [x, y] = lieux.antenne
    t.rect(x, y - 10, 1, 10, P.acier2)
    t.rect(x - 3, y - 9, 7, 1, P.acier2)
    t.rect(x - 2, y - 7, 5, 1, P.acier2)
    t.rect(x - 1, y - 5, 3, 1, P.acier2)
  }
  if (a('drapeau') && lieux.mat) {
    const [x, y] = lieux.mat
    t.rect(x, y - 12, 1, 12, P.acier2)
    t.rect(x + 1, y - 12, 6, 4, v(adn.couleur))
    t.rect(x + 1, y - 10, 6, 1, v(melanger(adn.couleur, '#FFFFFF', 0.5)))
  }
  if (a('cheminee')) {
    const x = x0 + 3, h = 28
    t.rect(x, haut - h, 5, h, v(adn.facade[2]))
    for (let y = haut - h + 4; y < haut; y += 6) t.rect(x, y, 5, 1, v('#5B2E20'))
    t.rect(x - 1, haut - h, 7, 2, v('#5B2E20'))
  }
  if (a('eolienne')) {
    const x = x0 + 6, y = haut - 6
    t.rect(x, y - 12, 1, 12, P.blanc2)
    t.rect(x - 1, y - 13, 3, 2, P.blanc)
    t.ligne(x, y - 13, x, y - 19, P.blanc)
    t.ligne(x, y - 12, x - 5, y - 9, P.blanc)
    t.ligne(x, y - 12, x + 5, y - 9, P.blanc)
  }
  if (a('horloge')) {
    const cx = x0 + Math.round(w / 2), cy = o.plan.type === 'pierre' ? haut - 9 : haut - 6
    for (let j = -3; j <= 3; j++)
      for (let i = -3; i <= 3; i++) {
        const d = Math.hypot(i, j)
        if (d <= 3.4) t.px(cx + i, cy + j, d > 2.4 ? P.acier : nuit ? P.lampe : P.blanc)
      }
    const h = moment?.heure ?? 10.17
    const aiguille = (angle: number, l: number) => t.ligne(cx, cy, cx + Math.round(Math.sin(angle) * l), cy - Math.round(Math.cos(angle) * l), ENCRE)
    aiguille(((h % 12) / 12) * 2 * Math.PI, 1)
    aiguille((h % 1) * 2 * Math.PI, 2)
  }
  if (a('lierre')) {
    // Il pousse avec l'âge du bâtiment, rougit à l'automne, n'est plus que branches en hiver.
    const h = Math.min(o.corps - 1, Math.round(4 + (o.plan.jours ?? 0) * 1.4))
    const gauche = !(o.plan.type === 'barre' || o.plan.type === 'atelier')
    const feuilles = saison === 'automne' ? ['#C4502E', '#D9822B', '#A8432A'] : saison === 'hiver' ? ['#6B4433'] : ['#3F7537', '#5A9A4C', '#7DB862']
    for (let y = bas - 1; y > bas - h; y--) {
      const l = 2 + Math.floor(ra() * 3) + (y > bas - 8 ? 2 : 0)
      for (let i = 0; i < l; i++) if (saison !== 'hiver' || ra() < 0.35) t.px(gauche ? x0 + i : x0 + w - 1 - i, y, v(choisir(ra, feuilles)))
    }
  }
  if (adn.chat) {
    const q = facade.length ? choisir(ra, facade) : null
    if (q && q.w >= 4) {
      const c = q.allumee ? '#1B1C22' : v(adn.chat[1])
      t.sprite(['c..c', 'cccc', 'cccc', '.ccc'], { c }, q.x, q.y + q.h - 4)
      if (!q.allumee && nuit) { t.px(q.x + 1, q.y + q.h - 3, '#E8D84A'); t.px(q.x + 2, q.y + q.h - 3, '#E8D84A') }
    }
  }
  const libre = (x: number, l: number) => !portes.some(p => x < p.x + p.w + 1 && x + l > p.x - 1)
  if (a('haie')) {
    const fin = (portes[0]?.x ?? x0 + w) - 2
    for (let x = x0 - 1; x < fin; x++) {
      t.rect(x, bas - 5, 1, 5, v('#3F7537'))
      if (ra() < 0.5) t.px(x, bas - 5, v('#5A9A4C'))
      if (ra() < 0.3) t.px(x, bas - 3, v('#2F5A2A'))
    }
  }
  if (a('velo')) {
    const x = libre(x0 + 2, 13) ? x0 + 2 : x0 + w - 15
    if (libre(x, 13)) velo(t, x, bas, v(adn.couleur), P)
  }

  // Les fêtes.
  if (fete === 'halloween') {
    const p = portes[0]
    if (p && libre(p.x - 7, 6)) citrouille(t, p.x - 7, bas - 4, nuit)
    for (const q of facade) if (ra() < 0.12) citrouille(t, q.x - 1 + Math.floor((q.w - 4) / 2), q.y + q.h - 4, nuit)
    const g = facade.length && ra() < 0.6 ? choisir(ra, facade) : null
    if (g && g.w >= 4) t.sprite(['.WW.', 'WkkW', 'WWWW', 'WWWW', 'W.WW'].slice(0, Math.min(5, g.h)), { W: '#F4F1E8', k: ENCRE }, g.x + Math.floor((g.w - 4) / 2), g.y + g.h - Math.min(5, g.h))
    if (p) t.sprite(['wwww', 'w.w.', 'ww..', 'w...'], { w: '#D8D8D8AA' }, p.x, bas - p.h)
    guirlande(t, x0, w, bas - RDC - 1, ['#FF8A1F', '#9B59D0'], nuit)
  } else if (fete === 'noel') {
    guirlande(t, x0, w, haut, ['#E0443C', '#F5C542', '#5A9A4C', '#4E9BD8'], nuit)
    const p = portes[0]
    if (p && p.w >= 4) t.sprite(['.gg.', 'grrg', 'g..g', '.gg.'], { g: v('#3F7537'), r: '#E0443C' }, p.x + Math.floor((p.w - 4) / 2), bas - p.h + 2)
  } else if (fete === 'feux') {
    // Les fanions bleu, blanc, rouge du 14 juillet sous le premier étage.
    const y = bas - RDC - 1, c = [v('#2F4E9A'), v('#F4F1E8'), v('#D9443A')]
    t.rect(x0, y, w, 1, v('#3A3C40'))
    for (let x = x0 + 1, i = 0; x < x0 + w - 2; x += 4, i++) { t.rect(x, y + 1, 3, 1, c[i % 3]!); t.px(x + 1, y + 2, c[i % 3]!) }
  }
  if (saison === 'hiver') for (const q of facade) t.rect(q.x - 1, q.y + q.h - 1, q.w + 2, 1, melanger('#F4F6F8', '#0D1020', 0.5 * P.nuit))
}

// Une guirlande d'ampoules, allumée le soir, ternes le jour.
const guirlande = (t: Toile, x0: number, w: number, y: number, couleurs: string[], allumee: boolean): void => {
  for (let x = x0 + 1, i = 0; x < x0 + w - 1; x += 2, i++) {
    const c = couleurs[i % couleurs.length]!
    t.px(x, y + (i % 2), allumee ? c : melanger(c, '#7C7F86', 0.6))
  }
}

const citrouille = (t: Toile, x: number, y: number, allumee: boolean): void =>
  t.sprite(['..s.', '.OO.', 'OyOy', 'OOOO'], { s: '#4F7A3A', O: '#E07020', y: allumee ? '#FFE08A' : '#5A2A10' }, x, y)

const velo = (t: Toile, x: number, bas: number, cadre: string, P: Palette): void => {
  const roue = ['.ooo.', 'o...o', 'o...o', 'o...o', '.ooo.']
  t.sprite(roue, { o: '#2A2C33' }, x, bas - 5)
  t.sprite(roue, { o: '#2A2C33' }, x + 8, bas - 5)
  t.ligne(x + 2, bas - 3, x + 5, bas - 6, cadre)
  t.ligne(x + 5, bas - 6, x + 10, bas - 3, cadre)
  t.ligne(x + 2, bas - 3, x + 7, bas - 3, cadre)
  t.ligne(x + 7, bas - 3, x + 9, bas - 7, cadre)
  t.rect(x + 4, bas - 7, 3, 1, ENCRE)
  t.rect(x + 9, bas - 8, 2, 1, P.acier2)
}

// Ce qu'on voit dans la vitrine d'une boutique ouverte.
const vitrine = (t: Toile, b: Boutique, x: number, y: number, l: number, h: number, P: Palette, ra: () => number): void => {
  const v = (c: string) => melanger(c, '#0D1020', 0.3 * P.nuit)
  const fond = y + h
  switch (b) {
    case 'boulangerie':
      for (const yy of [fond - 2, fond - 6]) {
        t.rect(x, yy + 1, l, 1, v('#8A5A2B'))
        for (let i = 1; i + 3 <= l; i += 4) { t.rect(x + i, yy - 1, 3, 2, v('#B9803F')); t.px(x + i + 1, yy - 1, v('#E8C27A')) }
      }
      break
    case 'cafe':
      t.rect(x, fond - 5, l, 5, v('#6B4433'))
      t.rect(x, fond - 5, l, 1, v('#9A6A4E'))
      t.rect(x + 2, fond - 9, 3, 4, v('#5E606A'))
      for (let i = 7; i < l - 1; i += 3) t.px(x + i, fond - 6, v('#F4F1E8'))
      for (let i = 3; i < l; i += 7) { t.rect(x + i, y, 1, 2, v('#3A3C40')); t.px(x + i, y + 2, '#FFE9A8') }
      break
    case 'fleuriste':
      for (let i = 0; i < l; i++) {
        t.px(x + i, fond - 1, v('#3F7537'))
        if (ra() < 0.7) t.px(x + i, fond - 2 - Math.floor(ra() * 4), v(choisir(ra, ['#E58FB0', '#D9443A', '#F2C94C', '#F4F1E8', '#B07AD9'])))
        if (ra() < 0.5) t.px(x + i, fond - 2, v('#5A9A4C'))
      }
      break
    case 'librairie':
      for (const yy of [fond - 1, fond - 6]) {
        t.rect(x, yy, l, 1, v('#6B4433'))
        for (let i = 0; i < l; i++) if (ra() < 0.85) t.rect(x + i, yy - 4 + (ra() < 0.3 ? 1 : 0), 1, 4 - (ra() < 0.3 ? 1 : 0), v(choisir(ra, ['#C0392B', '#2F4E7A', '#C79A2E', '#2E6E5A', '#F4F1E8', '#7A3E6E'])))
      }
      break
    case 'pharmacie':
      for (const yy of [fond - 1, fond - 5, fond - 9]) if (yy > y) {
        t.rect(x, yy, l, 1, v('#F4F1E8'))
        for (let i = 1; i < l - 1; i += 3) t.rect(x + i, yy - 2, 2, 2, v(choisir(ra, ['#3EA86A', '#F4F1E8', '#4E9BD8'])))
      }
      break
    case 'epicerie':
      for (let i = 0; i + 4 <= l; i += 5) {
        const c = v(choisir(ra, ['#D9443A', '#E07B39', '#F2C94C', '#7DB862']))
        t.rect(x + i, fond - 3, 4, 3, v('#9A6A4E'))
        t.rect(x + i, fond - 4, 4, 1, c)
        t.rect(x + i + 1, fond - 5, 2, 1, c)
      }
      break
  }
}

// Ce que la boutique sort sur le trottoir quand elle est ouverte.
const devanture = (t: Toile, b: Boutique, x0: number, w: number, bas: number, P: Palette, ra: () => number): void => {
  const v = (c: string) => melanger(c, '#0D1020', 0.6 * P.nuit)
  if (b === 'fleuriste')
    for (let i = 0; i < 3; i++) {
      const x = x0 + 2 + i * 4
      t.rect(x, bas - 3, 3, 3, v('#86888C'))
      t.rect(x, bas - 5, 3, 2, v(choisir(ra, ['#E58FB0', '#D9443A', '#F2C94C'])))
      t.px(x + 1, bas - 6, v('#5A9A4C'))
    }
  else if (b === 'epicerie')
    for (let i = 0; i < 2; i++) {
      const x = x0 + 2 + i * 6
      t.rect(x, bas - 3, 5, 3, v('#9A6A4E'))
      t.rect(x, bas - 4, 5, 1, v(choisir(ra, ['#D9443A', '#E07B39', '#7DB862'])))
    }
  else if (b === 'cafe') {
    t.rect(x0 + 3, bas - 6, 4, 6, v('#2A2C30'))
    t.rect(x0 + 3, bas - 6, 4, 1, v('#9A6A4E'))
    t.px(x0 + 4, bas - 4, v('#F4F1E8'))
    t.px(x0 + 5, bas - 3, v('#F4F1E8'))
  }
}

// La fiche d'un bâtiment (src/fiche.ts) le décrit d'après son ADN.
const NOMS: Record<Type, string> = { pavillon: 'Pavillon', commerce: 'Immeuble à commerce', atelier: 'Atelier', brique: 'Immeuble de briques', pierre: 'Immeuble de pierre', barre: 'Résidence', bureaux: 'Tour de bureaux' }
const PHRASES: Record<Accessoire, string> = {
  jardinieres: 'des jardinières fleuries', linge: 'du linge qui sèche', clim: 'des climatiseurs', parabole: 'une parabole', stores: 'des stores rayés',
  solaire: 'des panneaux solaires', potager: 'un potager sur le toit', antenne: 'une antenne râteau', drapeau: 'un drapeau sur le toit', lierre: 'du lierre qui grimpe',
  horloge: 'une horloge', velo: 'un vélo devant la porte', haie: 'une haie', cheminee: 'une haute cheminée', graphique: 'une peinture murale des années 70', eolienne: 'une éolienne',
}
const BOUTIQUES_NOMS: Record<Boutique, string> = { boulangerie: 'une boulangerie', cafe: 'un café', fleuriste: 'un fleuriste', librairie: 'une librairie', pharmacie: 'une pharmacie', epicerie: 'une épicerie' }
export const decrire = (plan: Plan): { titre: string; details: string[] } => {
  const adn = plan.adn ?? tirerAdn(plan.id, plan.type)
  const titre = `${NOMS[plan.type]} · ${adn.facade[0]}${adn.toit ? `, toit en ${adn.toit[0]}` : ''}`
  const details = [
    ...(adn.boutique ? [`Au rez-de-chaussée, ${BOUTIQUES_NOMS[adn.boutique]}`] : []),
    ...adn.accessoires.map(x => PHRASES[x]),
    ...(adn.chat ? [`un chat ${adn.chat[0]} à une fenêtre`] : []),
  ]

  return { titre, details: details.map((d, i) => (i === 0 ? d[0]!.toUpperCase() + d.slice(1) : d)) }
}

// ── Un chantier en cours : les étages faits en gros œuvre, l'échafaudage jusqu'au dernier étage prévu ──
export type Chantier = { id: string; etages: number; construits: number; largeur: number; badge: string }
export const MARGE_CHANTIER = 5 // de la toile au mur, contour compris
// La hauteur, depuis le sol, du plancher où travaillent les ouvriers.
export const plancher = (construits: number): number => (construits > 0 ? RDC + (construits - 1) * ETAGE : 0)

export const chantier = (c: Chantier, P: Palette): Toile => {
  const { etages: n, largeur: w, construits } = c
  const corps = RDC + (n - 1) * ETAGE
  const marge = MARGE_CHANTIER - 1
  const t = new Toile(w + 2 * marge, corps + 18)
  const bas = t.h
  const x0 = marge
  const top = (k: number) => bas - RDC - k * ETAGE
  const hautFait = construits > 0 ? top(construits - 1) : bas
  t.rect(x0, hautFait, w, bas - hautFait, P.beton3)
  for (let k = 0; k < construits; k++) {
    t.rect(x0, top(k), w, 2, P.beton2)
    for (const x of colonnes(w, WW + 1, WW + 2)) t.rect(x0 + x, top(k) + Math.max(3, Math.floor((ETAGE - WH) / 2) + 1), WW + 1, WH, P.nuit > 0.5 ? '#0B0C0F' : P.beton2)
  }
  // Les poteaux de l'étage suivant, déjà coulés.
  if (construits < n) for (const x of [0, Math.floor(w / 2) - 1, w - 2]) t.rect(x0 + x, top(construits) + 3, 2, ETAGE - 3, P.beton2)
  t.rect(x0, top(construits) + 1, w, 2, P.beton2)
  // L'échafaudage : montants, plancher et garde-corps à chaque niveau, une croix dans une travée sur deux.
  const pas = Math.round(ETAGE * 0.8)
  const hautEch = top(n - 1) - 4
  for (let x = 0; x <= w + 2; x += pas) t.rect(x0 - 2 + Math.min(x, w + 1), hautEch, 1, bas - hautEch, P.acier2)
  for (let k = 1; k <= n; k++) {
    const yl = top(k - 1)
    t.rect(x0 - 2, yl, w + 4, 1, P.acier2)
    t.rect(x0 - 2, yl - 1, w + 4, 1, P.bois)
    t.rect(x0 - 2, yl - Math.round(ETAGE * 0.55), w + 4, 1, P.acier)
  }
  for (let x = 0, i = 0; x + pas <= w + 2; x += pas, i++)
    for (let k = construits; k < n; k++) if ((i + k) % 2 === 0) t.ligne(x0 - 2 + x, top(k), x0 - 2 + x + pas, top(k) + ETAGE - 1, P.acier)
  // Le filet de protection sur les étages faits.
  for (let y = hautFait; y < bas - RDC; y++) for (let x = x0 - 2; x < x0 + w + 2; x++) if ((x + y) % 2 === 0 && y % 4 < 2) t.px(x, y, '#3FA89A55')
  // Le fanion de la session en haut de l'échafaudage.
  t.rect(x0 + w + 1, hautEch - 9, 1, 9, P.acier2)
  t.sprite(['FFFF..', 'FFFFFF', 'FFFF..'], { F: c.badge }, x0 + w + 2, hautEch - 9)

  return t.contour()
}

// ── La grue à tour, sans son câble : la livraison s'anime à part (src/chantier.ts) ──
export type Grue = { toile: Toile; pied: number; chariot: number; sousFleche: number }
// `portee` : la distance du mât au chariot, qui se place au-dessus du chantier.
export const grue = (P: Palette, hauteur: number, fleche: number, contre: number, portee: number): Grue => {
  const mat = 4
  const t = new Toile(contre + fleche + mat + 4, hauteur + 14)
  const xm = contre + 2
  const yj = 12
  const J = melanger(P.jaune, '#0D1020', 0.45 * P.nuit), J2 = melanger(P.jaune2, '#0D1020', 0.45 * P.nuit)
  t.rect(xm, yj, 1, hauteur, J)
  t.rect(xm + mat - 1, yj, 1, hauteur, J)
  for (let y = yj; y < yj + hauteur; y += mat) t.ligne(xm, y, xm + mat - 1, y + mat - 1, J2)
  t.rect(xm - 3, yj + hauteur - 3, mat + 6, 3, P.beton2)
  const yb = yj + 3
  t.rect(xm - contre, yj, contre + fleche + mat, 1, J)
  t.rect(xm - contre, yb, contre + fleche + mat, 1, J)
  for (let x = xm - contre; x < xm + mat + fleche - 3; x += 4) { t.ligne(x, yb, x + 2, yj, J2); t.ligne(x + 2, yj, x + 4, yb, J2) }
  t.rect(xm - contre, yb + 1, 8, 5, P.beton2)
  t.rect(xm - contre, yb + 3, 8, 1, P.beton)
  t.rect(xm + Math.floor(mat / 2) - 1, yj - 10, 2, 10, J)
  t.ligne(xm + Math.floor(mat / 2), yj - 10, xm + mat + fleche - 2, yj - 1, J2)
  t.ligne(xm + Math.floor(mat / 2) - 1, yj - 10, xm - contre + 2, yj - 1, J2)
  t.px(xm + Math.floor(mat / 2) - 1, yj - 11, P.feu)
  t.px(xm + Math.floor(mat / 2), yj - 11, P.feu)
  // La cabine et son grutier.
  t.rect(xm + mat, yb + 1, 7, 6, J2)
  t.rect(xm + mat + 2, yb + 2, 4, 3, P.cabine)
  t.px(xm + mat + 3, yb + 2, P.jaune)
  t.px(xm + mat + 3, yb + 3, '#E9B48F')
  // Le chariot.
  const xc = xm + mat + portee
  t.rect(xc - 2, yb + 1, 5, 2, P.acier)

  return { toile: t.contour(), pied: xm + 1, chariot: xc + 1, sousFleche: yb + 4 }
}

// La charge que la grue descend : une palette de briques, ses élingues et le crochet.
export const palette_briques = (P: Palette): Toile => {
  const t = new Toile(15, 13)
  t.rect(6, 0, 3, 2, P.orange)
  t.ligne(7, 2, 2, 6, P.acier2)
  t.ligne(7, 2, 12, 6, P.acier2)
  t.rect(1, 6, 13, 5, P.brique)
  for (let y = 7; y < 11; y += 2) t.rect(1, y, 13, 1, P.brique2)
  t.rect(0, 11, 15, 2, P.bois)

  return t
}

// ── Les lampadaires : éteints sur une toile, leur lumière sur une autre qui s'allume au coucher ──
export const HAUTEUR_LAMPE = 34
// Le fût est à PIED_LAMPE pixels du bord gauche de la toile : le cône déborde des deux côtés.
export const PIED_LAMPE = 20
export const lampadaire = (P: Palette, allumee: boolean): Toile => {
  const t = new Toile(48, HAUTEUR_LAMPE + 2)
  const x = PIED_LAMPE
  const pied = t.h
  const h = HAUTEUR_LAMPE
  if (!allumee) {
    t.rect(x - 1, pied - 3, 3, 3, P.fut)
    t.rect(x, pied - h, 1, h, P.fut)
    t.rect(x + 1, pied - h, 6, 1, P.fut)
    t.px(x + 1, pied - h + 1, P.fut)
    t.rect(x + 5, pied - h + 1, 4, 2, P.fut)
    t.rect(x + 6, pied - h + 3, 2, 1, JOUR.lampe)
    return t.contour()
  }
  // La lampe allumée, son cône tramé et la flaque de lumière sur le trottoir (sans contour).
  const lx = x + 7, ly = pied - h + 3
  t.rect(x + 6, ly, 2, 1, '#FFE9A8')
  for (let j = 1; ly + j < pied; j++) {
    const l = Math.round(2 + j * 0.55)
    for (let i = -l; i <= l; i++) if ((lx + i + ly + j) % 2 === 0 || Math.abs(i) < l * 0.6) t.px(lx + i, ly + j, '#FFD86A26')
  }
  for (let i = -14; i <= 14; i++) t.px(lx + i, pied - 1, Math.abs(i) < 9 ? '#FFD86A66' : '#FFD86A2E')
  // La même taille que la lampe éteinte, contour compris, pour se poser exactement dessus.
  const p = new Toile(t.w + 2, t.h + 2)
  p.coller(t, 1, 1)

  return p
}

// ── La ville au loin, en silhouettes, qui se répète sous le ciel ──
export const lointain = (P: Palette, largeur = 480, hauteur = 110): Toile => {
  const t = new Toile(largeur, hauteur)
  const r = hasard('lointain')
  for (let x = -4; x < largeur; ) {
    const l = entre(r, 12, 34), h = entre(r, 30, hauteur - 12), c = r() < 0.5 ? P.lointain : P.lointain2
    t.rect(x, hauteur - h, l, h, c)
    if (r() < 0.3) t.rect(x + entre(r, 2, l - 4), hauteur - h - entre(r, 3, 9), 1, 9, c)
    for (let y = hauteur - h + 3; y < hauteur - 2; y += 3) for (let i = x + 2; i < x + l - 2; i += 3) if (r() < 0.07 && P.lumieres > 0) t.px(i, y, P.lointainFenetre)
    x += l + entre(r, -3, 1)
  }

  return t
}

// ── Le petit décor ──
const FORMES = {
  cone: ['..O..', '..O..', '.oWo.', '.OWO.', '.OOO.', 'NNNNN'],
  barriere: ['Y.....Y', 'YNNYYNN', 'YYYNNYY', 'Y.....Y', 'Y.....Y', 'N.....N'],
  arbre: ['....LLLL....', '..LLGGGGLL..', '.LGGGGGGGGL.', 'LGGGGgGGGGGL', 'LGGGgGGGgGGL', '.GGGGGGGGGg.', '..gGGGgGGg..', '....gTTg....', '.....TT.....', '.....TT.....', '.....TT.....', '....TTTT....'],
  sacs: ['.SSS.SSS.', 'SsssSsssS', 'SSSSSSSSS', '..SSSSS..', '.SsssssS.', '.SSSSSSS.'],
  palettes: ['BBBBBBBBBB', 'b.b..b..b.', 'BBBBBBBBBB'],
}
export type Decor = keyof typeof FORMES
export const decor = (nom: Decor, P: Palette): Toile => {
  const pal = { O: P.orange, o: melanger(P.orange, '#000000', 0.3), W: P.blanc, Y: P.jaune, N: '#1B1C1E', G: P.vegetal, g: P.vegetal2, L: P.vegetal3, T: P.tronc, B: P.bois, b: P.bois2, S: P.sable, s: P.sable2 }
  const lignes = FORMES[nom]
  const t = new Toile(lignes[0]!.length, lignes.length)
  t.sprite(lignes, pal, 0, 0)

  return t.contour()
}

// La palissade du chantier : planches, rubalise, et le panneau de la session à la couleur de son badge.
export const palissade = (P: Palette, longueur: number, badge: string, nom: string): Toile => {
  const hauteur = Math.round(ETAGE * 1.3)
  const t = new Toile(longueur, hauteur)
  for (let x = 0; x < longueur; x++) {
    const c = Math.floor(x / 4) % 2 ? P.blanc2 : P.blanc
    t.rect(x, 0, 1, hauteur, x % 4 === 0 ? melanger(c, '#000000', 0.12) : c)
  }
  t.rect(0, 0, longueur, 1, P.acier)
  const yr = Math.round(hauteur * 0.62)
  for (let x = 0; x < longueur; x++) {
    t.px(x, yr, Math.floor(x / 3) % 2 ? P.jaune : ENCRE)
    t.px(x, yr + 1, Math.floor((x + 1) / 3) % 2 ? P.jaune : ENCRE)
  }
  // Le nom de la session, en lettres de 3 × 5, coupé à la largeur du panneau.
  const texte = nom.toUpperCase().replace(/[^A-Z0-9ÉÈÀ -]/g, '').slice(0, Math.floor((longueur - 10) / 4))
  const lp = Math.max(14, texte.length * 4 + 5), hp = 9
  const xp = Math.round((longueur - lp) / 2), yp = 2
  t.rect(xp, yp, lp, hp, melanger(badge, '#0D1020', 0.35 * P.nuit))
  t.rect(xp, yp, lp, 1, ENCRE)
  t.rect(xp, yp + hp - 1, lp, 1, ENCRE)
  ecrire(t, texte, xp + 3, yp + 2, ENCRE)
  if (P.lumieres > 0) for (let x = 2; x < longueur; x += 26) t.rect(x, 1, 1, 2, P.feu)

  return t.contour()
}

// Une police de 3 × 5 pixels, pour les panneaux.
const LETTRES: Record<string, string> = {
  A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110', E: '111100110100111', F: '111100110100100',
  G: '011100101101011', H: '101101111101101', I: '111010010010111', J: '001001001101010', K: '101101110101101', L: '100100100100111',
  M: '101111111101101', N: '110101101101101', O: '010101101101010', P: '110101110100100', Q: '010101101110011', R: '110101110101101',
  S: '011100010001110', T: '111010010010010', U: '101101101101111', V: '101101101101010', W: '101101111111101', X: '101101010101101',
  Y: '101101010010010', Z: '111001010100111', 0: '111101101101111', 1: '010110010010111', 2: '110001010100111', 3: '110001010001110',
  4: '101101111001001', 5: '111100110001110', 6: '011100111101111', 7: '111001010010010', 8: '111101111101111', 9: '111101111001110',
  É: '010111110100111', È: '100111110100111', À: '100010101111101', '-': '000000111000000', ' ': '000000000000000',
}
export const ecrire = (t: Toile, texte: string, x: number, y: number, c: string): void => {
  for (const ch of texte) {
    const m = LETTRES[ch] ?? LETTRES[' ']!
    for (let i = 0; i < 15; i++) if (m[i] === '1') t.px(x + (i % 3), y + Math.floor(i / 3), c)
    x += 4
  }
}
