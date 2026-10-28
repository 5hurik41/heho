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
const choisir = <T>(r: () => number, liste: readonly T[]): T => liste[Math.floor(r() * liste.length)]!
const entre = (r: () => number, a: number, b: number): number => a + Math.floor(r() * (b - a + 1))

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

export type Plan = { id: string; type: Type; etages: number; largeur: number; badge: string }
export const planBatiment = (id: string, etages: number, badge: string): Plan => {
  const r = hasard(`plan-${id}`)
  const type = choisir(r, POSSIBLES(etages))
  const [a, b] = LARGEURS[type]

  return { id, type, etages, largeur: entre(r, a, b), badge }
}

// La fenêtre se tire au sort de 0 à 9 ; elle s'allume quand le soleil allume au moins autant de fenêtres sur dix.
const fenetre = (t: Toile, x: number, y: number, ww: number, wh: number, P: Palette, r: () => number, { volets = null as string | null, appui = true, croisee = true } = {}): void => {
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
}

const colonnes = (w: number, ww: number, ecart: number, marge = 3): number[] => {
  const n = Math.max(1, Math.floor((w - 2 * marge + ecart) / (ww + ecart)))
  const x0 = Math.floor((w - (n * ww + (n - 1) * ecart)) / 2)

  return Array.from({ length: n }, (_, i) => x0 + i * (ww + ecart))
}

export const batiment = (plan: Plan, P: Palette): Toile => {
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
  const porte = (x: number, l: number, h: number, c: string) => {
    t.rect(x, bas - h, l, h, c)
    t.rect(x, bas - h, l, 1, melanger(c, '#000000', 0.3))
    t.px(x + l - 2, bas - Math.ceil(h / 2), P.jaune)
  }

  switch (plan.type) {
    case 'pavillon': {
      const mur = r() < 0.5 ? P.enduit : P.enduitB
      t.rect(x0, haut, w, corps, mur)
      t.rect(x0, haut, 1, corps, mur === P.enduit ? P.enduit2 : P.enduitB2)
      const volets = melanger(choisir(r, ['#4F7A5A', '#4E6F96', '#8E5A3C']), '#0D1020', 0.6 * P.nuit)
      const cols = colonnes(w, WW, WW + 4, 4)
      for (let k = 0; k < n; k++)
        cols.forEach((x, i) => {
          if (k === 0 && i === cols.length - 1) porte(x0 + x, WW + 1, PORTE, badge)
          else fenetre(t, x0 + x, fy(k), WW, WH, P, r, { volets })
        })
      const pente = Math.ceil((w + 4) / 2.6)
      for (let j = 0; j < pente; j++) {
        const l = Math.max(2, Math.round((w + 4) * (1 - j / pente)))
        t.rect(Math.round((w + 4 - l) / 2), haut - 1 - j, l, 1, j % 3 === 2 ? P.tuile2 : P.tuile)
      }
      t.rect(x0 + Math.round(w * 0.7), haut - pente + 1, 3, Math.round(pente * 0.7), P.brique2)
      break
    }
    case 'commerce': {
      t.rect(x0, haut, w, corps, choisir(r, [P.enduit, P.enduitB, P.pierre]))
      // La vitrine, allumée le soir, le store rayé au badge et l'enseigne.
      const hv = RDC - 6
      t.rect(x0, bas - RDC, w, RDC, P.bois2)
      t.rect(x0 + 2, bas - hv, w - 4, hv - 1, P.lumieres > 0 ? P.vitrine : P.vitre)
      if (P.lumieres === 0) t.ligne(x0 + 4, bas - 3, x0 + 8, bas - hv + 1, P.reflet)
      porte(x0 + w - 7, 5, hv - 1, melanger(badge, '#000000', 0.2))
      t.rect(x0, bas - RDC, w, 4, melanger(badge, '#000000', 0.45))
      for (let i = 3; i < w - 3; i += 3) t.px(x0 + i, bas - RDC + 1 + (i % 2), P.blanc2)
      for (let i = -1; i < w + 1; i++) {
        const c = Math.floor((i + 1) / 3) % 2 ? P.blanc : badge
        t.rect(x0 + i, bas - RDC + 4, 1, 3, c)
        if (i % 3 === 1) t.px(x0 + i, bas - RDC + 7, c)
      }
      for (let k = 1; k < n; k++) for (const x of colonnes(w, WW, WW + 2)) fenetre(t, x0 + x, fy(k), WW, WH, P, r)
      t.rect(x0 - 1, haut - 2, w + 2, 2, P.blanc2)
      break
    }
    case 'atelier': {
      t.rect(x0, haut, w, corps, P.brique)
      for (let y = haut + 2; y < bas; y += 3) for (let x = x0 + ((y / 3) % 2 ? 0 : 2); x < x0 + w; x += 4) t.px(x, y, P.brique2)
      // La grande porte à lames, au badge, et les fenêtres hautes.
      const lp = Math.round(w * 0.45)
      t.rect(x0 + 3, bas - PORTE - 2, lp, PORTE + 2, melanger(badge, '#000000', 0.15))
      for (let y = bas - PORTE; y < bas; y += 2) t.rect(x0 + 3, y, lp, 1, melanger(badge, '#000000', 0.4))
      for (let x = x0 + lp + 6; x + WW <= x0 + w - 2; x += WW + 2) fenetre(t, x, bas - RDC + 3, WW, Math.round(WH * 0.8), P, r, { appui: false })
      for (let k = 1; k < n; k++) for (const x of colonnes(w, WW + 2, 2)) fenetre(t, x0 + x, fy(k), WW + 2, WH - 2, P, r, { appui: false })
      // Le toit en sheds : des dents de scie vitrées.
      const dent = Math.round(ETAGE * 0.7)
      for (let x = 0; x < w; x += dent)
        for (let j = 0; j < Math.round(dent * 0.6); j++) {
          t.rect(x0 + x, haut - 1 - j, Math.max(0, Math.round(dent * (1 - j / (dent * 0.6)))), 1, P.beton2)
          t.px(x0 + x, haut - 1 - j, P.lumieres > 0 ? P.lointainFenetre : P.verre)
        }
      break
    }
    case 'brique': {
      t.rect(x0, haut, w, corps, P.brique)
      for (let y = haut + 1; y < bas; y += 3) {
        t.rect(x0, y, w, 1, P.briqueJoint)
        for (let x = x0 + (Math.floor(y / 3) % 2 ? 1 : 3); x < x0 + w; x += 4) t.px(x, y + 1, P.brique2)
      }
      const cols = colonnes(w, WW, WW + 2)
      for (let k = 0; k < n; k++)
        cols.forEach((x, i) => {
          if (k === 0 && i === Math.floor(cols.length / 2)) return porte(x0 + x - 1, WW + 2, PORTE, badge)
          t.rect(x0 + x - 1, fy(k) - 1, WW + 2, 1, P.pierre2)
          fenetre(t, x0 + x, fy(k), WW, WH, P, r)
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
      break
    }
    case 'pierre': {
      t.rect(x0, haut, w, corps, P.pierre)
      for (let k = 1; k < n; k++) t.rect(x0, top(k) + ETAGE - 1, w, 1, P.pierre2)
      const cols = colonnes(w, WW, WW + 3)
      // Le rez-de-chaussée en bossages, la porte cochère au badge.
      t.rect(x0, bas - RDC, w, RDC, P.pierre2)
      for (let y = bas - RDC + 3; y < bas; y += 3) t.rect(x0, y, w, 1, melanger(P.pierre2, '#000000', 0.15))
      cols.forEach((x, i) => {
        if (i === Math.floor(cols.length / 2)) {
          t.rect(x0 + x - 1, bas - PORTE - 2, WW + 2, PORTE + 2, melanger(P.pierre2, '#000000', 0.25))
          porte(x0 + x, WW, PORTE, badge)
        } else fenetre(t, x0 + x, bas - RDC + 3, WW, RDC - 5, P, r, { appui: false })
      })
      for (let k = 1; k < n; k++) {
        cols.forEach(x => fenetre(t, x0 + x, top(k) + 1, WW, ETAGE - 4, P, r, { appui: false }))
        // Balcons filants au deuxième et au dernier étage, balconnets ailleurs.
        const yb = top(k) + ETAGE - 3
        if (k === 1 || k === n - 1) {
          t.rect(x0, yb + 1, w, 1, P.pierre2)
          for (let x = x0; x < x0 + w; x += 2) t.px(x, yb, ENCRE)
          t.rect(x0, yb - 1, w, 1, ENCRE)
        } else
          cols.forEach(x => {
            t.rect(x0 + x - 1, yb - 1, WW + 2, 1, ENCRE)
            for (let i = 0; i < WW + 2; i += 2) t.px(x0 + x - 1 + i, yb, ENCRE)
          })
      }
      t.rect(x0 - 1, haut - 2, w + 2, 2, P.pierre3)
      // Le toit mansardé en zinc, ses lucarnes et ses souches de cheminée.
      const hm = Math.round(ETAGE * 1.1)
      for (let j = 0; j < hm; j++) t.rect(x0 + Math.round(j * 0.35), haut - 3 - j, w - 2 * Math.round(j * 0.35), 1, j % 4 === 3 ? P.zinc2 : P.zinc)
      cols.forEach((x, i) => {
        if (i % 2) return
        t.rect(x0 + x - 1, haut - hm + 1, WW + 2, hm - 3, P.pierre3)
        t.rect(x0 + x - 2, haut - hm, WW + 4, 1, P.zinc2)
        fenetre(t, x0 + x, haut - hm + 3, WW, hm - 6, P, r, { appui: false, croisee: false })
      })
      for (const x of [x0 + 3, x0 + w - 8]) {
        t.rect(x, haut - hm - 4, 5, 5, P.brique)
        for (let i = 0; i < 5; i += 2) t.rect(x + i, haut - hm - 6, 1, 2, P.tuile2)
      }
      break
    }
    case 'barre': {
      t.rect(x0, haut, w, corps, P.beton)
      for (let k = 1; k < n; k++) t.rect(x0, top(k) + ETAGE - 1, w, 1, P.joint)
      const cols = colonnes(w, WW + 2, 3)
      const loggias = [badge, P.blanc, melanger(badge, P.blanc, 0.5)].map(c => melanger(c, '#0D1020', 0.5 * P.nuit))
      for (let k = 0; k < n; k++)
        cols.forEach((x, i) => {
          if (k === 0) {
            if (i === 1) porte(x0 + x, WW + 2, PORTE, badge)
            else fenetre(t, x0 + x, fy(0), WW + 2, WH, P, r, { appui: false })
            return
          }
          fenetre(t, x0 + x, fy(k), WW + 2, WH, P, r, { appui: false })
          // Une loggia sur deux, garde-corps coloré.
          if ((i + k) % 2 === 0) t.rect(x0 + x - 1, fy(k) + WH - 2, WW + 4, 3, loggias[i % 3]!)
        })
      t.rect(x0 - 1, haut - 2, w + 2, 2, P.beton2)
      t.rect(x0 + 4, haut - 7, 12, 5, P.beton2)
      for (const x of [x0 + w - 6, x0 + w - 10]) {
        t.rect(x, haut - 12, 1, 10, P.acier2)
        t.rect(x - 2, haut - 10, 5, 1, P.acier2)
      }
      break
    }
    case 'bureaux': {
      t.rect(x0, haut, w, corps, P.verre)
      for (let x = x0 + 2; x < x0 + w; x += 4) t.rect(x, haut, 1, corps, P.verre2)
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
      t.rect(x0, bas - RDC, w, RDC, P.verre2)
      porte(x0 + Math.round(w / 2) - 3, 6, PORTE, P.lumieres > 0 ? P.vitrine : P.reflet)
      t.rect(x0 + Math.round(w / 2) - 5, bas - PORTE - 2, 10, 2, badge)
      t.rect(x0, haut, 1, corps, P.meneau)
      t.rect(x0 + w - 1, haut, 1, corps, P.meneau)
      // Le couronnement en retrait, l'antenne et son feu rouge.
      t.rect(x0 + 3, haut - 6, w - 6, 6, P.verre2)
      t.rect(x0 + 3, haut - 6, w - 6, 1, P.meneau)
      const xa = x0 + Math.round(w / 2)
      t.rect(xa, haut - 22, 1, 16, P.acier2)
      t.rect(xa - 1, haut - 14, 3, 1, P.acier2)
      t.px(xa, haut - 23, P.feu)
      break
    }
  }
  // Le liseré du badge sur les toits plats, comme avant la refonte.
  if (!['pavillon', 'pierre', 'atelier'].includes(plan.type)) t.rect(x0, haut, w, 1, badge)

  return t.contour()
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
const ecrire = (t: Toile, texte: string, x: number, y: number, c: string): void => {
  for (const ch of texte) {
    const m = LETTRES[ch] ?? LETTRES[' ']!
    for (let i = 0; i < 15; i++) if (m[i] === '1') t.px(x + (i % 3), y + Math.floor(i / 3), c)
    x += 4
  }
}
