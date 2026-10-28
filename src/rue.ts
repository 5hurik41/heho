// La vie dans la rue (BRIEF.md, « La suite », bloc 3 ; planche docs/bloc3.html) : un passant de temps en temps, plus
// rare la nuit ; le livreur quand un appel arrive. Rien quand le téléphone demande moins de mouvement, ni quand
// l'appli est cachée.
import { BOITE } from './equipe'
import type { Role } from './message'

const PASSANTS: Role[] = ['researcher', 'painter', 'thinker', 'mechanic', 'builder', 'mason', 'digger', 'welder']
// Les pieds sur le trottoir, à la ligne des ouvriers de la scène (src/chantier.ts, PIETONS).
const PIETONS = 13
// Entre deux passants, de une à deux minutes.
const ATTENTE_MS: [number, number] = [60_000, 120_000]

const calme = (): boolean => matchMedia('(prefers-reduced-motion: reduce)').matches

// Un marcheur traverse le ciel de la scène au niveau de la rue, puis s'efface.
const traverser = (ciel: HTMLElement, role: Role, duree: number): void => {
  const gauche = Math.random() < 0.5
  const p = document.createElement('span')
  p.className = `passant${gauche ? ' vers-gauche' : ''}`
  p.setAttribute('aria-hidden', 'true')
  p.style.animationDuration = `${duree}s`
  Object.assign(p.style, { width: `${BOITE.largeur}px`, height: `${BOITE.hauteur}px`, bottom: `${PIETONS - (BOITE.hauteur - 1 - BOITE.pieds)}px` })
  p.innerHTML = `<img src="./ouvriers/roles/${role}-0.svg" alt=""><img class="image-2" src="./ouvriers/roles/${role}-1.svg" alt="">`
  p.addEventListener('animationend', () => p.remove(), { once: true })
  ciel.append(p)
}

let minuteur: ReturnType<typeof setTimeout> | undefined

// Lance les passants dans la scène affichée ; un nouvel appel remplace l'ancien minuteur.
export const animerRue = (racine: ParentNode): void => {
  clearTimeout(minuteur)
  const suivant = (): void => {
    const [a, b] = ATTENTE_MS
    minuteur = setTimeout(() => {
      const ciel = racine.querySelector<HTMLElement>('.ciel')
      if (!ciel?.isConnected) return
      // La nuit (les étoiles sont là), un passant sur trois seulement.
      const nuit = Number(getComputedStyle(document.documentElement).getPropertyValue('--etoiles')) > 0.5
      if (!calme() && document.visibilityState === 'visible' && (!nuit || Math.random() < 0.33))
        traverser(ciel, PASSANTS[Math.floor(Math.random() * PASSANTS.length)]!, 18 + Math.random() * 8)
      suivant()
    }, a + Math.random() * (b - a))
  }
  suivant()
}

// Un appel vient d'arriver : le livreur (le coursier) passe, plus vite qu'un promeneur.
export const livrer = (racine: ParentNode): void => {
  const ciel = racine.querySelector<HTMLElement>('.ciel')
  if (ciel && !calme()) traverser(ciel, 'courier', 11)
}
