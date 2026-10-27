// L'appli : association avec le PC, chantiers, historique, réglages. Des écrans choisis par l'adresse (#…).
import '@fontsource/jersey-10'
import '@fontsource/atkinson-hyperlegible-next/400.css'
import '@fontsource/atkinson-hyperlegible-next/700.css'
import './style.css'
import { animerScene, carte, CROIX, echapper, murDuChef, scene } from './chantier'
import { CLE_PUBLIQUE_VAPID } from './config'
import { LIBELLES, SITUATIONS, TITRES, type Message, type Situation } from './message'
import { ecrireReglage, effacerChantier, effacerMessage, lireActivite, lireChantiers, lireHistorique, lireReglage, viderHistorique } from './stockage'

const ecran = document.querySelector<HTMLElement>('#ecran')!
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

const heure = (date: number): string => {
  const d = new Date(date)
  const memeJour = d.toDateString() === new Date().toDateString()

  return memeJour
    ? d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

const ligne = (m: Message): string => `
  <article class="ligne">
    <div class="vignette" style="background:${m.couleur}"><img src="./ouvriers/${m.situation}.svg" alt=""></div>
    <div class="corps">
      <div class="meta">
        <span class="badge" style="background:${m.couleur}">${echapper(m.session)}</span>
        <span class="situation">${LIBELLES[m.situation]}</span>
        <span class="heure">${heure(m.date)}</span>
        <button class="effacer" type="button" data-message="${echapper(m.id)}" aria-label="Effacer cet appel">${CROIX}</button>
      </div>
      <p class="texte">${echapper(m.texte)}${m.rappel ? ` · rappel ${m.rappel}/3` : ''}</p>
    </div>
  </article>`

const historique = async (): Promise<void> => {
  const [messages, chantiers, activite] = await Promise.all([lireHistorique(), lireChantiers(), lireActivite()])
  ecran.innerHTML = `
    ${scene(chantiers)}
    ${murDuChef(activite)}
    ${
      messages.length
        ? `<h2>Derniers appels</h2>${messages.map(ligne).join('')}
           <button class="bouton second" id="vider" type="button">Tout effacer</button>`
        : `<h2>Rien pour l'instant</h2><p class="aide">Les appels du PC s'afficheront ici, même hors ligne.</p>`
    }`
  ecran.querySelectorAll<HTMLButtonElement>('button[data-message]').forEach(b =>
    b.addEventListener('click', async () => {
      await effacerMessage(b.dataset.message!)
      b.closest('article')?.remove()
      if (!ecran.querySelector('article.ligne')) await historique()
    }),
  )
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
  void animerScene(ecran)
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

// ── Réglages ─────────────────────────────────────────────────────────────

const reglages = async (): Promise<void> => {
  const lignes = await Promise.all(
    SITUATIONS.map(async s => {
      const r = await lireReglage(s)

      return `
        <div class="reglage">
          <strong>${LIBELLES[s]}</strong>
          <label><input type="checkbox" data-s="${s}" data-k="son" ${r.son ? 'checked' : ''}>Son</label>
          <label><input type="checkbox" data-s="${s}" data-k="vibration" ${r.vibration ? 'checked' : ''}>Vibration</label>
        </div>`
    }),
  )
  ecran.innerHTML = `
    <h2>Réglages</h2>
    ${lignes.join('')}
    <section class="carte-aide">
      <h3>Voir les appels en bandeau</h3>
      <p>Android décide seul si une notification s'affiche en haut de l'écran. Pour Hého, une seule fois :
        Paramètres › Applis › <strong>Hého</strong> (ou <strong>Chrome</strong> si l'appli n'est pas installée) ›
        Notifications › <strong>${echapper(location.host)}</strong> › active <strong>Afficher en pop-up</strong>
        (parfois appelé « Priorité élevée »).</p>
    </section>
    <button class="bouton" id="test" type="button">Envoyer une notification de test</button>
    <p class="aide" id="message" role="status"></p>`
  ecran.querySelectorAll<HTMLInputElement>('input[type=checkbox]').forEach(caseACocher =>
    caseACocher.addEventListener('change', async () => {
      const s = caseACocher.dataset.s as Situation
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

const ECRANS: Record<string, () => Promise<void>> = { accueil, chantiers, historique, reglages }

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
  const { type, ecran: cible } = (e.data ?? {}) as { type?: string; ecran?: string }
  const affiche = location.hash.slice(1) || 'historique'
  if (type === 'aller' && cible) location.hash = cible
  // L'historique montre aussi la scène du chantier : il suit les deux.
  if (type === 'maj' && (affiche === cible || affiche === 'historique')) void afficher()
})
void afficher()

// À l'ouverture, les notifications « Terminé » des chantiers s'effacent : le mur du chef en garde la trace.
void enregistrement()
  .then(reg => reg?.getNotifications())
  .then(notifs => notifs?.forEach(n => (n.data as { fini?: boolean } | null)?.fini && n.close()))
  .catch(() => undefined)
