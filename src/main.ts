// L'appli : association avec le PC, chantiers, historique, réglages. Des écrans choisis par l'adresse (#…).
import '@fontsource/jersey-10'
import '@fontsource/atkinson-hyperlegible-next/400.css'
import '@fontsource/atkinson-hyperlegible-next/700.css'
import './style.css'
import { animerScene, carte, CROIX, echapper, horodatage, murDuChef, placerAstres, rafraichirHeures, scene } from './chantier'
import { appliquer, BASCULE, cielActuel, ecrireVille, lireVille, reglesLumieres, VILLES, type Ville } from './soleil'
import { CLE_PUBLIQUE_VAPID } from './config'
import { fermerFeuille, ficheAppel, ficheBatiment, ficheMedaille, ouvrirFeuille, vitrine } from './fiche'
import { MEDAILLES } from './medailles'
import { filtrer, pastilles, type Filtres } from './filtres'
import { ecranForfait } from './forfait'
import { ATTENTES, estFini, LIBELLES, OUVRIER, REGLABLES, TITRES, type Message, type Situation } from './message'
import { chantierFini, ouvrirJeu } from './jeu'
import { picto } from './pictos'
import { dire, peutRepondre, repondre, type Contenu } from './reponse'
import { animerRue, livrer } from './rue'
import {
  ecrireReglage,
  effacerChantier,
  effacerMessage,
  lireActivite,
  lireChantiers,
  decernerMedailles,
  lireBoite,
  lireErreur,
  lireForfaitGarde,
  lireMedailles,
  lireHistorique,
  lireQuartier,
  lireReglage,
  nettoyer,
  viderHistorique,
  type Reglable,
} from './stockage'

// L'heure du build, écrite par vite.config.ts : Réglages la montre, pour savoir quelle version tourne.
declare const __CONSTRUIT__: string

const ecran = document.querySelector<HTMLElement>('#ecran')!

// Les couleurs du soleil avant le premier affichage, et les règles des fenêtres allumées.
document.head.insertAdjacentHTML('beforeend', `<style>${reglesLumieres()}</style>`)
appliquer()
const nav = document.querySelector<HTMLElement>('#nav')!
const etat = document.querySelector<HTMLElement>('#etat')!

const base64url = (b: Uint8Array): string =>
  btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

const depuisBase64url = (s: string): Uint8Array =>
  Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0))

const enregistrement = async (): Promise<ServiceWorkerRegistration | null> => {
  if (!('serviceWorker' in navigator) || import.meta.env.DEV) return null
  await navigator.serviceWorker.register('./sw.js', { type: 'module' })

  return navigator.serviceWorker.ready
}

// Le code que le PC enregistre une fois pour toutes : l'abonnement push, en base64url.
const codeAssociation = (abo: PushSubscription): string => base64url(new TextEncoder().encode(JSON.stringify(abo.toJSON())))

const abonnementActuel = async (): Promise<PushSubscription | null> =>
  (await (await enregistrement())?.pushManager.getSubscription()) ?? null

// ── Accueil et association ───────────────────────────────────────────────

const accueil = async (): Promise<void> => {
  const abo = await abonnementActuel()
  if (abo) return montrerCode(abo)
  ecran.innerHTML = `
    <h1>Hé, ho !</h1>
    <p>Hého t'appelle quand une session Claude Code a besoin de toi, ou a fini. Le téléphone ne fait que recevoir.</p>
    <button class="bouton" id="activer" type="button">Activer les notifications</button>
    <p class="aide" id="message" role="status"></p>`
  const message = ecran.querySelector<HTMLElement>('#message')!
  ecran.querySelector('#activer')!.addEventListener('click', async () => {
    if (!CLE_PUBLIQUE_VAPID) return void (message.textContent = 'La clé du PC manque encore dans src/config.ts.')
    if ((await Notification.requestPermission()) !== 'granted')
      return void (message.textContent = 'Les notifications sont refusées : autorise-les dans les réglages de Chrome.')
    const reg = await enregistrement()
    if (!reg) return void (message.textContent = 'Ce navigateur ne gère pas les notifications push.')
    const nouvel = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: depuisBase64url(CLE_PUBLIQUE_VAPID) as BufferSource,
    })
    montrerCode(nouvel)
  })
}

const montrerCode = (abo: PushSubscription): void => {
  ecran.innerHTML = `
    <h1>Le code du PC</h1>
    <p>Copie ce code et donne-le au PC une seule fois. Il permet au PC d'envoyer les appels à ce téléphone.</p>
    <label for="code" class="aide">Code d'association</label>
    <textarea class="code" id="code" readonly></textarea>
    <button class="bouton" id="copier" type="button">Copier le code</button>
    <a class="bouton second" href="#historique" style="display:grid;place-items:center;text-decoration:none">Voir l'historique</a>`
  const zone = ecran.querySelector<HTMLTextAreaElement>('#code')!
  zone.value = codeAssociation(abo)
  ecran.querySelector('#copier')!.addEventListener('click', async e => {
    await navigator.clipboard.writeText(zone.value)
    ;(e.currentTarget as HTMLButtonElement).textContent = 'Copié'
  })
}

// ── Historique ───────────────────────────────────────────────────────────

// Une carte d'appel. Celles qui attendent une réponse portent la rubalise ; une tâche de fond, des pointillés.
const genre = (s: Situation): string => (ATTENTES.includes(s) ? ' attente' : s === 'fond' || s === 'fond-fini' ? ' fond' : '')

// Toute la carte ouvre la fiche de l'appel ; la croix, elle, efface.
const ligne = (m: Message): string => `
  <article class="ligne${genre(m.situation)}" data-fiche="${echapper(m.id)}" tabindex="0" aria-haspopup="dialog">
    <div class="vignette" style="background:${m.couleur}"><img src="./ouvriers/${OUVRIER[m.situation]}.svg" alt="">${picto(m.situation)}</div>
    <div class="corps">
      <div class="meta">
        <span class="badge" style="background:${m.couleur}">${echapper(m.session)}</span>
        <span class="situation">${LIBELLES[m.situation]}</span>
        ${horodatage(m.date)}
        <button class="effacer" type="button" data-message="${echapper(m.id)}" aria-label="Effacer cet appel">${CROIX}</button>
      </div>
      <p class="texte">${echapper(m.texte)}${m.rappel ? ` · rappel ${m.rappel}/3` : ''}</p>
    </div>
  </article>`

// La fiche d'un appel, et sa réponse depuis le téléphone (BRIEF.md, bloc 4). La liste se redessine à la fermeture si
// une réponse est partie.
const ouvrirFicheAppel = async (id: string): Promise<void> => {
  const [messages, boite] = await Promise.all([lireHistorique(), lireBoite()])
  const m = messages.find(x => x.id === id)
  if (!m) return
  let envoyee = false
  const corps = ouvrirFeuille(ficheAppel(m, messages, peutRepondre(m, boite)), () => {
    if (envoyee && (location.hash.slice(1) || 'historique') === 'historique') void historique()
  })
  const etat = corps.querySelector<HTMLElement>('#etat-reponse')
  const envoyer = async (c: Contenu): Promise<void> => {
    corps.querySelectorAll<HTMLButtonElement>('.repondre button').forEach(b => (b.disabled = true))
    if (etat) etat.textContent = 'Envoi…'
    try {
      await repondre(m, c)
      envoyee = true
      if (etat) etat.textContent = `Réponse envoyée : « ${dire(c)} ». Claude la reçoit dans quelques secondes.`
    } catch (erreur) {
      corps.querySelectorAll<HTMLButtonElement>('.repondre button').forEach(b => (b.disabled = false))
      if (etat) etat.textContent = `La réponse n'est pas partie (${erreur instanceof Error ? erreur.message : 'réseau'}). Réessaie.`
    }
  }
  corps.querySelectorAll<HTMLButtonElement>('[data-choix]').forEach(b =>
    b.addEventListener('click', () => void envoyer({ choix: m.attendue!.options[Number(b.dataset.choix)]! })),
  )
  corps.querySelector('#envoyer-reponse')?.addEventListener('click', () => {
    const texte = corps.querySelector<HTMLTextAreaElement>('#reponse-texte')!.value.trim()
    if (texte) void envoyer({ texte })
    else if (etat) etat.textContent = 'Écris d’abord ta réponse.'
  })
  corps.querySelector('#refuser')?.addEventListener('click', () => void envoyer({ refus: true }))
}

// Les filtres choisis tiennent tant que l'appli reste ouverte.
const filtres: Filtres = { sessions: new Set(), types: new Set() }

// Un appel vient d'arriver : le livreur traversera la rue au prochain dessin de la scène.
let livreurAttendu = false

const nbFiltres = (): number => filtres.sessions.size + filtres.types.size

// Le titre de la liste et, à droite, le bouton qui ouvre les filtres dans la feuille du bas ; sous le titre, les
// filtres actifs en une ligne. Le bouton n'apparaît que s'il y a de quoi trier.
const teteListe = (messages: Message[]): string => {
  const { sessions, types } = pastilles(messages, filtres)
  const n = nbFiltres()
  const bouton =
    sessions.length > 1 || types.length > 1 || n
      ? `<button class="filtrer${n ? ' actif' : ''}" type="button" id="filtrer" aria-haspopup="dialog">Filtrer${n ? ` · ${n}` : ''}</button>`
      : ''
  const libelles = [...filtres.sessions, ...[...filtres.types].map(t => types.find(x => x.type === t)?.libelle ?? t)]

  return `
    <div class="tete-liste"><h2>Derniers appels</h2>${bouton}</div>
    ${n ? `<p class="resume-filtres"><span>${libelles.map(echapper).join(' · ')}</span><button class="effacer" type="button" id="sans-filtre" aria-label="Retirer les filtres">${CROIX}</button></p>` : ''}`
}

// La feuille des filtres : les pastilles s'allument au toucher ; la liste suit à la fermeture de la feuille.
const ouvrirFiltres = (messages: Message[]): void => {
  const { sessions, types } = pastilles(messages, filtres)
  const corps = ouvrirFeuille(
    `
    <h2 id="feuille-titre">Filtrer les appels</h2>
    <h3>Sessions</h3>
    <div class="filtres">
      ${sessions.map(s => `<button class="pastille" type="button" data-session="${echapper(s.nom)}" aria-pressed="${filtres.sessions.has(s.nom)}" style="--couleur:${s.couleur}">${echapper(s.nom)}</button>`).join('')}
    </div>
    <h3>Types</h3>
    <div class="filtres">
      ${types.map(t => `<button class="pastille type" type="button" data-type="${t.type}" aria-pressed="${filtres.types.has(t.type)}">${t.libelle}</button>`).join('')}
    </div>
    <div class="pied-feuille">
      <button class="bouton second" type="button" id="tout-voir">Tout voir</button>
      <button class="bouton" type="button" id="valider">Voir les appels</button>
    </div>`,
    () => void historique(),
  )
  corps.querySelectorAll<HTMLButtonElement>('.pastille').forEach(b =>
    b.addEventListener('click', () => {
      const [ensemble, valeur] = b.dataset.session !== undefined ? [filtres.sessions, b.dataset.session] : [filtres.types, b.dataset.type!]
      if (!ensemble.delete(valeur)) ensemble.add(valeur)
      b.setAttribute('aria-pressed', String(ensemble.has(valeur)))
    }),
  )
  corps.querySelector('#tout-voir')!.addEventListener('click', () => {
    filtres.sessions.clear()
    filtres.types.clear()
    fermerFeuille()
  })
  corps.querySelector('#valider')!.addEventListener('click', fermerFeuille)
}

const historique = async (): Promise<void> => {
  const [messages, chantiers, activite, quartier, obtenues] = await Promise.all([lireHistorique(), lireChantiers(), lireActivite(), lireQuartier(), lireMedailles()])
  const affiches = filtrer(messages, filtres)
  const isFiltre = affiches.length !== messages.length
  ecran.innerHTML = `
    ${scene(chantiers, quartier)}
    ${murDuChef(activite)}
    ${vitrine(obtenues)}
    ${
      messages.length
        ? `${teteListe(messages)}
           ${affiches.length ? affiches.map(ligne).join('') : `<p class="aide">Aucun appel pour ces filtres.</p>`}
           ${isFiltre ? '' : `<button class="bouton second" id="vider" type="button">Tout effacer</button>`}`
        : `<h2>Rien pour l'instant</h2><p class="aide">Les appels du PC s'afficheront ici, même hors ligne.</p>`
    }`
  ecran.querySelectorAll<HTMLButtonElement>('button[data-message]').forEach(b =>
    b.addEventListener('click', async e => {
      e.stopPropagation()
      await effacerMessage(b.dataset.message!)
      b.closest('article')?.remove()
      if (!ecran.querySelector('article.ligne')) await historique()
    }),
  )
  ecran.querySelectorAll<HTMLElement>('article[data-fiche]').forEach(a => {
    const ouvrir = () => void ouvrirFicheAppel(a.dataset.fiche!)
    a.addEventListener('click', ouvrir)
    a.addEventListener('keydown', e => (e.key === 'Enter' || e.key === ' ') && e.target === a && (e.preventDefault(), ouvrir()))
  })
  ecran.querySelectorAll<HTMLButtonElement>('[data-medaille]').forEach(b =>
    b.addEventListener('click', () => {
      const m = MEDAILLES.find(x => x.id === b.dataset.medaille)
      if (m) ouvrirFeuille(ficheMedaille(m, obtenues.get(m.id)))
    }),
  )
  ecran.querySelectorAll<HTMLElement>('[data-batiment]').forEach(el => {
    const ouvrir = () => {
      const b = quartier.find(x => x.id === el.dataset.batiment)
      if (b) ouvrirFeuille(ficheBatiment(b))
    }
    el.addEventListener('click', ouvrir)
    el.addEventListener('keydown', e => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), ouvrir()))
  })
  ecran.querySelector('#filtrer')?.addEventListener('click', () => ouvrirFiltres(messages))
  ecran.querySelector('#sans-filtre')?.addEventListener('click', () => {
    filtres.sessions.clear()
    filtres.types.clear()
    void historique()
  })
  // Deux temps, sans boîte de dialogue : le premier toucher demande confirmation, le second efface.
  const vider = ecran.querySelector<HTMLButtonElement>('#vider')
  vider?.addEventListener('click', async () => {
    if (!vider.dataset.confirme) {
      vider.dataset.confirme = 'oui'
      vider.textContent = 'Toucher encore pour tout effacer'

      return
    }
    await viderHistorique()
    await historique()
  })
  placerAstres(ecran)
  animerRue(ecran)
  if (livreurAttendu) {
    livreurAttendu = false
    livrer(ecran)
  }
  // Toucher un chantier en cours : le mini-jeu, pour patienter.
  ecran.querySelectorAll<HTMLElement>('.parcelle[role="button"]').forEach(el => {
    const ouvrir = () => {
      const c = chantiers.find(x => x.sessionId === el.dataset.session)
      if (c) ouvrirJeu(c)
    }
    el.addEventListener('click', ouvrir)
    el.addEventListener('keydown', e => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), ouvrir()))
  })
  void animerScene(ecran, quartier)
}

// ── Chantiers ────────────────────────────────────────────────────────────

const chantiers = async (): Promise<void> => {
  const liste = await lireChantiers()
  ecran.innerHTML = liste.length
    ? `<h2>Chantiers</h2>${liste.map(carte).join('')}`
    : `<h2>Aucun chantier</h2><p class="aide">Quand une session suit des étapes, son avancement s'affiche ici, étape par étape.</p>`
  ecran.querySelectorAll<HTMLButtonElement>('button[data-chantier]').forEach(b =>
    b.addEventListener('click', async () => {
      await effacerChantier(b.dataset.chantier!)
      await chantiers()
    }),
  )
}

// ── Forfait ──────────────────────────────────────────────────────────────

const forfait = async (): Promise<void> => {
  ecran.innerHTML = ecranForfait(await lireForfaitGarde())
}

// ── Réglages ─────────────────────────────────────────────────────────────

const LIEU_LIBRE = 'Lieu choisi'

// En bas de Réglages : si les réponses sont activées, et la dernière erreur du service worker s'il y en a une.
const etatTechnique = async (): Promise<string> => {
  const [boite, erreur] = await Promise.all([lireBoite(), lireErreur()])
  const quand = (d: number) => new Date(d).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

  return `<p class="aide">Réponses depuis le téléphone : ${boite ? `activées (${quand(boite.date)})` : 'pas encore activées, le PC enverra la clé'}.</p>${
    erreur ? `<p class="aide">Dernière erreur (${quand(erreur.date)}) : ${echapper(erreur.texte)}</p>` : ''
  }`
}

// « Soleil à 12° au-dessus de l'horizon · interface claire »
const direSoleil = (): string => {
  const s = cielActuel()?.soleil
  if (!s) return ''
  const e = Math.round(s.elevation)

  return `${lireVille().nom} : soleil à ${Math.abs(e)}° ${e >= 0 ? "au-dessus de l'horizon" : "sous l'horizon"} · interface ${s.elevation >= BASCULE ? 'claire' : 'sombre'}.`
}

const reglages = async (): Promise<void> => {
  const lignes = await Promise.all(
    [...REGLABLES, 'medaille' as const].map(async s => {
      const r = await lireReglage(s)

      return `
        <div class="reglage">
          <strong>${s === 'medaille' ? 'Médaille' : LIBELLES[s]}</strong>
          <label><input type="checkbox" data-s="${s}" data-k="son" ${r.son ? 'checked' : ''}>Son</label>
          <label><input type="checkbox" data-s="${s}" data-k="vibration" ${r.vibration ? 'checked' : ''}>Vibration</label>
        </div>`
    }),
  )
  const ville = lireVille()
  const connue = VILLES.find(v => v.nom === ville.nom)
  const libre = !connue && ville.nom === LIEU_LIBRE
  ecran.innerHTML = `
    <h2>Réglages</h2>
    ${lignes.join('')}
    <section class="reglage-ville">
      <h3><label for="ville">La ville du soleil</label></h3>
      <p class="aide">Les couleurs de l'appli suivent la hauteur du soleil dans cette ville.</p>
      <select id="ville">
        <option value="">Selon le fuseau du téléphone</option>
        ${VILLES.map(v => `<option${v === connue ? ' selected' : ''}>${echapper(v.nom)}</option>`).join('')}
        <option value="autre"${libre ? ' selected' : ''}>Autre : latitude et longitude</option>
      </select>
      <div class="lieu-libre" id="lieu-libre"${libre ? '' : ' hidden'}>
        <label>Latitude<input type="number" id="lat" min="-90" max="90" step="0.01" value="${libre ? ville.lat : ''}" inputmode="decimal"></label>
        <label>Longitude<input type="number" id="lon" min="-180" max="180" step="0.01" value="${libre ? ville.lon : ''}" inputmode="decimal"></label>
        <button class="bouton second" type="button" id="garder-lieu">Garder</button>
      </div>
      <p class="aide" id="etat-soleil" role="status">${direSoleil()}</p>
    </section>
    <section class="carte-aide">
      <h3>Voir les appels en bandeau</h3>
      <p>Android décide seul si une notification s'affiche en haut de l'écran. Pour Hého, une seule fois :
        Paramètres › Applis › <strong>Hého</strong> (ou <strong>Chrome</strong> si l'appli n'est pas installée) ›
        Notifications › <strong>${echapper(location.host)}</strong> › active <strong>Afficher en pop-up</strong>
        (parfois appelé « Priorité élevée »).</p>
    </section>
    <button class="bouton" id="test" type="button">Envoyer une notification de test</button>
    <p class="aide" id="message" role="status"></p>
    ${await etatTechnique()}
    <p class="aide version">Version du ${new Date(__CONSTRUIT__).toLocaleString('fr-FR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}</p>`
  const etatSoleil = ecran.querySelector<HTMLElement>('#etat-soleil')!
  const changerVille = (v: Ville | null): void => {
    ecrireVille(v)
    appliquer()
    etatSoleil.textContent = direSoleil()
  }
  const choix = ecran.querySelector<HTMLSelectElement>('#ville')!
  choix.addEventListener('change', () => {
    ecran.querySelector<HTMLElement>('#lieu-libre')!.hidden = choix.value !== 'autre'
    if (choix.value !== 'autre') changerVille(VILLES.find(v => v.nom === choix.value) ?? null)
  })
  ecran.querySelector('#garder-lieu')!.addEventListener('click', () => {
    const lat = Number(ecran.querySelector<HTMLInputElement>('#lat')!.value)
    const lon = Number(ecran.querySelector<HTMLInputElement>('#lon')!.value)
    if (!(Math.abs(lat) <= 90 && Math.abs(lon) <= 180)) return void (etatSoleil.textContent = 'La latitude va de −90 à 90, la longitude de −180 à 180.')
    changerVille({ nom: LIEU_LIBRE, lat, lon })
  })
  ecran.querySelectorAll<HTMLInputElement>('input[type=checkbox]').forEach(caseACocher =>
    caseACocher.addEventListener('change', async () => {
      const s = caseACocher.dataset.s as Reglable
      const r = await lireReglage(s)
      await ecrireReglage(s, { ...r, [caseACocher.dataset.k!]: caseACocher.checked })
    }),
  )
  ecran.querySelector('#test')!.addEventListener('click', async () => {
    const reg = await enregistrement()
    const message = ecran.querySelector<HTMLElement>('#message')!
    if (!reg?.active || Notification.permission !== 'granted')
      return void (message.textContent = 'Active d’abord les notifications depuis l’accueil.')
    const test: Message = {
      v: 1,
      id: `test-${Date.now()}`,
      sessionId: 'test',
      session: 'HÉHO',
      couleur: '#f9e2af',
      situation: 'question',
      texte: `Test : ${TITRES.question.toLowerCase()} ?`,
      rappel: 0,
      date: Date.now(),
    }
    reg.active.postMessage({ type: 'test', message: test })
    message.textContent = 'Notification envoyée.'
  })
}

// ── Navigation ───────────────────────────────────────────────────────────

const ECRANS: Record<string, () => Promise<void>> = { accueil, chantiers, historique, forfait, reglages }

const afficher = async (): Promise<void> => {
  const associe = (await abonnementActuel()) !== null
  etat.hidden = !associe
  nav.hidden = !associe
  const nom = location.hash.slice(1)
  const choix = associe ? (ECRANS[nom] ? nom : 'historique') : 'accueil'
  nav.querySelectorAll('a').forEach(a => a.toggleAttribute('aria-current', a.hash === `#${choix}`))
  nav.querySelectorAll('a[aria-current]').forEach(a => a.setAttribute('aria-current', 'page'))
  await ECRANS[choix]!()
}

window.addEventListener('hashchange', () => void afficher())
// Le service worker prévient : un push reçu pendant que l'appli est ouverte rafraîchit l'écran affiché ; un
// toucher sur une notification mène à son écran.
navigator.serviceWorker?.addEventListener('message', e => {
  const { type, ecran: cible, fiche } = (e.data ?? {}) as { type?: string; ecran?: string; fiche?: string }
  const affiche = location.hash.slice(1) || 'historique'
  if (type === 'aller' && cible) location.hash = cible
  // Un appel qui attend une réponse, touché dans les notifications : sa fiche.
  if (type === 'aller' && fiche) void ouvrirFicheAppel(fiche)
  // Un appel arrive : le livreur passera dans la rue au prochain dessin de la scène.
  if (type === 'maj' && cible === 'historique') livreurAttendu = true
  // L'historique montre aussi la scène du chantier : il suit les deux. Le forfait arrive avec n'importe quel push.
  if (type === 'maj' && (affiche === cible || affiche === 'historique' || affiche === 'forfait')) void afficher()
  // Un mini-jeu ouvert sur un chantier qui vient de finir l'annonce.
  if (type === 'maj' && cible === 'chantiers') void lireChantiers().then(liste => liste.forEach(c => estFini(c) && chantierFini(c.sessionId)))
})
// À l'ouverture, les appels et les chantiers trop vieux partent avant le premier affichage.
// Le tout premier calcul des médailles, en silence : celles d'avant cette version ne s'annoncent pas.
void decernerMedailles(true).catch(() => [])
void nettoyer()
  .catch(() => undefined)
  .then(afficher)
  // L'appli ouverte par une notification d'appel qui attend une réponse : sa fiche, par-dessus l'historique.
  .then(() => {
    const fiche = new URLSearchParams(location.search).get('fiche')
    if (!fiche) return
    history.replaceState(null, '', location.pathname + location.hash)
    void ouvrirFicheAppel(fiche)
  })

// À l'ouverture, les notifications « Terminé » des chantiers s'effacent : le mur du chef en garde la trace.
void enregistrement()
  .then(reg => reg?.getNotifications())
  .then(notifs => notifs?.forEach(n => (n.data as { fini?: boolean } | null)?.fini && n.close()))
  .catch(() => undefined)

// Les heures relatives (« il y a 3 min ») avancent tant que l'appli reste ouverte, et le soleil avec elles.
setInterval(() => {
  rafraichirHeures(ecran)
  appliquer()
  placerAstres(ecran)
}, 30_000)

// Une nouvelle version publiée : à chaque retour sur l'appli, le navigateur cherche un nouveau service worker, et
// quand celui-ci prend la main la page se recharge. Sans cela, l'appli reprise depuis l'arrière-plan gardait
// l'ancienne page. Pas de rechargement à la toute première installation, qui n'avait pas de version d'avant.
if ('serviceWorker' in navigator && !import.meta.env.DEV) {
  const avaitUneVersion = navigator.serviceWorker.controller !== null
  navigator.serviceWorker.addEventListener('controllerchange', () => avaitUneVersion && location.reload())
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void navigator.serviceWorker.getRegistration().then(r => r?.update()).catch(() => undefined)
  })
}
