// Les chantiers : la progression de chaque session (le plan de task-steps). En haut de l'historique, une scène où
// les ouvriers montent un mur par session, brique par brique ; sous elle, le mur du chef, une case par jour
// comme le mur d'activité de GitHub, qui s'éclaire avec les étapes faites. Un mur fini s'envole vers la case du jour.
import { enCours, estFini, faites, type Role } from './message'
import { jourDe, type Chantier, type Journee } from './stockage'

// Au-delà, un chantier non terminé est considéré comme abandonné : la scène ne le montre plus.
const ACTIF_MS = 2 * 3600_000
// Un mur fini reste sur la scène, ouvriers au café, avant de céder la place.
const FINI_MS = 10 * 60_000
const POSTES_MAX = 3
const RANGS = 6
const BRIQUES_PAR_RANG = 7
const SEMAINES = 17

export const echapper = (s: string): string =>
  s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

export const ilYa = (date: number): string => {
  const min = Math.round((Date.now() - date) / 60_000)
  if (min < 1) return "à l'instant"
  if (min < 60) return `il y a ${min} min`
  const h = Math.floor(min / 60)

  return h < 24 ? `il y a ${h} h` : new Date(date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
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
const BRIQUES_VUES = 'heho-briques-vues'
const ENVOLS_VUS = 'heho-envols-vus'
const JOUR_VU = 'heho-jour-vu'

// ── La scène ─────────────────────────────────────────────────────────────

const estFiniRecemment = (c: Chantier): boolean => estFini(c) && c.finiA !== undefined && Date.now() - c.finiA < FINI_MS

export const postesDeLaScene = (chantiers: Chantier[]): Chantier[] =>
  chantiers.filter(c => (!estFini(c) && Date.now() - c.date < ACTIF_MS) || estFiniRecemment(c)).slice(0, POSTES_MAX)

const ouvrier = (role: Role, i: number): string => `
  <span class="ouvrier">
    <img src="./ouvriers/roles/${role}-0.svg" alt="">
    <img class="image-2" src="./ouvriers/roles/${role}-1.svg" alt="" style="animation-delay:${i * -0.3}s">
  </span>`

// Le mur se monte par le bas, de gauche à droite. Les briques posées depuis la dernière visite tombent en place.
const mur = (posees: number, dejaVues: number): string => {
  const total = RANGS * BRIQUES_PAR_RANG
  const briques = Array.from({ length: total }, (_, i) => {
    const rang = Math.floor(i / BRIQUES_PAR_RANG)
    const n = (RANGS - 1 - rang) * BRIQUES_PAR_RANG + (i % BRIQUES_PAR_RANG)
    if (n >= posees) return '<span class="brique"></span>'
    if (n < dejaVues) return '<span class="brique posee"></span>'

    return `<span class="brique posee nouvelle" style="animation-delay:${(n - dejaVues) * 70}ms"></span>`
  })

  return `<div class="mur" aria-hidden="true">${briques.join('')}</div>`
}

const poste = (c: Chantier, seul: boolean, vues: Record<string, number>): string => {
  const total = c.etapes.length
  const posees = total ? Math.round((faites(c) / total) * RANGS * BRIQUES_PAR_RANG) : 0
  const fini = estFini(c)
  const equipe: Role[] = fini ? ['resting'] : (c.ouvriers.length ? c.ouvriers : (['builder'] as Role[])).slice(0, seul ? 3 : 1)
  const etape = enCours(c)
  const envol = fini && c.finiA !== undefined ? `${c.sessionId}:${c.finiA}` : ''

  return `
    <div class="poste${fini ? ' fini' : ''}" data-session="${echapper(c.sessionId)}" data-posees="${posees}"${envol ? ` data-envol="${echapper(envol)}"` : ''}>
      <div class="ouvrage">
        <div class="equipe">${equipe.map(ouvrier).join('')}</div>
        <div class="pile"><span class="fanion" style="background:${c.couleur}"></span>${mur(posees, Math.min(vues[c.sessionId] ?? posees, posees))}</div>
      </div>
      <p class="legende"><span class="badge" style="background:${c.couleur}">${echapper(c.session)}</span>
        ${fini ? 'Terminé' : `${faites(c)}/${total}`}${!fini && seul && etape ? ` · ${echapper(etape)}` : ''}</p>
    </div>`
}

export const scene = (chantiers: Chantier[]): string => {
  const postes = postesDeLaScene(chantiers)
  const vues = lireVu<Record<string, number>>(BRIQUES_VUES, {})
  const contenu = postes.length
    ? postes.map(c => poste(c, postes.length === 1, vues)).join('')
    : `<div class="poste"><div class="ouvrage"><div class="equipe">${ouvrier('resting', 0)}</div></div>
         <p class="legende">Pas de chantier en cours</p></div>`

  return `<a class="scene${postes.length > 1 ? ' plusieurs' : ''}" href="#chantiers" aria-label="Chantiers en cours"><div class="postes">${contenu}</div></a>`
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
  const resume = `Cette semaine : ${semaine.briques} brique${semaine.briques > 1 ? 's' : ''} · ${semaine.murs} mur${semaine.murs > 1 ? 's' : ''} fini${semaine.murs > 1 ? 's' : ''}${serie > 1 ? ` · série de ${serie} jours` : ''}`

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

// Un mur fini se réduit et vole jusqu'à la case du jour, qui s'éclaire à son arrivée.
const envoler = (poste: HTMLElement, cible: HTMLElement): Promise<void> => {
  const source = poste.querySelector<HTMLElement>('.mur')
  if (!source || matchMedia('(prefers-reduced-motion: reduce)').matches) return Promise.resolve(pulser(cible))
  const a = source.getBoundingClientRect()
  const b = cible.getBoundingClientRect()
  const fantome = source.cloneNode(true) as HTMLElement
  fantome.classList.add('envol')
  Object.assign(fantome.style, { left: `${a.left}px`, top: `${a.top}px`, width: `${a.width}px` })
  document.body.append(fantome)
  const dx = b.left + b.width / 2 - (a.left + a.width / 2)
  const dy = b.top + b.height / 2 - (a.top + a.height / 2)
  const echelle = b.width / a.width
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

export const animerScene = async (racine: HTMLElement): Promise<void> => {
  const vues = lireVu<Record<string, number>>(BRIQUES_VUES, {})
  const envols = lireVu<string[]>(ENVOLS_VUS, [])
  const cible = racine.querySelector<HTMLElement>('.case.aujourdhui')

  // Les briques du jour : la case s'éclaire quand il y en a de nouvelles depuis la dernière visite.
  const jourVu = lireVu<{ jour: string; briques: number }>(JOUR_VU, { jour: '', briques: 0 })
  const briquesDuJour = Number(cible?.dataset.briques ?? 0)
  if (cible && cible.dataset.jour === jourVu.jour && briquesDuJour > jourVu.briques) pulser(cible)
  if (cible) noterVu(JOUR_VU, { jour: cible.dataset.jour, briques: briquesDuJour })

  for (const p of racine.querySelectorAll<HTMLElement>('.poste[data-session]')) vues[p.dataset.session!] = Number(p.dataset.posees)
  noterVu(BRIQUES_VUES, vues)

  for (const p of racine.querySelectorAll<HTMLElement>('.poste[data-envol]')) {
    const envol = p.dataset.envol!
    if (envols.includes(envol) || !cible) continue
    noterVu(ENVOLS_VUS, [...envols, envol].slice(-50))
    envols.push(envol)
    // Le temps de voir la dernière brique tomber, puis le mur part.
    await new Promise(r => setTimeout(r, 900))
    await envoler(p, cible)
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
        <span class="heure">${ilYa(c.date)}</span>
        <button class="effacer" type="button" data-chantier="${echapper(c.sessionId)}" aria-label="Retirer ce chantier">${CROIX}</button>
      </div>
      <h3>${echapper(c.titre ?? 'Chantier')}</h3>
      <div class="jauge" role="progressbar" aria-valuenow="${pourcent}" aria-valuemin="0" aria-valuemax="100"><span style="width:${pourcent}%"></span></div>
      <ol class="etapes">
        ${c.etapes.map(e => `<li class="${e.statut}"><span class="marque" aria-label="${MARQUES[e.statut]}"></span>${echapper(e.texte)}</li>`).join('')}
      </ol>
    </article>`
}

export const CROIX = `<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" stroke-width="2" stroke-linecap="square"/></svg>`
