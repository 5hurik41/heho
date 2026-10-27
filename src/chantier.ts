// Les chantiers : la progression de chaque session (le plan de task-steps). En haut de l'historique, le quartier :
// sous le ciel de l'heure (src/soleil.ts), la ligne d'horizon des chantiers finis, un bâtiment chacun, et à droite les chantiers en
// cours, qui montent d'un étage par étape faite. Sous la scène, le mur du chef, une case par jour comme le mur
// d'activité de GitHub. Un chantier fini s'envole vers la case du jour avant de rejoindre l'horizon.
import { enCours, estFini, faites, type Role } from './message'
import { cielActuel } from './soleil'
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

// Un tirage stable par bâtiment : sa largeur, sa couleur, son toit et ses fenêtres allumées ne changent pas d'une
// ouverture à l'autre.
const graine = (texte: string): (() => number) => {
  let h = 2166136261
  for (const c of texte) h = Math.imul(h ^ c.charCodeAt(0), 16777619)

  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507) ^ Math.imul(h ^ (h >>> 13), 3266489909)

    return ((h ^= h >>> 16) >>> 0) / 4294967296
  }
}

// ── Le quartier ──────────────────────────────────────────────────────────

const FACADES = ['#3A3C40', '#34373D', '#2F3237', '#3D3A36']
const TOITS = ['plat', 'antenne', 'citerne', 'pignon'] as const

// `tirage` : 0 à 9 par vitre ; le soleil décide combien de tirages s'allument (reglesLumieres, src/soleil.ts).
type Facade = { largeur: number; fond: string; toit: (typeof TOITS)[number]; colonnes: number; tirage: (etage: number, col: number) => number; scintille: (etage: number, col: number) => boolean }

const facade = (id: string): Facade => {
  const r = graine(id)
  const largeur = [22, 26, 30][Math.floor(r() * 3)]!
  const fond = FACADES[Math.floor(r() * FACADES.length)]!
  const toit = TOITS[Math.floor(r() * TOITS.length)]!
  const tirages = Array.from({ length: ETAGES_MAX * 3 }, () => r())

  return {
    largeur,
    fond,
    toit,
    colonnes: largeur >= 30 ? 3 : 2,
    tirage: (e, c) => Math.floor(tirages[e * 3 + c]! * 10),
    scintille: (e, c) => tirages[e * 3 + c]! < 0.06,
  }
}

const fenetres = (f: Facade, etages: number, construits: number, nouveauxDes: number): string =>
  Array.from({ length: etages }, (_, i) => {
    // Les étages se lisent du haut vers le bas ; i = 0 est le dernier étage.
    const etage = etages - 1 - i
    if (etage >= construits) return `<span class="etage vide"></span>`
    const vitres = Array.from({ length: f.colonnes }, (_, c) =>
      `<i class="l${f.tirage(etage, c)}${f.scintille(etage, c) ? ' scintille' : ''}"></i>`,
    ).join('')

    return `<span class="etage${etage >= nouveauxDes ? ' nouveau' : ''}" style="animation-delay:${(etage - nouveauxDes) * 180}ms">${vitres}</span>`
  }).join('')

// Un bâtiment fini de l'horizon. `neuf` : il vient d'arriver, il s'élève.
const batiment = (b: Batiment, neuf: boolean): string => {
  const f = facade(b.id)
  const etages = Math.min(Math.max(b.etages, 1), ETAGES_MAX)

  return `
    <div class="bat toit-${f.toit}${neuf ? ' neuf' : ''}" style="width:${f.largeur}px;--fond:${f.fond};--badge:${b.couleur}" data-batiment="${echapper(b.id)}" role="button" tabindex="0" aria-haspopup="dialog" aria-label="${echapper(b.session)} · ${echapper(b.titre ?? 'Chantier')}, ${b.etages} étages : voir sa fiche">
      ${fenetres(f, etages, etages, etages)}
    </div>`
}

const ouvrier = (role: Role, i: number): string => `
  <span class="ouvrier">
    <img src="./ouvriers/roles/${role}-0.svg" alt="">
    <img class="image-2" src="./ouvriers/roles/${role}-1.svg" alt="" style="animation-delay:${i * -0.3}s">
  </span>`

// Une parcelle en chantier : le bâtiment monte d'un étage par étape faite, l'échafaudage marque ceux qui restent.
// La grue de la planche (docs/bloc3.html) : sa flèche pivote lentement, son crochet se balance.
const GRUE = `
  <svg class="grue" width="58" height="92" viewBox="0 0 96 150" shape-rendering="crispEdges" aria-hidden="true">
    <rect x="10" y="6" width="6" height="144" fill="#F5C542"/>
    ${[14, 40, 66, 92, 118].map(y => `<rect x="10" y="${y}" width="6" height="2" fill="#B8901F"/>`).join('')}
    <g class="fleche"><rect x="0" y="4" width="92" height="5" fill="#F5C542"/><rect x="0" y="9" width="10" height="6" fill="#5E606A"/>
      <g class="crochet"><rect x="73" y="9" width="1" height="46" fill="#8C8F96"/><rect x="70" y="55" width="8" height="4" fill="#FF7A2F"/><rect x="69" y="59" width="10" height="6" fill="#C9962B"/></g></g>
    <rect x="6" y="0" width="14" height="6" fill="#26282B"/>
  </svg>`

// `grue` : le premier chantier en cours de la scène a la sienne. Toucher un chantier en cours ouvre le mini-jeu.
const parcelle = (c: Chantier, seule: boolean, vus: Record<string, number>, grue: boolean): string => {
  const id = c.finiA !== undefined ? `${c.sessionId}:${c.finiA}` : c.sessionId
  const f = facade(id)
  const total = Math.min(Math.max(c.etapes.length, 1), ETAGES_MAX)
  const construits = Math.min(total, Math.round((faites(c) / Math.max(c.etapes.length, 1)) * total))
  const fini = estFini(c)
  const equipe: Role[] = fini ? ['resting'] : (c.ouvriers.length ? c.ouvriers : (['builder'] as Role[])).slice(0, seule ? 2 : 1)
  const envol = fini && c.finiA !== undefined ? ` data-envol="${echapper(id)}"` : ''

  return `
    <div class="parcelle${fini ? ' fini' : ''}" data-session="${echapper(c.sessionId)}" data-construits="${construits}"${envol}${
      fini ? '' : ` role="button" tabindex="0" aria-haspopup="dialog" aria-label="${echapper(c.session)} en chantier : empiler des briques en attendant"`
    }>
      ${grue && !fini ? GRUE : ''}
      <div class="equipe">${equipe.map(ouvrier).join('')}</div>
      <div class="bat chantier-bat toit-${fini ? f.toit : 'plat'}" style="width:${f.largeur}px;--fond:${f.fond};--badge:${c.couleur}">
        ${fini ? '' : `<span class="fanion" style="background:${c.couleur}"></span>`}
        ${fenetres(f, total, construits, Math.min(vus[c.sessionId] ?? construits, construits))}
      </div>
    </div>`
}

const estFiniRecemment = (c: Chantier): boolean => estFini(c) && c.finiA !== undefined && Date.now() - c.finiA < FINI_MS

export const chantiersDeLaScene = (chantiers: Chantier[]): Chantier[] =>
  chantiers.filter(c => (!estFini(c) && Date.now() - c.date < ACTIF_MS) || estFiniRecemment(c)).slice(0, CHANTIERS_MAX)

// Les étoiles s'effacent avec le jour (--etoiles, src/soleil.ts) ; chacune scintille à son rythme.
const ETOILES = `<span class="etoiles" aria-hidden="true">${Array.from({ length: 14 }, (_, i) => {
  const r = graine(`etoile-${i}`)

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

  // La rue : tout le quartier, du plus ancien au plus récent, puis les chantiers en cours ; elle défile à
  // l'horizontale et s'ouvre sur sa fin (animerScene), les plus récents.
  const visibles = quartier.filter(b => !surSaParcelle.has(b.id))
  const premiereVisite = vusBatiments.size === 0

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
      <div class="ciel">
        ${ETOILES}<span class="astre soleil" aria-hidden="true" hidden></span><span class="astre lune" aria-hidden="true" hidden></span>
        <button class="defiler gauche" type="button" data-sens="-1" aria-label="Voir les bâtiments plus anciens" hidden>${CHEVRON}</button>
        <button class="defiler droite" type="button" data-sens="1" aria-label="Revenir aux plus récents" hidden>${CHEVRON}</button>
        <div class="horizon" tabindex="0" aria-label="La rue du quartier, à faire défiler">
          <div class="rue">
            ${visibles.map(b => batiment(b, !premiereVisite && !vusBatiments.has(b.id))).join('')}
            ${visibles.length || enCoursIci.length ? '' : `<div class="parcelle"><div class="equipe">${ouvrier('resting', 0)}</div></div>`}
            <div class="chantiers">${enCoursIci.map(c => parcelle(c, enCoursIci.length === 1, vusEtages, c === enCoursIci.find(x => !estFini(x)))).join('')}</div>
          </div>
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

  for (const p of racine.querySelectorAll<HTMLElement>('.parcelle[data-envol]')) {
    const envol = p.dataset.envol!
    const source = p.querySelector<HTMLElement>('.bat')
    if (envols.includes(envol) || !cible || !source) continue
    noterVu(ENVOLS_VUS, [...envols, envol].slice(-50))
    envols.push(envol)
    // Le temps de voir le dernier étage s'allumer, puis le bâtiment part.
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
