// La vie dans la rue (BRIEF.md, « Vie du quartier » ; planche docs/vie/planche.html) : des passants selon l'heure, le
// bus, la bétonnière, le camion des poubelles, l'avion d'une médaille, les nuages, les oiseaux, les pigeons et le chat
// sur les toits, la terrasse du café, et un calque pour la vie aux fenêtres, la fumée, la neige, les feuilles et les
// feux d'artifice. Moitié moins chargée que la planche. Rien quand le téléphone demande moins de mouvement, ni quand
// l'appli est cachée.
import { ambianceDeLaScene, posesDeLaRue, type Pose } from './chantier'
import { BOITE } from './equipe'
import type { Role } from './message'
import { Toile, ecrire, hasard, type Palette } from './pixels'
import * as vie from './vie'

const PASSANTS: Role[] = ['researcher', 'painter', 'thinker', 'mechanic', 'builder', 'mason', 'digger', 'welder']
// Les hauteurs depuis le bas de la scène (src/chantier.ts) : le pied des bâtiments, celui des piétons, la scène.
const SOL = 15
const PIETONS = 13
const H = 210
// La planche est dessinée sur 560 px : sur un écran plus étroit, les passants sont plus rares d'autant.
const LARGEUR_PLANCHE = 560

const calme = (): boolean => matchMedia('(prefers-reduced-motion: reduce)').matches
const visible = (): boolean => document.visibilityState === 'visible'
const programme = (): vie.Programme => vie.programme(ambianceDeLaScene().m, new Date().getDay())

// ── Les images des dessins, pour la palette de la scène ──
type Image = { src: string; w: number; h: number }
let cleImages = ''
const images = new Map<string, Image>()
const image = (cle: string, f: (P: Palette) => Toile): Image => {
  const a = ambianceDeLaScene()
  if (a.cle !== cleImages) { images.clear(); cleImages = a.cle }
  let i = images.get(cle)
  if (!i) {
    const t = f(a.P)
    i = { src: t.url(), w: t.w, h: t.h }
    images.set(cle, i)
  }

  return i
}
const deux = (cle: string, f: (P: Palette, k: number) => Toile): [Image, Image] => [image(`${cle}-0`, P => f(P, 0)), image(`${cle}-1`, P => f(P, 1))]
const ouvrier = (role: Role): [Image, Image] => [0, 1].map(k => ({ src: `./ouvriers/roles/${role}-${k}.svg`, w: BOITE.largeur, h: BOITE.hauteur })) as [Image, Image]
const paire = ([a, b]: [Image, Image], classe = 'image-2'): string => `<img src="${a.src}" alt=""><img class="${classe}" src="${b.src}" alt="">`

// ── Ce qui traverse l'écran : passants, enfants, véhicules, avion ──
type Traversee = { images: [Image, Image]; bas: number; duree: number; gauche?: boolean; delai?: number; classe?: string }
const traverser = (ciel: HTMLElement, t: Traversee): HTMLElement => {
  const [a] = t.images
  const p = document.createElement('span')
  p.className = `passant${t.classe ? ` ${t.classe}` : ''}${t.gauche ? ' vers-gauche' : ''}`
  p.setAttribute('aria-hidden', 'true')
  Object.assign(p.style, { width: `${a.w}px`, height: `${a.h}px`, bottom: `${t.bas}px`, animationDuration: `${t.duree}s`, animationDelay: `${t.delai ?? 0}s` })
  p.innerHTML = paire(t.images)
  p.addEventListener('animationend', e => e.target === p && p.remove())
  ciel.append(p)

  return p
}
const basOuvrier = (): number => PIETONS - (BOITE.hauteur - 1 - BOITE.pieds)
const passant = (ciel: HTMLElement, role: Role, duree: number, gauche = Math.random() < 0.5, delai = 0): void => {
  traverser(ciel, { images: ouvrier(role), bas: basOuvrier(), duree, gauche, delai })
}
const enfants = (ciel: HTMLElement, costumes: (vie.Costume | null)[], couleurs: string[], gauche: boolean): void =>
  costumes.forEach((c, k) =>
    traverser(ciel, { images: deux(`enfant-${c}-${couleurs[k]}`, (P, i) => vie.enfant(P, couleurs[k]!, i, c ?? 'cartable')), bas: PIETONS - 1, duree: 24, gauche, delai: k * 0.7 }),
  )

const sortieEcole = (ciel: HTMLElement): void => {
  const gauche = Math.random() < 0.5
  enfants(ciel, [null, null, null, null], ['#E07B39', '#4E9BD8', '#7DB862', '#E58FB0'], gauche)
  const b = image('ballon', P => vie.ballon(P))
  traverser(ciel, { images: [b, b], bas: PIETONS, duree: 24, gauche, delai: 1.2, classe: 'ballon' })
}

const deguises = (ciel: HTMLElement): void => {
  const gauche = Math.random() < 0.5
  const costumes: vie.Costume[] = ['fantome', 'citrouille', 'sorciere']
  const tirage = [costumes[Math.floor(Math.random() * 3)]!, costumes[Math.floor(Math.random() * 3)]!]
  enfants(ciel, tirage, ['#E07B39', '#4E9BD8'], gauche)
  passant(ciel, 'thinker', 24, gauche, 1.8)
}

// Le bus s'arrête au milieu de l'écran et dépose un ouvrier ; les autres véhicules passent sans s'arrêter.
export type Vehicule = 'bus' | 'betonniere' | 'poubelles'
const DUREES: Record<Vehicule, number> = { bus: 26, betonniere: 16, poubelles: 34 }
export const rouler = (racine: ParentNode, genre: Vehicule): void => {
  const ciel = racine.querySelector<HTMLElement>('.ciel')
  if (!ciel || calme() || !visible()) return
  const dessin = { bus: (P: Palette, k: number) => vie.bus(P, k, 4), betonniere: vie.betonniere, poubelles: vie.poubelles }[genre]
  traverser(ciel, { images: deux(genre, dessin), bas: 2, duree: DUREES[genre], classe: `vehicule ${genre}` })
  if (genre === 'bus')
    setTimeout(() => {
      if (!ciel.isConnected) return
      traverser(ciel, { images: ouvrier('builder'), bas: basOuvrier(), duree: 12, classe: 'depose' })
    }, DUREES.bus * 0.47 * 1000)
}

// L'avion à banderole, quand une médaille tombe.
export const survoler = (racine: ParentNode, texte: string): void => {
  const ciel = racine.querySelector<HTMLElement>('.ciel')
  if (!ciel || calme() || !visible()) return
  const lettres = texte.toUpperCase().normalize('NFC').replace(/[^A-Z0-9ÉÈÀ -]/g, ' ').slice(0, 28)
  traverser(ciel, { images: deux(`avion-${lettres}`, (P, k) => vie.avion(P, k, lettres)), bas: 150, duree: 34, classe: 'avion' })
}

// ── Le minuteur des passants et des véhicules ──
let minuteur: ReturnType<typeof setTimeout> | undefined
let prochainBus = 0
let prochainesPoubelles = 0
let prochaineEcole = 0
let prochainVol = 0

const vol = (ciel: HTMLElement): void => {
  const n = 5 + Math.floor(Math.random() * 3)
  const v = document.createElement('span')
  v.className = 'passant vol vers-gauche'
  v.setAttribute('aria-hidden', 'true')
  Object.assign(v.style, { width: '40px', height: '14px', bottom: `${130 + Math.round(Math.random() * 50)}px`, animationDuration: '40s' })
  const [a, b] = deux('oiseau', (_, k) => vie.oiseau(k))
  v.innerHTML = Array.from({ length: n }, (_, i) => {
    const d = Math.abs(i - (n - 1) / 2)
    return `<span style="left:${Math.round(d * 7)}px;top:${Math.round(d * 4)}px;animation-delay:${(i * -0.13).toFixed(2)}s">${paire([a, b])}</span>`
  }).join('')
  v.addEventListener('animationend', e => e.target === v && v.remove())
  ciel.append(v)
}

const tic = (racine: ParentNode): void => {
  const ciel = racine.querySelector<HTMLElement>('.ciel')
  if (!ciel?.isConnected) return
  const p = programme()
  const maintenant = Date.now()
  const nuit = Number(getComputedStyle(document.documentElement).getPropertyValue('--etoiles')) > 0.5
  if (!calme() && visible()) {
    if (p.deguises && Math.random() < 0.6) deguises(ciel)
    else if (!nuit || Math.random() < 0.33) passant(ciel, PASSANTS[Math.floor(Math.random() * PASSANTS.length)]!, 18 + Math.random() * 8)
    if (p.ecole && maintenant > prochaineEcole) { prochaineEcole = maintenant + 80_000; sortieEcole(ciel) }
    const h = ambianceDeLaScene().m.heure
    if (!nuit && h >= 6 && h < 23 && maintenant > prochainBus) { prochainBus = maintenant + 90_000 + Math.random() * 40_000; rouler(racine, 'bus') }
    if (p.poubelles && maintenant > prochainesPoubelles) { prochainesPoubelles = maintenant + 70_000; rouler(racine, 'poubelles') }
    if (!nuit && maintenant > prochainVol) { prochainVol = maintenant + (ambianceDeLaScene().m.saison === 'automne' ? 28_000 : 60_000) + Math.random() * 20_000; vol(ciel) }
  }
  // La nuit, la rue reste calme comme avant : un tour toutes les une à deux minutes, un passant sur trois ; sauf le
  // soir d'Halloween, quand les enfants déguisés font la tournée.
  const attente = nuit && !p.deguises ? 60 + Math.random() * 60 : (4 + 18 * (1 - p.monde) * Math.random()) * (LARGEUR_PLANCHE / Math.max(300, ciel.clientWidth))
  minuteur = setTimeout(() => tic(racine), attente * 1000)
}

// Lance la vie dans la scène affichée ; un nouvel appel remplace l'ancien minuteur.
export const animerRue = (racine: ParentNode): void => {
  clearTimeout(minuteur)
  const maintenant = Date.now()
  prochainBus = Math.max(prochainBus, maintenant + 20_000)
  prochainVol = Math.max(prochainVol, maintenant + 15_000)
  minuteur = setTimeout(() => tic(racine), 3000)
  peupler(racine)
  calque(racine)
}

// Un appel vient d'arriver : le livreur (le coursier) passe, plus vite qu'un promeneur.
export const livrer = (racine: ParentNode): void => {
  const ciel = racine.querySelector<HTMLElement>('.ciel')
  if (ciel && !calme()) passant(ciel, 'courier', 11)
}

// ── Ce qui vit sur place : nuages, chauves-souris, pigeons, chat, terrasse ──
// Le haut du dessin d'un bâtiment à la colonne x, depuis le bas de sa toile.
const toit = (pose: Pose, x: number): number => {
  const t = pose.dessin().toile
  let y = 0
  while (y < t.h && !t.plein(x, y)) y++

  return t.h - y
}

let cleVue = ''
export const peupler = (racine: ParentNode): void => {
  const ciel = racine.querySelector<HTMLElement>('.ciel')
  const rue = racine.querySelector<HTMLElement>('.rue')
  if (!ciel || !rue) return
  cleVue = ambianceDeLaScene().cle
  for (const el of ciel.querySelectorAll('.vit')) el.remove()
  const { P } = ambianceDeLaScene()
  const p = programme()
  const ajouter = (hote: HTMLElement, html: string) => hote.insertAdjacentHTML('beforeend', html)

  // Les nuages dérivent derrière la ville au loin, chacun à son rythme.
  const loin = ciel.querySelector('.lointain')
  const nuages = document.createElement('span')
  nuages.className = 'vit nuages'
  nuages.setAttribute('aria-hidden', 'true')
  const cielBas = getComputedStyle(document.documentElement).getPropertyValue('--ciel-bas').trim() || '#A9BED0'
  nuages.innerHTML = [0, 1, 2].map(k => {
    const n = image(`nuage-${k}-${cielBas}`, P2 => vie.nuage(P2, k, cielBas))
    const duree = 160 + k * 50

    return `<img src="${n.src}" width="${n.w}" height="${n.h}" alt="" style="top:${12 + k * 22}px;animation-duration:${duree}s;animation-delay:${-Math.round(duree * (0.2 + k * 0.3))}s">`
  }).join('')
  loin?.before(nuages)
  if (p.chauvesSouris) {
    const [a, b] = deux('chauve-souris', (_, k) => vie.chauveSouris(k))
    ajouter(ciel, `<span class="vit chauves-souris" aria-hidden="true">${[0, 1, 2].map(k => `<span style="--k:${k}">${paire([a, b])}</span>`).join('')}</span>`)
  }

  const poses = posesDeLaRue()
  // Les pigeons, sur un toit sur trois, le jour.
  if (p.pigeons)
    for (const pose of poses) {
      if (hasard(`pigeons-${pose.plan.id}`)() >= 0.3) continue
      const [a, b] = deux('pigeon', (P2, k) => vie.pigeon(P2, k))
      const [v1, v2] = deux('pigeon-vol', (P2, k) => vie.pigeon(P2, 2 + k))
      for (const f of [0.3, 0.62]) {
        const x = Math.round(pose.dessin().toile.w * f)
        ajouter(rue, `<span class="vit pigeon" role="presentation" style="left:${pose.x + x - 3}px;bottom:${SOL + toit(pose, x) - 2}px;width:${a.w}px;height:${a.h}px;--d:${(f * 3).toFixed(1)}s">${paire([a, b])}${paire([v1, v2], 'vol-2')}</span>`)
      }
    }
  // Le chat du dernier bâtiment qui en a un : endormi au soleil, assis la nuit, les yeux allumés.
  const chez = [...poses].reverse().find(x => x.plan.adn?.chat)
  if (chez) {
    const pose: vie.PoseChat = P.lumieres > 0 ? 'assis' : 'dort'
    const c = image(`chat-${pose}-${chez.plan.adn!.chat![1]}`, P2 => vie.chat(P2, chez.plan.adn!.chat![1], pose))
    const x = Math.round(chez.dessin().toile.w * 0.3)
    ajouter(rue, `<img class="vit chat" src="${c.src}" width="${c.w}" height="${c.h}" alt="" style="left:${chez.x + x}px;bottom:${SOL + toit(chez, x) - 2}px">`)
  }
  // La terrasse du café, de midi à 14 h, et un ouvrier en pause.
  if (p.terrasse)
    for (const pose of poses) {
      if (pose.plan.adn?.boutique !== 'cafe') continue
      const t = image(`terrasse-${pose.plan.badge}`, P2 => vie.terrasse(P2, pose.plan.badge))
      ajouter(rue, `<img class="vit terrasse" src="${t.src}" width="${t.w}" height="${t.h}" alt="" style="left:${pose.x + 2}px;bottom:${PIETONS}px">`)
      ajouter(rue, `<span class="vit ouvrier" style="left:${pose.x + 18 - BOITE.corpsX}px;bottom:${basOuvrier()}px;width:${BOITE.largeur}px;height:${BOITE.hauteur}px">${paire(ouvrier('resting'))}</span>`)
    }
}

// Quand l'heure ou le soleil ont changé la scène (src/main.ts, chaque demi-minute) : les habitants suivent.
export const rafraichirRue = (racine: ParentNode): void => {
  if (ambianceDeLaScene().cle !== cleVue) peupler(racine)
}

// Toucher un pigeon : il s'envole et revient plus tard. Toucher le chat : il répond.
export const brancherRue = (racine: ParentNode): void => {
  const rue = racine.querySelector<HTMLElement>('.rue')
  rue?.addEventListener('click', e => {
    const cible = e.target as HTMLElement
    const pigeon = cible.closest<HTMLElement>('.pigeon')
    if (pigeon && !pigeon.classList.contains('envol')) {
      pigeon.classList.add('envol')
      setTimeout(() => pigeon.classList.remove('envol'), 20_000)
    }
    const chat = cible.closest<HTMLImageElement>('.chat')
    if (chat) {
      const b = image('bulle-miaou', () => {
        const t = new Toile(25, 10)
        t.rect(0, 0, 25, 8, '#F4F1E8')
        t.rect(3, 8, 2, 2, '#F4F1E8')
        ecrire(t, 'MIAOU', 3, 2, '#1B1C1E')

        return t.contour()
      })
      const bulle = document.createElement('img')
      Object.assign(bulle, { src: b.src, width: b.w, height: b.h, alt: '', className: 'vit bulle' })
      bulle.style.left = `${chat.offsetLeft - 4}px`
      bulle.style.bottom = `${parseInt(chat.style.bottom) + chat.height + 1}px`
      rue.append(bulle)
      setTimeout(() => bulle.remove(), 1800)
    }
  })
}

// ── Le calque animé : la vie aux fenêtres, la fumée, la neige, les feuilles, les feux d'artifice ──
type Particule = { x: number; y: number; vx: number; vy: number; vie: number; age: number; c: string; taille: number; genre: 'flocon' | 'feuille' | 'etincelle' | 'fumee' | 'fusee' }
let particules: Particule[] = []
let boucle = 0
let prochaineFusee = 0
const IMAGE_MS = 1000 / 12

const calque = (racine: ParentNode): void => {
  cancelAnimationFrame(boucle)
  const ciel = racine.querySelector<HTMLElement>('.ciel')
  const horizon = racine.querySelector<HTMLElement>('.horizon')
  if (!ciel || !horizon || calme()) return
  let canvas = ciel.querySelector<HTMLCanvasElement>('canvas.calque')
  if (!canvas) {
    canvas = document.createElement('canvas')
    canvas.className = 'calque'
    canvas.setAttribute('aria-hidden', 'true')
    ciel.append(canvas)
  }
  const ctx = canvas.getContext('2d')!
  particules = []
  let avant = performance.now()
  let temps = 0
  const image_ = (t: number): void => {
    if (!ciel.isConnected) return
    boucle = requestAnimationFrame(image_)
    if (!visible() || t - avant < IMAGE_MS) return
    const dt = Math.min(0.25, (t - avant) / 1000)
    avant = t
    temps += dt
    const W = ciel.clientWidth
    if (canvas.width !== W) canvas.width = W
    if (canvas.height !== H) canvas.height = H
    ctx.clearRect(0, 0, W, H)
    dessinerCalque(ctx, racine, horizon.scrollLeft, W, dt, temps)
  }
  boucle = requestAnimationFrame(image_)
}

const dessinerCalque = (ctx: CanvasRenderingContext2D, racine: ParentNode, defile: number, W: number, dt: number, temps: number): void => {
  const { P, m } = ambianceDeLaScene()
  const nuit = Number(getComputedStyle(document.documentElement).getPropertyValue('--etoiles')) > 0.5
  const poses = posesDeLaRue()
  const ajouter = (p: Omit<Particule, 'age'>) => particules.length < 220 && particules.push({ ...p, age: 0 })

  for (const pose of poses) {
    const d = pose.dessin()
    const x0 = pose.x - defile, y0 = H - SOL - d.toile.h
    if (x0 > W || x0 + d.toile.w < 0) continue
    // Le soir, des silhouettes passent derrière les fenêtres allumées, une télé clignote en bleu.
    if (P.lumieres > 0)
      d.vues.forEach((q, i) => {
        if (!q.allumee || q.rdc) return
        const r = hasard(`vue-${pose.plan.id}-${i}`)
        const genre = r()
        if (genre < 0.12) {
          ctx.fillStyle = `rgba(110,170,255,${0.18 + 0.2 * Math.abs(Math.sin(temps * 9 + i * 3) * Math.sin(temps * 2.3 + i))})`
          ctx.fillRect(x0 + q.x, y0 + q.y, q.w, q.h)
        } else if (genre < 0.35) {
          const periode = 14 + r() * 20, k = ((temps + r() * periode) % periode) / 3
          if (k < 1) {
            ctx.save()
            ctx.beginPath(); ctx.rect(x0 + q.x, y0 + q.y, q.w, q.h); ctx.clip()
            ctx.fillStyle = 'rgba(20,16,24,0.55)'
            const x = x0 + q.x - 3 + Math.round(k * (q.w + 3))
            ctx.fillRect(x + 1, y0 + q.y + q.h - 6, 2, 2)
            ctx.fillRect(x, y0 + q.y + q.h - 4, 4, 4)
            ctx.restore()
          }
        }
      })
    // La fumée des cheminées en hiver, celle de l'atelier les jours ouvrés.
    const fume = m.saison === 'hiver' || (pose.plan.adn?.accessoires.includes('cheminee') && !m.dimanche && m.heure > 7 && m.heure < 18)
    if (fume) for (const [cx, cy] of d.cheminees) if (Math.random() < dt * 1.2) ajouter({ x: pose.x + cx, y: y0 + cy, vx: 3 + Math.random() * 2, vy: -6 - Math.random() * 3, vie: 3, c: nuit ? '#5A6070' : '#C9CDD3', taille: 2, genre: 'fumee' })
  }
  // Les feuilles et les pétales des arbres du trottoir.
  if (m.saison === 'automne' || m.saison === 'printemps')
    for (const a of racine.querySelectorAll<HTMLImageElement>('.rue img.decor[data-dessin="arbre"]'))
      if (Math.random() < dt * 0.3) ajouter({ x: a.offsetLeft + 2 + Math.random() * 10, y: H - SOL - 12, vx: 5, vy: 6, vie: 6, c: m.saison === 'automne' ? (['#D9822B', '#B8452F', '#E0B33A'] as const)[Math.floor(Math.random() * 3)]! : '#F2B5C8', taille: 1, genre: 'feuille' })
  if (m.saison === 'hiver' && Math.random() < dt * 14) ajouter({ x: defile + Math.random() * W, y: -2, vx: 0, vy: 10 + Math.random() * 10, vie: 30, c: '#F4F6F8', taille: Math.random() < 0.2 ? 2 : 1, genre: 'flocon' })
  if (m.fete === 'feux' && nuit && temps > prochaineFusee) {
    prochaineFusee = temps + 1.6 + Math.random() * 2.4
    ajouter({ x: defile + 40 + Math.random() * (W - 80), y: H - SOL, vx: 0, vy: -90 - Math.random() * 30, vie: 0.9 + Math.random() * 0.4, c: '#FFE9A8', taille: 1, genre: 'fusee' })
  }

  const nouvelles: Particule[] = []
  for (const p of particules) {
    p.age += dt
    if (p.genre === 'flocon') p.vx = Math.sin(temps * 1.3 + p.x) * 4
    if (p.genre === 'feuille') p.vx = 5 + Math.sin(temps * 3 + p.y) * 8
    if (p.genre === 'etincelle') p.vy += 30 * dt
    p.x += p.vx * dt
    p.y += p.vy * dt
    if (p.genre === 'fusee' && p.age >= p.vie) {
      const c = ['#FF5A5A', '#F5C542', '#7DE0FF', '#B07AD9', '#7DE07D', '#FFFFFF'][Math.floor(Math.random() * 6)]!
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2, s = 25 + Math.random() * 15
        nouvelles.push({ x: p.x, y: p.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, vie: 1.4, age: 0, c, taille: 1, genre: 'etincelle' })
      }
    }
  }
  particules = [...particules.filter(p => p.age < p.vie && p.y < H - (p.genre === 'flocon' ? 2 : SOL - 2)), ...nouvelles]
  for (const p of particules) {
    ctx.globalAlpha = p.genre === 'fumee' ? Math.max(0, 0.6 * (1 - p.age / p.vie)) : p.genre === 'etincelle' ? Math.max(0, 1 - p.age / p.vie) : 1
    ctx.fillStyle = p.c
    const t = p.genre === 'fumee' ? Math.round(2 + p.age * 2) : p.taille
    ctx.fillRect(Math.round(p.x - defile), Math.round(p.y), t, t)
  }
  ctx.globalAlpha = 1
}

// ── Les annonces : une session qui démarre fait venir le bus puis la bétonnière, une médaille l'avion ──
const lire = <T>(cle: string, defaut: T): T => {
  try {
    return (JSON.parse(localStorage.getItem(cle) ?? 'null') as T | null) ?? defaut
  } catch {
    return defaut
  }
}
const noter = (cle: string, v: unknown): void => {
  try {
    localStorage.setItem(cle, JSON.stringify(v))
  } catch {
    // Sans stockage, rien ne s'annonce deux fois dans la même visite : rien de grave.
  }
}
export const annoncer = (racine: ParentNode, sessions: string[], medailles: { titre: string; date: number }[]): void => {
  const vues = lire<string[] | null>('heho-sessions-vues', null)
  const nouvelles = vues ? sessions.filter(s => !vues.includes(s)) : []
  noter('heho-sessions-vues', [...new Set([...sessions, ...(vues ?? [])])].slice(0, 60))
  if (nouvelles.length) {
    rouler(racine, 'bus')
    setTimeout(() => rouler(racine, 'betonniere'), 9000)
    prochainBus = Date.now() + 120_000
  }
  const vue = lire<number | null>('heho-medaille-vue', null)
  const derniere = medailles.reduce((a, x) => (x.date > a.date ? x : a), { titre: '', date: 0 })
  noter('heho-medaille-vue', Math.max(derniere.date, vue ?? 0))
  if (vue !== null && derniere.date > vue && Date.now() - derniere.date < 86_400_000) setTimeout(() => survoler(racine, `BRAVO ${derniere.titre}`), 2500)
}
