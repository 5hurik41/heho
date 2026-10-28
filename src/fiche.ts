// Les fiches : toucher un appel ou un bâtiment ouvre sa fiche dans une feuille qui monte du bas (BRIEF.md,
// « Fiches »). C'est un <dialog> : le bouton retour d'Android le ferme, comme un balayage vers le bas.
import { CROIX, echapper, planDuBatiment } from './chantier'
import { MEDAILLES, svgMedaille, type Medaille } from './medailles'
import { appelDe, LIBELLES, OUVRIER, TITRES, type Message } from './message'
import { picto } from './pictos'
import { decrire } from './pixels'
import type { Batiment } from './stockage'

// Au-delà de ce glissement vers le bas, la feuille se ferme ; en deçà, elle revient en place.
const SEUIL_PX = 90

const exacte = (date: number): string =>
  new Date(date).toLocaleString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })

// Un appel et ses rappels portent le même id, suivi de -0, -1, -2… (le mod notify-worker).
export const racineAppel = (id: string): string => appelDe({ id })

// Les questions d'un appel et leurs options (BRIEF.md, « Options dans la fiche ») : de quoi choisir avant de revenir
// au PC. Une question unique qui redit le texte de l'appel ne montre que ses options ; l'option recommandée ressort.
export const questionsAppel = (m: Message): string =>
  m.questions?.length
    ? `<div class="questions">${m.questions
        .map(
          q => `
          <div class="question">
            ${m.questions!.length > 1 || q.texte !== m.texte ? `<p>${echapper(q.texte)}</p>` : ''}
            ${q.options.length ? `<ul class="options">${q.options.map(o => `<li${/recommand/i.test(o) ? ' class="recommandee"' : ''}>${echapper(o)}</li>`).join('')}</ul>` : ''}
          </div>`,
        )
        .join('')}</div>`
    : ''

// `ouvert` : l'appel attend encore la personne ; un bouton permet de le dire réglé, ici seulement (une session sans
// plan ne renvoie rien quand on lui répond).
export const ficheAppel = (m: Message, historique: Message[], ouvert = false): string => {
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
    ${questionsAppel(m)}
    <dl class="fiche-faits">
      ${envois
        .map(e => `<div><dt>${e.rappel ? `Rappel ${e.rappel}` : 'Appel'}</dt><dd><time datetime="${new Date(e.date).toISOString()}">${exacte(e.date)}</time></dd></div>`)
        .join('')}
    </dl>
    ${
      ouvert
        ? `<button class="bouton second" type="button" id="regle">C'est réglé</button>
           <p class="aide">Retire l'appel de « À toi » sur ce téléphone. Rien ne part vers le PC.</p>`
        : ''
    }`
}

// Le bâtiment décrit d'après son ADN (BRIEF.md, « Vie du quartier ») : sa façade, sa boutique, ses accessoires.
const portrait = (b: Batiment): string => {
  const { titre, details } = decrire(planDuBatiment(b))

  return `<p class="portrait"><strong>${echapper(titre)}</strong>${details.length ? ` · ${echapper(details.join(', '))}` : ''}</p>`
}

export const ficheBatiment = (b: Batiment): string => `
  <div class="fiche-tete">
    <div>
      <p class="meta"><span class="badge" style="background:${b.couleur}">${echapper(b.session)}</span><span class="situation">${b.etages} étage${b.etages > 1 ? 's' : ''}</span></p>
      <h2 id="feuille-titre">${echapper(b.titre ?? 'Chantier')}</h2>
    </div>
  </div>
  <dl class="fiche-faits"><div><dt>Fini</dt><dd><time datetime="${new Date(b.date).toISOString()}">${exacte(b.date)}</time></dd></div></dl>
  ${portrait(b)}
  ${
    b.etapes?.length
      ? `<ol class="etapes">${b.etapes.map(t => `<li class="completed"><span class="marque" aria-label="faite"></span>${echapper(t)}</li>`).join('')}</ol>`
      : `<p class="aide">Ses étapes ne sont pas connues : ce bâtiment a été repris du PC.</p>`
  }`

// ── Les médailles : la vitrine sous le mur du chef, et la fiche de chacune ──

export const vitrine = (obtenues: Map<string, number>): string => `
  <section class="vitrine" aria-label="Médailles">
    <h3>Médailles · ${obtenues.size}/${MEDAILLES.length}</h3>
    <div class="medailles">
      ${MEDAILLES.map(
        m => `<button class="medaille${obtenues.has(m.id) ? '' : ' fermee'}" type="button" data-medaille="${m.id}" aria-haspopup="dialog" aria-label="${echapper(m.titre)}${obtenues.has(m.id) ? '' : ', pas encore gagnée'}">${svgMedaille(m, obtenues.has(m.id))}</button>`,
      ).join('')}
    </div>
  </section>`

export const ficheMedaille = (m: Medaille, date: number | undefined): string => `
  <div class="fiche-tete">
    <div class="grande-medaille">${svgMedaille(m, date !== undefined)}</div>
    <div>
      <p class="meta"><span class="situation">${date !== undefined ? 'Gagnée' : 'Pas encore'}</span></p>
      <h2 id="feuille-titre">${echapper(m.titre)}</h2>
    </div>
  </div>
  <p class="fiche-texte">${echapper(m.texte)}.</p>
  ${date !== undefined ? `<dl class="fiche-faits"><div><dt>Gagnée</dt><dd><time datetime="${new Date(date).toISOString()}">${exacte(date)}</time></dd></div></dl>` : ''}`

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

// Ouvre la feuille sur ce contenu et rend son corps, pour y brancher des boutons ; `aLaFermeture` est appelé une
// fois, quelle que soit la façon de la fermer.
export const ouvrirFeuille = (contenu: string, aLaFermeture?: () => void): HTMLElement => {
  feuille ??= creer()
  const corps = feuille.querySelector<HTMLElement>('.feuille-corps')!
  corps.innerHTML = contenu
  if (aLaFermeture) feuille.addEventListener('close', aLaFermeture, { once: true })
  feuille.showModal()

  return corps
}

export const fermerFeuille = (): void => feuille?.close()
