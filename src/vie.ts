// La vie du quartier (BRIEF.md, « Vie du quartier ») : le calendrier (saison, fête), le programme de la journée à
// l'heure réelle, et les dessins de ce qui passe dans la rue. Même trame que src/pixels.ts : un pixel de dessin vaut
// un pixel CSS, et tout ce qui bouge porte un contour d'encre, sauf les nuages et les oiseaux du lointain.
import { ENCRE, Toile, choisir, ecrire, enneiger, entre, hasard, melanger, type Fete, type Moment, type Palette, type Saison } from './pixels'

// ── Le calendrier ──────────────────────────────────────────────────────────
// Les saisons météorologiques, inversées dans l'hémisphère sud (la ville de Réglages, src/soleil.ts).
const SAISONS: Saison[] = ['hiver', 'hiver', 'printemps', 'printemps', 'printemps', 'ete', 'ete', 'ete', 'automne', 'automne', 'automne', 'hiver']

export const momentDe = (date: Date, lat: number): Moment => {
  const mois = date.getMonth(), jour = date.getDate(), heure = date.getHours() + date.getMinutes() / 60
  const saison = SAISONS[(mois + (lat < 0 ? 6 : 0)) % 12]!
  const fete: Fete =
    (mois === 6 && ((jour === 13 && heure >= 21) || (jour === 14 && heure >= 21.5))) || (mois === 11 && jour === 31 && heure >= 23) || (mois === 0 && jour === 1 && heure < 2)
      ? 'feux'
      : (mois === 9 && jour >= 24) || (mois === 10 && jour === 1 && heure < 6)
        ? 'halloween'
        : mois === 11 || (mois === 0 && jour <= 6)
          ? 'noel'
          : null

  return { saison, fete, heure, dimanche: date.getDay() === 0 }
}

// Ce qui se passe dans la rue à cette heure-ci. `monde` : de 0 à 1, combien de passants.
export type Programme = { poubelles: boolean; terrasse: boolean; ecole: boolean; pigeons: boolean; monde: number; deguises: boolean; chauvesSouris: boolean }
export const programme = (m: Moment, jourDeSemaine: number): Programme => {
  const h = m.heure
  const ouvre = jourDeSemaine >= 1 && jourDeSemaine <= 5
  const monde = h < 6 ? 0.1 : h < 7 ? 0.3 : h < 9.5 ? 0.8 : h < 12 ? 0.5 : h < 14 ? 1 : h < 17 ? 0.6 : h < 19.5 ? 0.9 : h < 22 ? 0.4 : 0.15

  return {
    poubelles: h >= 5.5 && h < 7,
    terrasse: h >= 12 && h < 14 && m.saison !== 'hiver',
    ecole: ouvre && jourDeSemaine !== 3 && h >= 16.5 && h < 17.25,
    pigeons: h >= 6.5 && h < 20,
    monde,
    deguises: m.fete === 'halloween' && h >= 17 && h < 21.5,
    chauvesSouris: (m.fete === 'halloween' || m.saison === 'ete') && (h >= 19.5 || h < 5),
  }
}

// ── Les dessins ────────────────────────────────────────────────────────────
const voile = (P: Palette, c: string, force = 0.6): string => melanger(c, '#0D1020', force * P.nuit)
const dessin = (lignes: string[], pal: Record<string, string>, contour = true): Toile => {
  const t = new Toile(Math.max(...lignes.map(l => l.length)), lignes.length)
  t.sprite(lignes, pal, 0, 0)

  return contour ? t.contour() : t
}

// Le pigeon : 0 et 1 posé (il picore), 2 et 3 en vol.
const PIGEON = [
  ['....hh.', '....hhb', '.GGGGh.', 'GGWGGG.', '..o.o..'],
  ['.......', '.......', '.GGGGhh', 'GGWGGhb', '..o.o..'],
  ['.WW....', '..WW.hh', 'GGGGGhb', '.......', '.......'],
  ['.......', '.....hh', 'GGGGGhb', '..WW...', '.WW....'],
]
export const pigeon = (P: Palette, pose: number): Toile =>
  dessin(PIGEON[pose % 4]!, { G: voile(P, '#8C93A0'), h: voile(P, '#5C6577'), W: voile(P, '#B9BEC8'), b: voile(P, '#E0B080'), o: voile(P, '#D9822B') })

// Le chat : assis, qui marche (deux images) ou endormi en boule.
const CHAT = {
  assis: ['c..c', 'cccc', 'eccE', 'cccc', 'cccc', 'cccc'],
  marche0: ['c.......c.', '.c.....ccc', '.cccccccEc', '..ccccccc.', '..c.c..c.c'],
  marche1: ['c.......c.', '.c.....ccc', '.cccccccEc', '..ccccccc.', '...c.c.c..'],
  dort: ['...cc.c.', '.cccccc.', 'cccccccc'],
}
export type PoseChat = keyof typeof CHAT
export const chat = (P: Palette, robe: string, pose: PoseChat): Toile => {
  const yeux = P.lumieres > 0 ? '#E8D84A' : voile(P, '#3A3C40')

  return dessin(CHAT[pose], { c: voile(P, robe), e: yeux, E: yeux })
}

// Un enfant à la sortie de l'école, ou déguisé le soir d'Halloween.
export type Costume = 'cartable' | 'fantome' | 'citrouille' | 'sorciere'
export const enfant = (P: Palette, couleur: string, image: number, costume: Costume = 'cartable'): Toile => {
  const jambes = image % 2 ? ['..s.s..', '.kk.kk.'] : ['.s...s.', 'kk...kk']
  const pal = { h: voile(P, '#5A3A2A'), s: voile(P, '#E9B48F'), T: voile(P, couleur), b: voile(P, '#C0392B'), p: voile(P, '#2F4E7A'), k: voile(P, '#2A2C33'), W: voile(P, '#F4F1E8', 0.4), O: voile(P, '#E07020'), y: '#FFE08A', g: voile(P, '#4F7A3A'), V: voile(P, '#4A2F6A'), n: ENCRE }
  const corps: Record<Costume, string[]> = {
    cartable: ['..hhh..', '..sss..', '..sss..', '.bTTTs.', '.bTTTs.', '..TTT..', '..ppp..', '..p.p..', ...jambes],
    fantome: ['..WWW..', '.WWWWW.', '.WnWnW.', '.WWWWW.', 'WWWWWWW', 'WWWWWWW', 'WWWWWWW', 'W.WW.WW', ...jambes],
    citrouille: ['...g...', '..sss..', '..sss..', '.OOOOO.', 'OyOOOyO', 'OOyyyOO', '.OOOOO.', '..p.p..', ...jambes],
    sorciere: ['...V...', '..VVV..', 'VVVVVVV', '..sss..', '.VVVVV.', '.sVVVs.', '.VVVVV.', 'VVVVVVV', ...jambes],
  }

  return dessin(corps[costume], pal)
}

export const ballon = (P: Palette): Toile => dessin(['.r.', 'rwr', '.r.'], { r: voile(P, '#D9443A'), w: voile(P, '#F4F1E8') })

// Une roue de véhicule ; ses rayons tournent d'une image à l'autre.
const roue = (t: Toile, x: number, y: number, image: number, P: Palette): void => {
  t.sprite(['.kkk.', 'kkkkk', 'kkkkk', 'kkkkk', '.kkk.'], { k: '#2A2C33' }, x, y)
  t.px(x + 2, y + 2, voile(P, '#B9BEC8'))
  if (image % 2) { t.px(x + 1, y + 1, '#55575E'); t.px(x + 3, y + 3, '#55575E') } else { t.px(x + 3, y + 1, '#55575E'); t.px(x + 1, y + 3, '#55575E') }
}

// Le bus du quartier : il s'arrête et dépose un ouvrier quand une session démarre.
export const bus = (P: Palette, image: number, passagers: number): Toile => {
  const t = new Toile(50, 22)
  const r = hasard(`bus-${passagers}`)
  const vert = voile(P, '#3E8E6A'), creme = voile(P, '#E8E0C8'), vitre = P.lumieres > 0 ? '#FFE7B0' : voile(P, '#7FA3C0')
  t.rect(0, 2, 50, 15, vert)
  t.rect(0, 2, 50, 3, creme)
  t.rect(1, 1, 48, 1, creme)
  for (let x = 3; x < 38; x += 7) {
    t.rect(x, 6, 6, 5, vitre)
    if (r() < passagers / 6) t.sprite(['.h.', 'sss'], { h: voile(P, choisir(r, ['#5A3A2A', '#2A2C33', '#C79A2E'])), s: voile(P, '#E9B48F') }, x + 1 + entre(r, 0, 2), 8)
  }
  // La porte, le pare-brise et la girouette de destination.
  t.rect(39, 6, 5, 11, voile(P, '#2F6E52'))
  t.rect(40, 7, 3, 9, vitre)
  t.rect(45, 5, 5, 7, vitre)
  t.rect(0, 12, 50, 1, creme)
  t.rect(33, 0, 17, 7, ENCRE)
  ecrire(t, 'HÉHO', 34, 1, '#F5C542')
  t.px(49, 14, '#FFE9A8')
  t.px(0, 14, P.feu)
  roue(t, 7, 15, image, P)
  roue(t, 38, 15, image, P)

  return t.contour()
}

// La bétonnière, tambour qui tourne : elle arrive quand un nouveau plan commence.
export const betonniere = (P: Palette, image: number): Toile => {
  const t = new Toile(42, 20)
  const orange = voile(P, '#E07B39'), gris = voile(P, '#C9C6BC')
  for (let y = 1; y < 14; y++)
    for (let x = 2; x < 30; x++) {
      const dx = (x - 15.5) / 13.5, dy = (y - 7.5) / 6.5
      if (dx * dx + dy * dy <= 1) t.px(x, y, (((x + y + image * 2) % 8) + 8) % 8 < 2 ? orange : gris)
    }
  t.rect(28, 3, 3, 5, voile(P, '#86888C'))
  t.rect(31, 5, 10, 10, orange)
  t.rect(34, 6, 6, 4, P.lumieres > 0 ? '#2A2C33' : voile(P, '#7FA3C0'))
  t.rect(0, 13, 42, 3, voile(P, '#5E606A'))
  t.px(41, 12, '#FFE9A8')
  for (const x of [4, 14, 33]) roue(t, x, 15, image, P)

  return t.contour()
}

// Le camion des poubelles, au petit matin.
export const poubelles = (P: Palette, image: number): Toile => {
  const t = new Toile(42, 20)
  const blanc = voile(P, '#E8E6E0'), vert = voile(P, '#3E8E6A')
  t.rect(0, 3, 30, 12, blanc)
  t.rect(0, 9, 30, 2, vert)
  for (let x = 3; x < 28; x += 4) t.rect(x, 4, 1, 4, voile(P, '#C9C6BC'))
  t.rect(31, 6, 10, 9, blanc)
  t.rect(33, 7, 6, 4, P.lumieres > 0 ? '#2A2C33' : voile(P, '#7FA3C0'))
  t.rect(31, 11, 10, 1, vert)
  t.rect(0, 14, 42, 2, voile(P, '#5E606A'))
  // L'éboueur debout sur le marchepied, gilet orange.
  t.sprite(['.s.', 'OOO', 'OOO', '.p.', 'p.p'], { s: voile(P, '#E9B48F'), O: '#FF7A2F', p: voile(P, '#2F4E7A') }, -1, 8)
  t.px(41, 13, '#FFE9A8')
  t.px(4, 2, image % 2 ? '#FF9A3C' : '#7A3A10')
  for (const x of [5, 22, 34]) roue(t, x, 15, image, P)

  return t.contour()
}

// L'avion à banderole : il passe quand tombe une médaille.
export const avion = (P: Palette, image: number, texte: string): Toile => {
  const lettres = texte.toUpperCase()
  const lb = lettres.length * 4 + 5
  const t = new Toile(lb + 30, 13)
  const blanc = voile(P, '#F4F1E8'), rouge = voile(P, '#D9443A')
  // La banderole, qui ondule d'une image à l'autre, et sa corde.
  for (let x = 0; x < lb; x++) {
    const dy = Math.round(Math.sin(x / 5 + image * 1.6))
    t.rect(x, 3 + dy, 1, 8, x === 0 || x === lb - 1 ? rouge : blanc)
    t.px(x, 3 + dy, rouge)
    t.px(x, 10 + dy, rouge)
  }
  const mot = new Toile(lb, 6)
  ecrire(mot, lettres, 3, 0, '#2A2C33')
  t.coller(mot, 0, 4)
  t.ligne(lb, 7, lb + 10, 6, voile(P, '#5E606A'))
  // L'avion : fuselage, aile, dérive et hélice.
  const xa = lb + 11
  t.rect(xa, 5, 16, 3, blanc)
  t.rect(xa + 1, 3, 2, 2, rouge)
  t.rect(xa + 6, 7, 6, 2, rouge)
  t.rect(xa + 11, 4, 3, 1, voile(P, '#7FA3C0'))
  t.rect(xa + 16, 5, 1, 3, voile(P, '#5E606A'))
  t.rect(xa + 17, image % 2 ? 2 : 6, 1, 5, voile(P, '#86888C'))

  return t.contour()
}

export const chauveSouris = (image: number): Toile => dessin(image % 2 ? ['.......', '..kkk..', 'kk.k.kk', 'k.....k'] : ['k.....k', 'kk.k.kk', '..kkk..', '.......'], { k: '#1B1C22' }, false)
export const oiseau = (image: number): Toile => dessin(image % 2 ? ['k...k', '.k.k.', '..k..'] : ['.....', 'kk.kk', '..k..'], { k: '#2A2C33' }, false)

// La terrasse du café à midi : un parasol, une table, deux chaises.
export const terrasse = (P: Palette, couleur: string): Toile => {
  const t = new Toile(17, 15)
  const c = voile(P, couleur), b = voile(P, '#F4F1E8')
  for (let j = 0; j < 3; j++) for (let i = j; i < 17 - j; i++) t.px(i, 2 - j + 1, Math.floor(i / 3) % 2 ? b : c)
  t.rect(1, 4, 15, 1, c)
  t.rect(8, 5, 1, 10, voile(P, '#5E606A'))
  t.rect(5, 10, 7, 1, voile(P, '#9A6A4E'))
  t.rect(6, 11, 1, 4, voile(P, '#6B4433'))
  t.rect(10, 11, 1, 4, voile(P, '#6B4433'))
  t.px(6, 9, b)
  t.px(10, 9, voile(P, '#E07B39'))

  return t.contour()
}

// L'arrêt de bus.
export const arret = (P: Palette): Toile =>
  dessin(['.BBB.', '.BwB.', '.BBB.', '..a..', '..a..', '..a..', '..a..', '..a..', '..a..', '..a..', '..a..', '..a..', '..a..', '.aaa.'], { B: voile(P, '#3E8E6A'), w: voile(P, '#F4F1E8'), a: P.fut })

// L'arbre du trottoir selon la saison : en fleurs, vert, roux, nu sous la neige.
const ARBRE = ['....LLLL....', '..LLGGGGLL..', '.LGGGGGGGGL.', 'LGGGGgGGGGGL', 'LGGGgGGGgGGL', '.GGGGGGGGGg.', '..gGGGgGGg..', '....gTTg....', '.....TT.....', '.....TT.....', '.....TT.....', '....TTTT....']
const ARBRE_NU = ['..b..b...b..', '...b.b..b...', '.b..bbb.b..b', '..b..bTb..b.', '...bb.T.bb..', '....b.Tb....', '.....TTb....', '.....TT.....', '.....TT.....', '.....TT.....', '.....TT.....', '....TTTT....']
const FEUILLAGES: Record<Exclude<Saison, 'hiver'>, Record<'G' | 'g' | 'L', string>> = {
  printemps: { G: '#7DB862', g: '#5A9A4C', L: '#F2B5C8' },
  ete: { G: '#5A9A4C', g: '#3F7537', L: '#7DB862' },
  automne: { G: '#D9822B', g: '#B8452F', L: '#E0B33A' },
}
export const arbre = (P: Palette, saison: Saison, graine = 0): Toile => {
  const T = voile(P, '#6B4433')
  if (saison === 'hiver') return enneiger(dessin(ARBRE_NU, { b: voile(P, '#7A5A48'), T }), P)
  const f = FEUILLAGES[saison]
  const lignes = saison === 'printemps' ? ARBRE.map((l, j) => [...l].map((c, i) => (c === 'G' && (i * 7 + j * 3 + graine) % 5 === 0 ? 'L' : c)).join('')) : ARBRE

  return dessin(lignes, { G: voile(P, f.G), g: voile(P, f.g), L: voile(P, f.L), T })
}

// Un nuage, sans contour : des bosses sur une base plate, ombré en dessous, teinté par le bas du ciel.
export const nuage = (P: Palette, graine: number, cielBas: string): Toile => {
  const r = hasard(`nuage-${graine}`)
  const l = entre(r, 20, 34), h = entre(r, 7, 10)
  const t = new Toile(l, h)
  const bosses = Array.from({ length: entre(r, 2, 4) }, () => ({ x: entre(r, 4, l - 5), y: entre(r, 2, h - 4), rayon: entre(r, 3, Math.min(6, h - 2)) }))
  const nuit = P.nuit > 0.5
  const clair = nuit ? '#3A4256B0' : melanger('#F6F8FA', cielBas, 0.25)
  const ombre = nuit ? '#2C3346B0' : melanger('#D3DCE6', cielBas, 0.3)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < l; x++) {
      const dedans = (y >= h - 3 && x >= 2 && x < l - 2) || bosses.some(b => Math.hypot(x - b.x, (y - b.y) * 1.3) <= b.rayon)
      if (dedans) t.px(x, y, y >= h - 2 ? ombre : clair)
    }

  return t
}
