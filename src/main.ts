// L'appli : association avec le PC, chantiers, historique, réglages. Des écrans choisis par l'adresse (#…).
import '@fontsource/jersey-10'
import '@fontsource/atkinson-hyperlegible-next/400.css'
import '@fontsource/atkinson-hyperlegible-next/700.css'
import './style.css'
import { animerScene, carte, CROIX, echapper, horodatage, murDuChef, placerAstres, rafraichirHeures, repeindre, scene } from './chantier'
import { appliquer, BASCULE, cielActuel, ecrireVille, lireVille, VILLES, type Ville } from './soleil'
import { CLE_PUBLIQUE_VAPID } from './config'
import { aTraiter, depuis, sansRappels, type ATraiter } from './attente'
import { fermerFeuille, ficheAppel, ficheBatiment, ficheMedaille, ouvrirFeuille, questionsAppel, vitrine } from './fiche'
import { MEDAILLES } from './medailles'
import { filtrer, pastilles, type Filtres } from './filtres'
import { ecranForfait } from './forfait'
import { appelDe, ATTENTES, estFini, LIBELLES, OUVRIER, REGLABLES, TITRES, type Message, type Situation } from './message'
import { chantierFini, ouvrirJeu } from './jeu'
import { picto } from './pictos'
import { animerRue, livrer } from './rue'
import {
  ecrireReglage,
  effacerChantier,
  ecrireHeuresCalmes,
  ecrireOuvert,
  effacerMessage,
  lireActivite,
  lireHeuresCalmes,
  lireOuverts,
  lireChantiers,
  decernerMedailles,
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

// Les couleurs du soleil avant le premier affichage.
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

// Une carte d'appel (BRIEF.md, « À toi »). Celles qui attendent encore portent la rubalise ; celles qui attendaient et
// sont réglées passent en gris sur une ligne ; une tâche de fond, des pointillés.
const genre = (s: Situation, ouvert: boolean): string =>
  ATTENTES.includes(s) ? (ouvert ? ' attente' : ' regle') : s === 'fond' || s === 'fond-fini' ? ' fond' : ''

// Le verbe de chaque genre d'appel qui attend la personne, sur sa couleur (style.css, .t-question…).
const VERBES: Partial<Record<Situation, string>> = { question: 'Répondre', permission: 'Autoriser', recap: 'Choisir', done: 'La suite', arret: 'Vérifier' }

const rappelsDe = (n: number): string => (n ? ` · ${n} rappel${n > 1 ? 's' : ''}` : '')

// Le bloc « À toi », en haut de l'historique : une carte par session qui attend, la plus ancienne d'abord.
const blocAToi = (liste: ATraiter[]): string =>
  liste.length
    ? `
    <section class="a-toi" aria-labelledby="titre-a-toi">
      <h2 id="titre-a-toi">À toi <span class="compte">${liste.length}</span></h2>
      ${liste
        .map(
          ({ message: m, depuis: d, rappels }) => `
        <article class="appel-ouvert t-${m.situation}" data-fiche="${echapper(m.id)}" tabindex="0" aria-haspopup="dialog">
          <div class="vignette" style="background:${m.couleur}"><img src="./ouvriers/${OUVRIER[m.situation]}.svg" alt=""></div>
          <div class="corps">
            <div class="meta">
              <span class="verbe">${VERBES[m.situation] ?? LIBELLES[m.situation]}</span>
              <span class="badge" style="background:${m.couleur}">${echapper(m.session)}</span>
              <time class="attend" data-depuis="${d}">${depuis(d)}</time>
            </div>
            <p class="texte">${echapper(m.texte)}${rappelsDe(rappels)}</p>
            ${questionsAppel(m)}
          </div>
        </article>`,
        )
        .join('')}
    </section>`
    : ''

// Toute la carte ouvre la fiche de l'appel ; la croix, elle, efface.
const ligne = ({ message: m, rappels }: { message: Message; rappels: number }, ouverts: Set<string>): string => `
  <article class="ligne${genre(m.situation, ouverts.has(appelDe(m)))}" data-fiche="${echapper(m.id)}" tabindex="0" aria-haspopup="dialog">
    <div class="vignette" style="background:${m.couleur}"><img src="./ouvriers/${OUVRIER[m.situation]}.svg" alt="">${picto(m.situation)}</div>
    <div class="corps">
      <div class="meta">
        <span class="badge" style="background:${m.couleur}">${echapper(m.session)}</span>
        <span class="situation">${LIBELLES[m.situation]}${ATTENTES.includes(m.situation) && !ouverts.has(appelDe(m)) ? ' · réglé' : ''}</span>
        ${horodatage(m.date)}
        <button class="effacer" type="button" data-message="${echapper(m.id)}" aria-label="Effacer cet appel">${CROIX}</button>
      </div>
      <p class="texte">${echapper(m.texte)}${rappelsDe(rappels)}</p>
    </div>
  </article>`

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
  const [messages, chantiers, activite, quartier, obtenues, etats] = await Promise.all([lireHistorique(), lireChantiers(), lireActivite(), lireQuartier(), lireMedailles(), lireOuverts()])
  const affiches = filtrer(messages, filtres)
  const isFiltre = affiches.length !== messages.length
  const aToi = aTraiter(messages, etats, chantiers)
  const ouverts = new Set(aToi.map(a => appelDe(a.message)))
  montrerCompte(aToi.length)
  ecran.innerHTML = `
    ${blocAToi(aToi)}
    ${scene(chantiers, quartier)}
    ${murDuChef(activite)}
    ${vitrine(obtenues)}
    ${
      messages.length
        ? `${teteListe(messages)}
           ${affiches.length ? sansRappels(affiches).map(x => ligne(x, ouverts)).join('') : `<p class="aide">Aucun appel pour ces filtres.</p>`}
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
    const ouvrir = () => {
      const m = messages.find(x => x.id === a.dataset.fiche)
      if (!m) return
      const corps = ouvrirFeuille(ficheAppel(m, messages, ouverts.has(appelDe(m))))
      // « C'est réglé » : l'appel quitte « À toi » et sa notification le volet, sur ce téléphone seulement.
      corps.querySelector('#regle')?.addEventListener('click', async () => {
        await ecrireOuvert(m.sessionId, null, Math.max(Date.now(), m.date))
        const reg = await navigator.serviceWorker?.getRegistration().catch(() => undefined)
        for (const n of (await reg?.getNotifications({ tag: m.sessionId })) ?? []) n.close()
        fermerFeuille()
        await historique()
      })
    }
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

// En bas de Réglages, la dernière erreur du service worker s'il y en a une : le téléphone n'a pas de console.
const derniereErreur = async (): Promise<string> => {
  const e = await lireErreur()

  return e
    ? `<p class="aide">Dernière erreur (${new Date(e.date).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}) : ${echapper(e.texte)}</p>`
    : ''
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
  const calme = await lireHeuresCalmes()
  const heure = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
  const ville = lireVille()
  const connue = VILLES.find(v => v.nom === ville.nom)
  const libre = !connue && ville.nom === LIEU_LIBRE
  ecran.innerHTML = `
    <h2>Réglages</h2>
    ${lignes.join('')}
    <section class="reglage-calme">
      <h3>Heures calmes</h3>
      <p class="aide">Dans cette plage, seules les permissions sonnent ; les autres appels arrivent en silence.</p>
      <label class="calme-actif"><input type="checkbox" id="calme-actif"${calme.actif ? ' checked' : ''}>Activer</label>
      <div class="calme-plage">
        <label>De<input type="time" id="calme-debut" value="${heure(calme.debut)}"></label>
        <label>à<input type="time" id="calme-fin" value="${heure(calme.fin)}"></label>
      </div>
    </section>
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
    ${await derniereErreur()}
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
  const garderCalme = async (): Promise<void> => {
    const minutes = (id: string) => {
      const [h, m] = ecran.querySelector<HTMLInputElement>(id)!.value.split(':').map(Number)

      return (h ?? 0) * 60 + (m ?? 0)
    }
    await ecrireHeuresCalmes({ actif: ecran.querySelector<HTMLInputElement>('#calme-actif')!.checked, debut: minutes('#calme-debut'), fin: minutes('#calme-fin') })
  }
  for (const id of ['#calme-actif', '#calme-debut', '#calme-fin']) ecran.querySelector(id)!.addEventListener('change', () => void garderCalme())
  ecran.querySelectorAll<HTMLInputElement>('input[type=checkbox][data-s]').forEach(caseACocher =>
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

// L'onglet Historique compte les appels qui attendent la personne (BRIEF.md, « À toi »).
const montrerCompte = (n: number): void => {
  const lien = nav.querySelector<HTMLAnchorElement>('a[href="#historique"]')
  if (!lien) return
  lien.innerHTML = n ? `Historique <span class="compte" aria-label="${n} en attente">${n}</span>` : 'Historique'
}

const compter = async (): Promise<void> => {
  const [messages, etats, chantiers] = await Promise.all([lireHistorique(), lireOuverts(), lireChantiers()])
  montrerCompte(aTraiter(messages, etats, chantiers).length)
}

const afficher = async (): Promise<void> => {
  // En développement, ?essai montre les écrans sans abonnement push (une page de docs/ remplit le stockage).
  const associe = (await abonnementActuel()) !== null || (import.meta.env.DEV && location.search.includes('essai'))
  etat.hidden = !associe
  nav.hidden = !associe
  const nom = location.hash.slice(1)
  const choix = associe ? (ECRANS[nom] ? nom : 'historique') : 'accueil'
  nav.querySelectorAll('a').forEach(a => a.toggleAttribute('aria-current', a.hash === `#${choix}`))
  nav.querySelectorAll('a[aria-current]').forEach(a => a.setAttribute('aria-current', 'page'))
  await ECRANS[choix]!()
  if (associe && choix !== 'historique') await compter().catch(() => undefined)
}

window.addEventListener('hashchange', () => void afficher())
// Le service worker prévient : un push reçu pendant que l'appli est ouverte rafraîchit l'écran affiché ; un
// toucher sur une notification mène à son écran.
navigator.serviceWorker?.addEventListener('message', e => {
  const { type, ecran: cible } = (e.data ?? {}) as { type?: string; ecran?: string }
  const affiche = location.hash.slice(1) || 'historique'
  if (type === 'aller' && cible) location.hash = cible
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

// À l'ouverture, les notifications « Terminé » des chantiers s'effacent : le mur du chef en garde la trace.
void enregistrement()
  .then(reg => reg?.getNotifications())
  .then(notifs => notifs?.forEach(n => (n.data as { fini?: boolean } | null)?.fini && n.close()))
  .catch(() => undefined)

// Les heures relatives (« il y a 3 min ») avancent tant que l'appli reste ouverte, et le soleil avec elles.
setInterval(() => {
  rafraichirHeures(ecran)
  for (const t of ecran.querySelectorAll<HTMLElement>('.attend[data-depuis]')) t.textContent = depuis(Number(t.dataset.depuis))
  appliquer()
  placerAstres(ecran)
  repeindre(ecran)
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
