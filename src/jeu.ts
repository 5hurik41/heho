// Le mini-jeu (BRIEF.md, « Mini-jeu » ; planche docs/bloc3.html) : la brique glisse, un toucher la pose, ce qui
// dépasse tombe. Il s'ouvre en touchant un chantier en cours et annonce la fin de ce chantier. Les règles (nouvellePartie,
// avancer, poser) ne dessinent rien, pour être testées ; le dessin suit.
import { echapper } from './chantier'
import { ouvrirFeuille } from './fiche'
import type { Chantier } from './stockage'

export const LARGEUR = 300
const BRIQUE_MAX = 180
// À moins de PARFAIT pixels de la brique du dessous, la pose est parfaite : elle s'aligne et regagne un peu de largeur.
const PARFAIT = 4
const BONUS = 6

export type Brique = { x: number; l: number }
export type Partie = { pile: Brique[]; courante: Brique & { v: number }; finie: boolean }

const lancer = (pile: Brique[]): Partie['courante'] => {
  const dessous = pile[pile.length - 1]!
  const versLaDroite = pile.length % 2 === 1
  // Un peu plus vite à chaque étage, jusqu'à un plafond.
  const vitesse = Math.min(5.5, 2 + pile.length * 0.12)

  return { x: versLaDroite ? -dessous.l : LARGEUR, l: dessous.l, v: versLaDroite ? vitesse : -vitesse }
}

export const nouvellePartie = (): Partie => {
  const pile = [{ x: (LARGEUR - BRIQUE_MAX) / 2, l: BRIQUE_MAX }]

  return { pile, courante: lancer(pile), finie: false }
}

export const etages = (p: Partie): number => p.pile.length - 1

// La brique courante glisse et rebondit sur les bords.
export const avancer = (p: Partie, pas = 1): void => {
  const c = p.courante
  c.x += c.v * pas
  if ((c.v > 0 && c.x + c.l * 0.4 > LARGEUR) || (c.v < 0 && c.x < -c.l * 0.6)) c.v = -c.v
}

// Pose la brique : ce qui dépasse tombe (rendu pour l'animation), une pose ratée finit la partie.
export const poser = (p: Partie): { resultat: 'parfaite' | 'posee' | 'ratee'; chute: Brique | null } => {
  const dessous = p.pile[p.pile.length - 1]!
  const c = p.courante
  const gauche = Math.max(c.x, dessous.x)
  const droite = Math.min(c.x + c.l, dessous.x + dessous.l)
  if (droite - gauche <= 0) {
    p.finie = true

    return { resultat: 'ratee', chute: { x: c.x, l: c.l } }
  }
  if (Math.abs(c.x - dessous.x) < PARFAIT) {
    p.pile.push({ x: dessous.x, l: Math.min(BRIQUE_MAX, dessous.l + BONUS) })
    p.courante = lancer(p.pile)

    return { resultat: 'parfaite', chute: null }
  }
  p.pile.push({ x: gauche, l: droite - gauche })
  const chute = c.x < dessous.x ? { x: c.x, l: dessous.x - c.x } : { x: droite, l: c.x + c.l - droite }
  p.courante = lancer(p.pile)

  return { resultat: 'posee', chute }
}

// ── Le record, gardé sur ce téléphone (facultatif : sans stockage, il dure le temps de l'ouverture) ──

const CLE_RECORD = 'heho-record'
let recordEnMemoire = 0
const lireRecord = (): number => {
  try {
    return Math.max(recordEnMemoire, Number(localStorage.getItem(CLE_RECORD)) || 0)
  } catch {
    return recordEnMemoire
  }
}
const noterRecord = (n: number): void => {
  recordEnMemoire = Math.max(recordEnMemoire, n)
  try {
    localStorage.setItem(CLE_RECORD, String(recordEnMemoire))
  } catch {
    // Le record restera en mémoire.
  }
}

// ── Le dessin ────────────────────────────────────────────────────────────

const HAUTEUR = 440
const HB = 22
const SOL = 40

let enCours: { sessionId: string; finir: () => void } | null = null

// Le chantier du jeu ouvert vient de finir : un mot, et la partie s'arrête là.
export const chantierFini = (sessionId: string): void => {
  if (enCours?.sessionId === sessionId) enCours.finir()
}

export const ouvrirJeu = (c: Chantier): void => {
  let boucle = 0
  const corps = ouvrirFeuille(
    `
    <h2 id="feuille-titre">En attendant ${echapper(c.session)}</h2>
    <p class="aide">Touche pour poser la brique. Ce qui dépasse tombe.</p>
    <canvas class="jeu" width="${LARGEUR}" height="${HAUTEUR}" aria-label="Pile de briques : toucher pour poser"></canvas>`,
    () => {
      cancelAnimationFrame(boucle)
      enCours = null
    },
  )
  const toile = corps.querySelector<HTMLCanvasElement>('canvas')!
  // Net sur un écran à forte densité : la toile compte en pixels de l'écran, le dessin en pixels CSS.
  const dpr = Math.min(3, devicePixelRatio || 1)
  toile.width = LARGEUR * dpr
  toile.height = HAUTEUR * dpr
  const cx = toile.getContext('2d')!
  cx.scale(dpr, dpr)
  cx.imageSmoothingEnabled = false

  const css = getComputedStyle(document.documentElement)
  const couleur = (nom: string, defaut: string): string => css.getPropertyValue(nom).trim() || defaut
  const ouvrier = new Image()
  ouvrier.src = `./ouvriers/roles/${c.ouvriers[0] ?? 'builder'}-0.svg`

  let partie = nouvellePartie()
  let chutes: (Brique & { y: number; vy: number; etage: number })[] = []
  let eclat = 0
  let decalage = 0
  let annonce: string | null = null
  let avant = performance.now()

  const yDe = (i: number): number => HAUTEUR - SOL - (i + 1) * HB + decalage
  const brique = (x: number, y: number, l: number, teinte: string): void => {
    cx.fillStyle = teinte
    cx.fillRect(Math.round(x), Math.round(y), Math.round(l), HB - 2)
    cx.fillStyle = 'rgba(0,0,0,.22)'
    cx.fillRect(Math.round(x), Math.round(y) + HB - 6, Math.round(l), 4)
    cx.fillStyle = 'rgba(255,255,255,.25)'
    cx.fillRect(Math.round(x), Math.round(y), Math.round(l), 2)
  }
  const teinteDe = (i: number): string => (i === 0 ? '#5E606A' : i % 2 ? c.couleur : '#F5C542')

  const toucher = (): void => {
    if (annonce) return
    if (partie.finie) {
      partie = nouvellePartie()
      chutes = []
      return
    }
    const { resultat, chute } = poser(partie)
    if (chute) chutes.push({ ...chute, y: 0, vy: 0, etage: resultat === 'ratee' ? partie.pile.length : partie.pile.length - 1 })
    if (resultat === 'parfaite') eclat = 1
    if (resultat === 'ratee') noterRecord(etages(partie))
  }
  toile.addEventListener('pointerdown', toucher)
  toile.tabIndex = 0
  toile.addEventListener('keydown', e => (e.key === ' ' || e.key === 'Enter') && (e.preventDefault(), toucher()))

  const dessiner = (maintenant: number): void => {
    // Le jeu avance au même rythme quel que soit l'écran (60 images par seconde de référence).
    const pas = Math.min(3, (maintenant - avant) / (1000 / 60))
    avant = maintenant
    const ciel = cx.createLinearGradient(0, 0, 0, HAUTEUR)
    ciel.addColorStop(0, couleur('--ciel-haut', '#07080C'))
    ciel.addColorStop(1, couleur('--ciel-bas', '#15182A'))
    cx.fillStyle = ciel
    cx.fillRect(0, 0, LARGEUR, HAUTEUR)
    decalage += (Math.max(0, (partie.pile.length - 10) * HB) - decalage) * 0.1
    partie.pile.forEach((b, i) => brique(b.x, yDe(i), b.l, teinteDe(i)))
    if (!partie.finie && !annonce) {
      avancer(partie, pas)
      brique(partie.courante.x, yDe(partie.pile.length), partie.courante.l, teinteDe(partie.pile.length))
    }
    for (const ch of chutes) {
      ch.vy += 0.5 * pas
      ch.y += ch.vy * pas
      brique(ch.x, yDe(ch.etage) + ch.y, ch.l, '#8C8F96')
    }
    chutes = chutes.filter(ch => ch.y < HAUTEUR)
    if (eclat > 0) {
      const b = partie.pile[partie.pile.length - 1]!
      cx.fillStyle = `rgba(245,197,66,${eclat})`
      cx.fillRect(b.x - 6, yDe(partie.pile.length - 1) - 6, b.l + 12, HB + 10)
      eclat -= 0.06 * pas
    }
    // La route, et l'ouvrier du chantier qui regarde monter la pile.
    cx.fillStyle = '#1B1C1E'
    cx.fillRect(0, HAUTEUR - SOL + decalage, LARGEUR, SOL + 400)
    cx.fillStyle = '#F5C542'
    for (let x = 0; x < LARGEUR; x += 24) cx.fillRect(x, HAUTEUR - SOL + 6 + decalage, 12, 2)
    if (ouvrier.complete) cx.drawImage(ouvrier, LARGEUR - 56, HAUTEUR - SOL + decalage - 44, 44, 44)
    // Le compte, sur un cartouche sombre pour rester lisible sous un ciel de jour.
    cx.fillStyle = 'rgba(17,18,20,.75)'
    cx.fillRect(8, 10, 150, 60)
    cx.fillStyle = '#EDEAE0'
    cx.font = '34px "Jersey 10", monospace'
    cx.fillText(`${etages(partie)} étage${etages(partie) > 1 ? 's' : ''}`, 16, 42)
    cx.fillStyle = '#B9B6AC'
    cx.font = '18px "Jersey 10", monospace'
    cx.fillText(`Record : ${Math.max(lireRecord(), etages(partie))}`, 16, 62)
    const bandeau = annonce ?? (partie.finie ? 'Hé, ho ! Raté.' : null)
    if (bandeau) {
      cx.fillStyle = 'rgba(11,12,16,.8)'
      cx.fillRect(0, 170, LARGEUR, 110)
      cx.fillStyle = '#F5C542'
      cx.font = '36px "Jersey 10", monospace'
      cx.textAlign = 'center'
      cx.fillText(bandeau, LARGEUR / 2, 220)
      cx.font = '20px "Jersey 10", monospace'
      cx.fillStyle = '#EDEAE0'
      cx.fillText(annonce ? 'Claude a fini : retour au chantier.' : 'Toucher pour rebâtir', LARGEUR / 2, 255)
      cx.textAlign = 'start'
    }
    boucle = requestAnimationFrame(dessiner)
  }
  boucle = requestAnimationFrame(dessiner)
  toile.focus()

  enCours = {
    sessionId: c.sessionId,
    finir: () => {
      noterRecord(etages(partie))
      annonce = 'Chantier fini !'
    },
  }
}
