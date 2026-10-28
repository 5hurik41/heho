// Les chantiers : la progression de chaque session (le plan de task-steps). En haut de l'historique, le quartier :
// sous le ciel de l'heure (src/soleil.ts), la ligne d'horizon des chantiers finis, un bâtiment chacun, et à droite les chantiers en
// cours, qui montent d'un étage par étape faite. Sous la scène, le mur du chef, une case par jour comme le mur
// d'activité de GitHub. Un chantier fini s'envole vers la case du jour avant de rejoindre l'horizon.
import { BOITE } from './equipe'
import { enCours, estFini, faites, type Role } from './message'
import {
  batiment,
  chantier,
  decor,
  ETAGE,
  grue,
  hasard,
  lampadaire,
  lointain,
  MARGE_CHANTIER,
  palette,
  palette_briques,
  palissade,
  PIED_LAMPE,
  planBatiment,
  plancher,
  RDC,
  Toile,
  type Palette,
} from './pixels'
import { ambianceActuelle, cielActuel } from './soleil'
import { jourDe, type Batiment, type Chantier, type Journee } from './stockage'

// Au-delà, un chantier non terminé est considéré comme abandonné : la scène ne le montre plus.
const ACTIF_MS = 2 * 3600_000
// Un chantier fini reste sur sa parcelle, ouvriers au café, avant de rejoindre l'horizon.
const FINI_MS = 10 * 60_000
const CHANTIERS_MAX = 6
const SEMAINES = 17
// La plus haute tour, en étages.
const ETAGES_MAX = 12

export const echapper = (s: string): string =>
  s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

export const ilYa = (date: number): string => {
  const min = Math.round((Date.now() - date) / 60_000)
  if (min < 1) return "à l'instant"
  if (min < 60) return `il y a ${min} min`
  const h = Math.floor(min / 60)

  return h < 24 ? `il y a ${h} h` : new Date(date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

// Une heure relative (« il y a 3 min »), l'heure exacte au survol ; rafraichirHeures la tient à jour.
export const horodatage = (date: number): string => {
  const d = new Date(date)
  const exacte = d.toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

  return `<time class="heure" datetime="${d.toISOString()}" data-date="${date}" title="${exacte}">${ilYa(date)}</time>`
}

export const rafraichirHeures = (racine: HTMLElement): void => {
  for (const t of racine.querySelectorAll<HTMLTimeElement>('time[data-date]')) t.textContent = ilYa(Number(t.dataset.date))
}

// ── Ce que ce téléphone a déjà vu, pour n'animer que le nouveau (stockage du navigateur, facultatif) ──

const lireVu = <T>(cle: string, defaut: T): T => {
  try {
    const v = localStorage.getItem(cle)

    return v ? (JSON.parse(v) as T) : defaut
  } catch {
    return defaut
  }
}
const noterVu = (cle: string, v: unknown): void => {
  try {
    localStorage.setItem(cle, JSON.stringify(v))
  } catch {
    // Sans stockage, les animations rejoueront : rien de grave.
  }
}
const ETAGES_VUS = 'heho-etages-vus'
const BATIMENTS_VUS = 'heho-batiments-vus'
const ENVOLS_VUS = 'heho-envols-vus'
const JOUR_VU = 'heho-jour-vu'

// ── Le quartier (BRIEF.md, « Refonte graphique ») ────────────────────────
// Tout est dessiné au pixel par src/pixels.ts, en images posées à leur place dans la rue. Chaque image garde sa
// recette (data-dessin) : quand le soleil change la palette, repeindre les redessine sans refaire la page.

// Les hauteurs depuis le bas de la scène : la ligne où se posent les bâtiments (le haut du trottoir), celle où les
// piétons posent les pieds, et le pied des lampadaires.
const SOL = 15
const PIETONS = 13
const LAMPES = 12
const ENTRE_LAMPES = 96
// La grue reste sous le haut de la scène (210 px, moins le sol et sa flèche).
const GRUE_MAX = 178

type Image = { src: string; w: number; h: number }
const recettes = new Map<string, (P: Palette) => Toile>()
const images = new Map<string, Image>()

const paletteDuSoleil = (): { cle: string; P: Palette } => {
  const a = ambianceActuelle()
  const nuit = Math.round((a?.nuit ?? 1) * 8) / 8
  const lumieres = a?.lumieres ?? 5

  return { cle: `${nuit}/${lumieres}`, P: palette(nuit, lumieres) }
}
let courante = paletteDuSoleil()

// L'image d'une recette, pour la palette du moment ; dessinée une fois par palette.
const image = (cle: string, recette?: (P: Palette) => Toile): Image => {
  if (recette) recettes.set(cle, recette)
  let i = images.get(cle)
  if (!i) {
    const t = recettes.get(cle)!(courante.P)
    i = { src: t.url(), w: t.w, h: t.h }
    images.set(cle, i)
  }

  return i
}

const placer = (x: number, bas: number): string => `left:${x}px;bottom:${bas}px`
const img = (cle: string, i: Image, classe: string, x: number, bas: number, attributs = '', style = ''): string =>
  `<img class="${classe}" data-dessin="${echapper(cle)}" src="${i.src}" width="${i.w}" height="${i.h}" style="${placer(x, bas)}${style}" alt=""${attributs}>`

// Un ouvrier, le corps commençant en x, les semelles sur la ligne `pieds` (depuis le bas de la scène).
const basOuvrier = (pieds: number): number => pieds - (BOITE.hauteur - 1 - BOITE.pieds)
const ouvrier = (role: Role, x: number, pieds: number, i: number, attributs = ''): string => `
  <span class="ouvrier" style="${placer(x - BOITE.corpsX, basOuvrier(pieds))};width:${BOITE.largeur}px;height:${BOITE.hauteur}px"${attributs}>
    <img src="./ouvriers/roles/${role}-0.svg" alt="">
    <img class="image-2" src="./ouvriers/roles/${role}-1.svg" alt="" style="animation-delay:${i * -0.3}s">
  </span>`

// Quand le soleil a changé la palette : chaque image est redessinée d'après sa recette, à sa place.
export const repeindre = (racine: ParentNode): void => {
  const p = paletteDuSoleil()
  if (p.cle === courante.cle) return
  courante = p
  images.clear()
  for (const el of racine.querySelectorAll<HTMLElement>('[data-dessin]')) {
    const cle = el.dataset.dessin!
    if (!recettes.has(cle)) continue
    if (el instanceof HTMLImageElement) el.src = image(cle).src
    else el.style.backgroundImage = `url(${image(cle).src})`
  }
  racine.querySelector<HTMLElement>('.ciel')?.style.setProperty('--trottoir', courante.P.trottoir)
}

// Un bâtiment fini : son plan (type, largeur) se tire de son nom, ses étages de ses étapes.
const planDe = (id: string, etages: number, couleur: string) => planBatiment(id, Math.min(Math.max(etages, 1), ETAGES_MAX), couleur)

type Rue = { html: string[]; x: number }

const posBatiment = (rue: Rue, b: Batiment, neuf: boolean): void => {
  const plan = planDe(b.id, b.etages, b.couleur)
  const cle = `bat:${b.id}:${plan.etages}`
  const i = image(cle, P => batiment(plan, P))
  rue.html.push(
    img(cle, i, `bat${neuf ? ' neuf' : ''}`, rue.x, SOL, ` data-batiment="${echapper(b.id)}" role="button" tabindex="0" aria-haspopup="dialog" aria-label="${echapper(b.session)} · ${echapper(b.titre ?? 'Chantier')}, ${b.etages} étages : voir sa fiche"`),
  )
  rue.x += i.w - 2
  // Un arbre de temps en temps sur le trottoir, toujours au même endroit.
  if (hasard(`arbre-${b.id}`)() < 0.2) {
    const a = image('arbre', P => decor('arbre', P))
    rue.html.push(img('arbre', a, 'decor', rue.x + 1, PIETONS))
    rue.x += a.w + 2
  }
}

// Une parcelle en chantier : le gros œuvre monte d'un étage par étape faite, sous son échafaudage, derrière la
// palissade au badge de la session. `grue` : le premier chantier en cours a la sienne, qui livre chaque étage.
const posParcelle = (rue: Rue, c: Chantier, seule: boolean, vus: Record<string, number>, avecGrue: boolean): void => {
  const id = c.finiA !== undefined ? `${c.sessionId}:${c.finiA}` : c.sessionId
  const total = Math.min(Math.max(c.etapes.length, 1), ETAGES_MAX)
  const construits = Math.min(total, Math.round((faites(c) / Math.max(c.etapes.length, 1)) * total))
  const vu = Math.min(vus[c.sessionId] ?? construits, construits)
  const fini = estFini(c)
  const plan = planDe(id, total, c.couleur)
  const morceaux: string[] = []
  const x0 = rue.x
  let largeur: number

  if (fini) {
    // Fini : le bâtiment tel qu'il rejoindra l'horizon, l'équipe au café devant.
    const cle = `bat:${id}:${total}`
    const i = image(cle, P => batiment(plan, P))
    morceaux.push(img(cle, i, 'bat', 0, SOL))
    morceaux.push(ouvrier('resting', i.w - 8, PIETONS, 0))
    largeur = i.w + 6
  } else {
    const dessin = (n: number) => (P: Palette) => chantier({ id, etages: total, construits: n, largeur: plan.largeur, badge: c.couleur }, P)
    const cle = `chantier:${id}:${total}:${construits}`
    const i = image(cle, dessin(construits))
    // Un étage fait depuis la dernière visite : l'image d'avant, que animerScene remplace après la livraison.
    const avant = vu < construits ? image(`chantier:${id}:${total}:${vu}`, dessin(vu)) : i
    morceaux.push(`<img class="bat" data-dessin="${echapper(cle)}" src="${avant.src}" width="${i.w}" height="${i.h}" style="${placer(0, SOL)}" alt="">`)
    const p = image(`palissade:${id}`, P => palissade(P, plan.largeur + 4, c.couleur, c.session))
    morceaux.push(img(`palissade:${id}`, p, 'palissade', MARGE_CHANTIER - 3, SOL - 1))
    // L'équipe : la première sur le dernier plancher fait, les autres au pied de la palissade.
    const equipe: Role[] = (c.ouvriers.length ? c.ouvriers : (['builder'] as Role[])).slice(0, seule ? 3 : 2)
    equipe.forEach((r, k) => {
      if (k === 0 && construits > 0)
        morceaux.push(ouvrier(r, MARGE_CHANTIER + 3, SOL + plancher(vu), k, ` data-pieds-apres="${basOuvrier(SOL + plancher(construits))}"`))
      else morceaux.push(ouvrier(r, (k === 0 ? 2 : 4) + 16 * k, PIETONS, k))
    })
    largeur = i.w
    if (avecGrue) {
      // La grue, le mât à droite du chantier, la flèche tournée vers lui ; le chariot au-dessus de son milieu.
      const hauteur = Math.min(GRUE_MAX, RDC + (total - 1) * ETAGE + 34)
      const portee = Math.round(i.w / 2) + 3
      const cleGrue = `grue:${hauteur}:${portee}`
      const g = image(cleGrue, P => {
        const brute = grue(P, hauteur, 96, 30, portee).toile
        const t = new Toile(brute.w, brute.h)
        t.coller(brute, 0, 0, true)

        return t
      })
      const mesures = grue(courante.P, hauteur, 96, 30, portee)
      const mat = x0 + i.w + 4
      const gauche = mat - (g.w - 1 - (mesures.pied + 3))
      rue.html.push(img(cleGrue, g, 'grue', gauche, SOL - 2))
      // La livraison : du dessous de la flèche jusqu'au dernier plancher fait, moins la hauteur de la palette.
      const haut = SOL - 2 + (g.h - 1 - (mesures.sousFleche + 1))
      const pal = image('palette', P => palette_briques(P))
      const descente = Math.max(12, haut - (SOL + plancher(vu)) - pal.h)
      rue.html.push(`
        <span class="livraison" data-session="${echapper(c.sessionId)}" style="${placer(mat - portee - 1, haut)};--d:${descente}px">
          <span class="cable"></span><img class="charge" data-dessin="palette" src="${pal.src}" width="${pal.w}" height="${pal.h}" alt=""><span class="crochet"></span>
        </span>`)
      largeur = i.w + 40
    }
  }

  const envol = fini && c.finiA !== undefined ? ` data-envol="${echapper(id)}"` : ''
  const livrer = !fini && vu < construits ? ' data-livrer' : ''
  rue.html.push(`
    <div class="parcelle${fini ? ' fini' : ''}" data-session="${echapper(c.sessionId)}" data-construits="${construits}"${envol}${livrer} style="${placer(x0, 0)};width:${largeur}px"${
      fini ? '' : ` role="button" tabindex="0" aria-haspopup="dialog" aria-label="${echapper(c.session)} en chantier : empiler des briques en attendant"`
    }>${morceaux.join('')}</div>`)
  rue.x += largeur + 8
}

const estFiniRecemment = (c: Chantier): boolean => estFini(c) && c.finiA !== undefined && Date.now() - c.finiA < FINI_MS

export const chantiersDeLaScene = (chantiers: Chantier[]): Chantier[] =>
  chantiers.filter(c => (!estFini(c) && Date.now() - c.date < ACTIF_MS) || estFiniRecemment(c)).slice(0, CHANTIERS_MAX)

// Les étoiles s'effacent avec le jour (--etoiles, src/soleil.ts) ; chacune scintille à son rythme.
const ETOILES = `<span class="etoiles" aria-hidden="true">${Array.from({ length: 14 }, (_, i) => {
  const r = hasard(`etoile-${i}`)

  return `<i style="left:${(r() * 96).toFixed(1)}%;top:${(r() * 55).toFixed(1)}%;animation-delay:${(r() * -4).toFixed(2)}s"></i>`
}).join('')}</span>`

// Le soleil et la lune à leur vraie place : l'est à gauche, l'ouest à droite, la hauteur sur 50°. Appelé à chaque
// dessin de la scène et chaque minute ensuite.
export const placerAstres = (racine: ParentNode): void => {
  const ciel = cielActuel()
  if (!ciel) return
  const x = (az: number): number => Math.min(96, Math.max(4, ((az - 60) / 240) * 100))
  const y = (el: number): number => Math.min(80, (el / 50) * 80)
  for (const [classe, astre] of [['soleil', ciel.soleil], ['lune', ciel.lune]] as const) {
    const el = racine.querySelector<HTMLElement>(`.astre.${classe}`)
    if (!el) continue
    el.hidden = astre.elevation < -2
    el.style.left = `${x(astre.azimut)}%`
    el.style.bottom = `calc(8px + ${y(astre.elevation)}%)`
  }
  // La phase : l'ombre couvre la lune du côté encore sombre, de la nouvelle lune (toute) à la pleine (rien).
  const l = racine.querySelector<HTMLElement>('.astre.lune')
  if (l) l.style.setProperty('--ombre', `${(ciel.lune.croissante ? 1 : -1) * Math.round(16 * (1 - ciel.lune.eclairee))}px`)
}

export const scene = (chantiers: Chantier[], quartier: Batiment[]): string => {
  const enCoursIci = chantiersDeLaScene(chantiers)
  const surSaParcelle = new Set(enCoursIci.filter(c => c.finiA !== undefined).map(c => `${c.sessionId}:${c.finiA}`))
  const vusEtages = lireVu<Record<string, number>>(ETAGES_VUS, {})
  const vusBatiments = new Set(lireVu<string[]>(BATIMENTS_VUS, []))
  const p = paletteDuSoleil()
  if (p.cle !== courante.cle) images.clear()
  courante = p

  // La rue : tout le quartier, du plus ancien au plus récent, puis les chantiers en cours ; elle défile à
  // l'horizontale et s'ouvre sur sa fin (animerScene), les plus récents.
  const visibles = quartier.filter(b => !surSaParcelle.has(b.id))
  const premiereVisite = vusBatiments.size === 0
  const rue: Rue = { html: [], x: 10 }
  for (const b of visibles) posBatiment(rue, b, !premiereVisite && !vusBatiments.has(b.id))
  if (!visibles.length && !enCoursIci.length) {
    rue.html.push(ouvrier('resting', rue.x + 20, PIETONS, 0))
    rue.x += 60
  }
  if (enCoursIci.length) rue.x += 14
  const premier = enCoursIci.find(x => !estFini(x))
  for (const c of enCoursIci) posParcelle(rue, c, enCoursIci.length === 1, vusEtages, c === premier)
  const largeur = rue.x + 10
  // Les lampadaires, éteints, et leur lumière par-dessus : elle s'allume au coucher, de gauche à droite (style.css).
  const lampe = image('lampe', P => lampadaire(P, false))
  const lumiere = image('lumiere', P => lampadaire(P, true))
  for (let x = 40, k = 0; x < largeur; x += ENTRE_LAMPES, k++) {
    rue.html.push(img('lampe', lampe, 'lampe', x - PIED_LAMPE - 1, LAMPES))
    rue.html.push(img('lumiere', lumiere, 'lumiere', x - PIED_LAMPE - 1, LAMPES, '', `;--i:${k}`))
  }
  const loin = image('lointain', P => lointain(P))

  const legende = enCoursIci.length
    ? enCoursIci
        .map(c => {
          const etape = enCours(c)

          return `<span class="badge" style="background:${c.couleur}">${echapper(c.session)}</span>
            ${estFini(c) ? 'Terminé' : `${faites(c)}/${c.etapes.length}`}${enCoursIci.length === 1 && !estFini(c) && etape ? ` · ${echapper(etape)}` : ''}`
        })
        .join('<span class="sep" aria-hidden="true"></span>')
    : quartier.length
      ? `Pas de chantier en cours · ${quartier.length} bâtiment${quartier.length > 1 ? 's' : ''} dans le quartier`
      : 'Le quartier attend son premier bâtiment'

  // La scène n'est plus un lien : on y fait glisser la rue du doigt. Le lien vers les chantiers est dans la légende.
  return `
    <section class="scene" aria-label="Le quartier. ${quartier.length} bâtiments finis, ${enCoursIci.length} chantiers en cours">
      <div class="ciel" style="--trottoir:${courante.P.trottoir}">
        ${ETOILES}<span class="astre soleil" aria-hidden="true" hidden></span><span class="astre lune" aria-hidden="true" hidden></span>
        <div class="lointain" data-dessin="lointain" style="background-image:url(${loin.src})" aria-hidden="true"></div>
        <button class="defiler gauche" type="button" data-sens="-1" aria-label="Voir les bâtiments plus anciens" hidden>${CHEVRON}</button>
        <button class="defiler droite" type="button" data-sens="1" aria-label="Revenir aux plus récents" hidden>${CHEVRON}</button>
        <div class="horizon" tabindex="0" aria-label="La rue du quartier, à faire défiler">
          <div class="rue" style="width:${largeur}px">${rue.html.join('')}</div>
        </div>
      </div>
      <p class="legende">${legende}<a class="vers-chantiers" href="#chantiers">Chantiers ›</a></p>
    </section>`
}

// ── Le mur du chef : une case par jour, sur 17 semaines ──────────────────

// Comme sur GitHub : 0, puis quatre paliers d'étapes faites dans la journée.
const niveau = (briques: number): number => (briques === 0 ? 0 : briques <= 2 ? 1 : briques <= 5 ? 2 : briques <= 9 ? 3 : 4)

const lundi = (d: Date): Date => {
  const l = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  l.setDate(l.getDate() - ((l.getDay() + 6) % 7))

  return l
}

const vide = (jour: string): Journee => ({ jour, briques: 0, murs: 0 })

export const murDuChef = (activite: Map<string, Journee>): string => {
  const aujourdhui = new Date()
  const auj = jourDe(aujourdhui.getTime())
  const debut = lundi(aujourdhui)
  debut.setDate(debut.getDate() - 7 * (SEMAINES - 1))
  const cases: string[] = []
  let semaine = vide('')
  for (let i = 0; i < SEMAINES * 7; i++) {
    const d = new Date(debut.getFullYear(), debut.getMonth(), debut.getDate() + i)
    const jour = jourDe(d.getTime())
    if (d > aujourdhui && jour !== auj) {
      cases.push('<span class="case avenir"></span>')
      continue
    }
    const j = activite.get(jour) ?? vide(jour)
    if (i >= (SEMAINES - 1) * 7) semaine = { jour: '', briques: semaine.briques + j.briques, murs: semaine.murs + j.murs }
    cases.push(`<span class="case n${niveau(j.briques)}${jour === auj ? ' aujourdhui' : ''}" data-jour="${jour}" data-briques="${j.briques}"></span>`)
  }

  // La série : les jours d'affilée avec au moins une brique, jusqu'à aujourd'hui (ou hier, la journée commence).
  let serie = 0
  const curseur = new Date(aujourdhui.getFullYear(), aujourdhui.getMonth(), aujourdhui.getDate())
  if (!(activite.get(auj)?.briques ?? 0)) curseur.setDate(curseur.getDate() - 1)
  while ((activite.get(jourDe(curseur.getTime()))?.briques ?? 0) > 0) {
    serie += 1
    curseur.setDate(curseur.getDate() - 1)
  }
  // Les mots du quartier : une étape faite est un étage, un chantier fini un bâtiment (dans la base, « briques » et « murs »).
  const resume = `Cette semaine : ${semaine.briques} étage${semaine.briques > 1 ? 's' : ''} · ${semaine.murs} bâtiment${semaine.murs > 1 ? 's' : ''}${serie > 1 ? ` · série de ${serie} jours` : ''}`

  return `
    <section class="mur-du-chef">
      <div class="grille-jours" role="img" aria-label="Mur du chef, 17 dernières semaines. ${resume}">${cases.join('')}</div>
      <p class="resume"><strong>Mur du chef</strong> · ${resume}</p>
    </section>`
}

// ── Les animations, une fois la page posée ───────────────────────────────

const pulser = (cellule: Element | null): void => {
  cellule?.classList.remove('pulse')
  void (cellule as HTMLElement | null)?.offsetWidth
  cellule?.classList.add('pulse')
}

// Un chantier fini se réduit et vole jusqu'à la case du jour, qui s'éclaire à son arrivée.
const envoler = (source: HTMLElement, cible: HTMLElement): Promise<void> => {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return Promise.resolve(pulser(cible))
  const a = source.getBoundingClientRect()
  const b = cible.getBoundingClientRect()
  const fantome = source.cloneNode(true) as HTMLElement
  fantome.classList.add('envol')
  Object.assign(fantome.style, { left: `${a.left}px`, top: `${a.top}px`, width: `${a.width}px`, height: `${a.height}px` })
  document.body.append(fantome)
  const dx = b.left + b.width / 2 - (a.left + a.width / 2)
  const dy = b.top + b.height / 2 - (a.top + a.height / 2)
  const echelle = b.height / a.height
  const vol = fantome.animate(
    [
      { transform: 'translate(0, 0) scale(1)', opacity: 1 },
      { transform: `translate(${dx * 0.4}px, ${dy * 0.4 - 40}px) scale(0.6)`, opacity: 1, offset: 0.45 },
      { transform: `translate(${dx}px, ${dy}px) scale(${echelle})`, opacity: 0.4 },
    ],
    { duration: 1100, easing: 'cubic-bezier(.5,0,.3,1)' },
  )

  return vol.finished.then(() => {
    fantome.remove()
    pulser(cible)
  })
}

// Les flèches au bord de la rue : elles disent qu'il reste à voir de ce côté, et y mènent d'un toucher.
const brancherDefilement = (racine: HTMLElement): void => {
  const horizon = racine.querySelector<HTMLElement>('.horizon')
  if (!horizon) return
  const fleches = [...racine.querySelectorAll<HTMLButtonElement>('.defiler')]
  const montrer = () => {
    const reste = horizon.scrollWidth - horizon.clientWidth - horizon.scrollLeft
    for (const f of fleches) f.hidden = f.dataset.sens === '-1' ? horizon.scrollLeft < 4 : reste < 4
  }
  for (const f of fleches)
    f.addEventListener('click', () => horizon.scrollBy({ left: Number(f.dataset.sens) * horizon.clientWidth * 0.8, behavior: 'smooth' }))
  horizon.addEventListener('scroll', montrer, { passive: true })
  // La rue s'ouvre sur sa fin : les bâtiments les plus récents et les chantiers en cours.
  horizon.scrollLeft = horizon.scrollWidth
  montrer()
}

// Un étage fait depuis la dernière visite : la grue descend sa palette sur le dernier plancher, puis l'étage paraît
// et l'ouvrier du plancher monte d'un étage. Sans grue (un deuxième chantier), l'étage paraît simplement.
const livrer = async (racine: HTMLElement, p: HTMLElement): Promise<void> => {
  const img = p.querySelector<HTMLImageElement>('img.bat')
  if (!img) return
  const calme = matchMedia('(prefers-reduced-motion: reduce)').matches
  const grue = [...racine.querySelectorAll<HTMLElement>('.livraison')].find(l => l.dataset.session === p.dataset.session)
  if (grue && !calme) {
    grue.classList.add('livre')
    await new Promise(r => setTimeout(r, 1300))
  }
  img.src = image(img.dataset.dessin!).src
  for (const o of p.querySelectorAll<HTMLElement>('[data-pieds-apres]')) o.style.bottom = `${o.dataset.piedsApres}px`
  if (grue && !calme) await new Promise(r => setTimeout(r, 1200))
  grue?.classList.remove('livre')
}

export const animerScene = async (racine: HTMLElement, quartier: Batiment[]): Promise<void> => {
  brancherDefilement(racine)
  const vusEtages = lireVu<Record<string, number>>(ETAGES_VUS, {})
  const envols = lireVu<string[]>(ENVOLS_VUS, [])
  const cible = racine.querySelector<HTMLElement>('.case.aujourdhui')

  // Les briques du jour : la case s'éclaire quand il y en a de nouvelles depuis la dernière visite.
  const jourVu = lireVu<{ jour: string; briques: number }>(JOUR_VU, { jour: '', briques: 0 })
  const briquesDuJour = Number(cible?.dataset.briques ?? 0)
  if (cible && cible.dataset.jour === jourVu.jour && briquesDuJour > jourVu.briques) pulser(cible)
  if (cible) noterVu(JOUR_VU, { jour: cible.dataset.jour, briques: briquesDuJour })

  for (const p of racine.querySelectorAll<HTMLElement>('.parcelle[data-session]')) vusEtages[p.dataset.session!] = Number(p.dataset.construits)
  noterVu(ETAGES_VUS, vusEtages)
  // Tout le quartier connu est désormais « vu » : un bâtiment ne s'élève qu'une fois.
  noterVu(BATIMENTS_VUS, quartier.map(b => b.id).slice(-80))

  await Promise.all([...racine.querySelectorAll<HTMLElement>('.parcelle[data-livrer]')].map(p => livrer(racine, p)))

  for (const p of racine.querySelectorAll<HTMLElement>('.parcelle[data-envol]')) {
    const envol = p.dataset.envol!
    const source = p.querySelector<HTMLElement>('.bat')
    if (envols.includes(envol) || !cible || !source) continue
    noterVu(ENVOLS_VUS, [...envols, envol].slice(-50))
    envols.push(envol)
    // Le temps de voir le bâtiment fini, puis il part.
    await new Promise(r => setTimeout(r, 900))
    await envoler(source, cible)
  }
}

// ── L'écran Chantiers ────────────────────────────────────────────────────

const MARQUES = { completed: 'faite', in_progress: 'en cours', pending: 'à faire' } as const

export const carte = (c: Chantier): string => {
  const total = c.etapes.length
  const pourcent = total ? Math.round((faites(c) / total) * 100) : 0

  return `
    <article class="chantier">
      <div class="meta">
        <span class="badge" style="background:${c.couleur}">${echapper(c.session)}</span>
        <span class="situation">${estFini(c) ? 'Terminé' : `${faites(c)}/${total}`}</span>
        ${horodatage(c.date)}
        <button class="effacer" type="button" data-chantier="${echapper(c.sessionId)}" aria-label="Retirer ce chantier">${CROIX}</button>
      </div>
      <h3>${echapper(c.titre ?? 'Chantier')}</h3>
      <div class="jauge" role="progressbar" aria-valuenow="${pourcent}" aria-valuemin="0" aria-valuemax="100"><span style="width:${pourcent}%"></span></div>
      <ol class="etapes">
        ${c.etapes.map(e => `<li class="${e.statut}"><span class="marque" aria-label="${MARQUES[e.statut]}"></span>${echapper(e.texte)}</li>`).join('')}
      </ol>
    </article>`
}

// Un chevron en pixels, pointé vers la gauche ; la flèche de droite le retourne en CSS.
const CHEVRON = `<svg viewBox="0 0 6 8" width="12" height="16" shape-rendering="crispEdges" fill="currentColor" aria-hidden="true"><rect x="3" y="0" width="2" height="2"/><rect x="1" y="2" width="2" height="2"/><rect x="0" y="3" width="2" height="2"/><rect x="1" y="4" width="2" height="2"/><rect x="3" y="6" width="2" height="2"/></svg>`

export const CROIX =`<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" stroke-width="2" stroke-linecap="square"/></svg>`
