// Les chantiers : la progression de chaque session (le plan de task-steps), et la petite scène où les ouvriers
// au travail montent un mur qui grandit avec les étapes faites.
import { enCours, estFini, faites, type Progression, type Role } from './message'

// Au-delà, un chantier non terminé est considéré comme abandonné : la scène ne le montre plus.
const ACTIF_MS = 2 * 3600_000
const RANGS = 6
const BRIQUES_PAR_RANG = 7

export const echapper = (s: string): string =>
  s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

export const ilYa = (date: number): string => {
  const min = Math.round((Date.now() - date) / 60_000)
  if (min < 1) return "à l'instant"
  if (min < 60) return `il y a ${min} min`
  const h = Math.floor(min / 60)

  return h < 24 ? `il y a ${h} h` : new Date(date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

export const chantierActif = (chantiers: Progression[]): Progression | undefined =>
  chantiers.find(p => !estFini(p) && Date.now() - p.date < ACTIF_MS)

const ouvrier = (role: Role, i: number): string => `
  <span class="ouvrier" style="animation-delay:${i * -0.3}s">
    <img src="./ouvriers/roles/${role}-0.svg" alt="">
    <img class="image-2" src="./ouvriers/roles/${role}-1.svg" alt="" style="animation-delay:${i * -0.3}s">
  </span>`

// Le mur se monte par le bas : les briques posées sont celles des derniers rangs, puis de gauche à droite.
const mur = (ratio: number): string => {
  const total = RANGS * BRIQUES_PAR_RANG
  const posees = Math.round(ratio * total)
  const briques = Array.from({ length: total }, (_, i) => {
    const depuisLeBas = (RANGS - 1 - Math.floor(i / BRIQUES_PAR_RANG)) * BRIQUES_PAR_RANG + (i % BRIQUES_PAR_RANG)

    return `<span class="brique${depuisLeBas < posees ? ' posee' : ''}"></span>`
  })

  return `<div class="mur" aria-hidden="true">${briques.join('')}</div>`
}

// La scène, en haut de l'historique : le chantier en cours le plus récent, ou l'ouvrier au café.
export const scene = (actif: Progression | undefined): string => {
  if (!actif)
    return `
      <a class="scene" href="#chantiers">
        <div class="equipe">${ouvrier('resting', 0)}</div>
        ${mur(0)}
        <p class="legende">Pas de chantier en cours</p>
      </a>`
  const total = actif.etapes.length
  const equipe = (actif.ouvriers.length ? actif.ouvriers : (['builder'] as Role[])).slice(0, 3)
  const etape = enCours(actif)

  return `
    <a class="scene" href="#chantiers" aria-label="${echapper(actif.session)} : ${faites(actif)} étapes faites sur ${total}">
      <div class="equipe">${equipe.map(ouvrier).join('')}</div>
      ${mur(total ? faites(actif) / total : 0)}
      <p class="legende"><span class="badge" style="background:${actif.couleur}">${echapper(actif.session)}</span>
        ${faites(actif)}/${total}${etape ? ` · ${echapper(etape)}` : ''}</p>
    </a>`
}

const MARQUES = { completed: 'faite', in_progress: 'en cours', pending: 'à faire' } as const

export const carte = (p: Progression): string => {
  const total = p.etapes.length
  const pourcent = total ? Math.round((faites(p) / total) * 100) : 0

  return `
    <article class="chantier">
      <div class="meta">
        <span class="badge" style="background:${p.couleur}">${echapper(p.session)}</span>
        <span class="situation">${estFini(p) ? 'Terminé' : `${faites(p)}/${total}`}</span>
        <span class="heure">${ilYa(p.date)}</span>
        <button class="effacer" type="button" data-chantier="${echapper(p.sessionId)}" aria-label="Retirer ce chantier">${CROIX}</button>
      </div>
      <h3>${echapper(p.titre ?? 'Chantier')}</h3>
      <div class="jauge" role="progressbar" aria-valuenow="${pourcent}" aria-valuemin="0" aria-valuemax="100"><span style="width:${pourcent}%"></span></div>
      <ol class="etapes">
        ${p.etapes.map(e => `<li class="${e.statut}"><span class="marque" aria-label="${MARQUES[e.statut]}"></span>${echapper(e.texte)}</li>`).join('')}
      </ol>
    </article>`
}

export const CROIX = `<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" stroke-width="2" stroke-linecap="square"/></svg>`
