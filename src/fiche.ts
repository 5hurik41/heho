// Les fiches : toucher un appel ou un bâtiment ouvre sa fiche dans une feuille qui monte du bas (BRIEF.md,
// « Fiches »). C'est un <dialog> : le bouton retour d'Android le ferme, comme un balayage vers le bas.
import { CROIX, echapper } from './chantier'
import { LIBELLES, OUVRIER, TITRES, type Message } from './message'
import { picto } from './pictos'
import type { Batiment } from './stockage'

// Au-delà de ce glissement vers le bas, la feuille se ferme ; en deçà, elle revient en place.
const SEUIL_PX = 90

const exacte = (date: number): string =>
  new Date(date).toLocaleString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })

// Un appel et ses rappels portent le même id, suivi de -0, -1, -2… (le mod notify-worker).
export const racineAppel = (id: string): string => id.replace(/-\d+$/, '')

export const ficheAppel = (m: Message, historique: Message[]): string => {
  const envois = historique.filter(x => racineAppel(x.id) === racineAppel(m.id)).sort((a, b) => a.date - b.date)

  return `
    <div class="fiche-tete">
      <div class="vignette" style="background:${m.couleur}"><img src="./ouvriers/${OUVRIER[m.situation]}.svg" alt="">${picto(m.situation)}</div>
      <div>
        <p class="meta"><span class="badge" style="background:${m.couleur}">${echapper(m.session)}</span><span class="situation">${LIBELLES[m.situation]}</span></p>
        <h2 id="feuille-titre">${TITRES[m.situation]}</h2>
      </div>
    </div>
    <p class="fiche-texte">${echapper(m.texte)}</p>
    <dl class="fiche-faits">
      ${envois
        .map(e => `<div><dt>${e.rappel ? `Rappel ${e.rappel}` : 'Appel'}</dt><dd><time datetime="${new Date(e.date).toISOString()}">${exacte(e.date)}</time></dd></div>`)
        .join('')}
    </dl>`
}

export const ficheBatiment = (b: Batiment): string => `
  <div class="fiche-tete">
    <div>
      <p class="meta"><span class="badge" style="background:${b.couleur}">${echapper(b.session)}</span><span class="situation">${b.etages} étage${b.etages > 1 ? 's' : ''}</span></p>
      <h2 id="feuille-titre">${echapper(b.titre ?? 'Chantier')}</h2>
    </div>
  </div>
  <dl class="fiche-faits"><div><dt>Fini</dt><dd><time datetime="${new Date(b.date).toISOString()}">${exacte(b.date)}</time></dd></div></dl>
  ${
    b.etapes?.length
      ? `<ol class="etapes">${b.etapes.map(t => `<li class="completed"><span class="marque" aria-label="faite"></span>${echapper(t)}</li>`).join('')}</ol>`
      : `<p class="aide">Ses étapes ne sont pas connues : ce bâtiment a été repris du PC.</p>`
  }`

let feuille: HTMLDialogElement | null = null

const creer = (): HTMLDialogElement => {
  const d = document.createElement('dialog')
  d.className = 'feuille'
  d.setAttribute('aria-labelledby', 'feuille-titre')
  d.innerHTML = `
    <div class="poignee" aria-hidden="true"><span></span></div>
    <button class="effacer fermer" type="button" aria-label="Fermer la fiche">${CROIX}</button>
    <div class="feuille-corps"></div>`
  document.body.append(d)
  d.querySelector('.fermer')!.addEventListener('click', () => d.close())
  // Un toucher hors de la feuille, sur le voile, la ferme.
  d.addEventListener('click', e => e.target === d && d.close())

  // Le balayage vers le bas part de la poignée ou de l'en-tête (touch-action: none dans le CSS) : ailleurs, le
  // doigt fait défiler un long texte.
  let depart: number | null = null
  d.addEventListener('pointerdown', e => {
    if ((e.target as Element).closest('.poignee, .fiche-tete')) depart = e.clientY
  })
  d.addEventListener('pointermove', e => {
    if (depart === null) return
    d.style.translate = `0 ${Math.max(0, e.clientY - depart)}px`
  })
  const lacher = (e: PointerEvent) => {
    if (depart === null) return
    const glisse = e.clientY - depart
    depart = null
    d.style.translate = ''
    if (glisse > SEUIL_PX) d.close()
  }
  d.addEventListener('pointerup', lacher)
  d.addEventListener('pointercancel', lacher)

  return d
}

export const ouvrirFeuille = (contenu: string): void => {
  feuille ??= creer()
  feuille.querySelector('.feuille-corps')!.innerHTML = contenu
  feuille.showModal()
}
