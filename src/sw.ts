/// <reference lib="webworker" />
// Le service worker : reçoit le push, montre la notification, garde le message dans l'historique.
import { enCours, estFini, faites, image, lireForfait, lireMessage, lireProgression, lireSauvegarde, titre, type Message, type Progression } from './message'
import type { Medaille } from './medailles'
import {
  ajouterBatiments,
  ajouterMessage,
  decernerMedailles,
  ecrireForfait,
  ecrireOuvert,
  estCalme,
  fusionnerActivite,
  lireHeuresCalmes,
  lireHistorique,
  lireReglage,
  nettoyer,
  noterErreur,
  recevoirProgression,
  retirerBatiments,
} from './stockage'

declare const self: ServiceWorkerGlobalScope

// Options que Chrome Android comprend mais que lib.webworker ne décrit pas toutes.
type Options = NotificationOptions & { image?: string; renotify?: boolean; vibrate?: number[]; timestamp?: number }

// ── Hors ligne : l'appli entière en cache, pour lire l'historique sans réseau ──

// Remplis au build par vite.config.ts (listeHorsLigne).
const FICHIERS = '__FICHIERS__'.split('|')
const CACHE = 'heho-__VERSION__'

self.addEventListener('install', e => {
  e.waitUntil(
    (async () => {
      // `reload` : GitHub Pages sert ses fichiers avec max-age=600, le cache HTTP rendrait l'ancienne page.
      await (await caches.open(CACHE)).addAll(FICHIERS.map(f => new Request(f, { cache: 'reload' })))
      await self.skipWaiting()
    })(),
  )
})

self.addEventListener('activate', e => {
  e.waitUntil(
    (async () => {
      for (const nom of await caches.keys()) if (nom.startsWith('heho-') && nom !== CACHE) await caches.delete(nom)
      await self.clients.claim()
    })(),
  )
})

// La page : le réseau d'abord, pour avoir la dernière version, en revalidant le cache HTTP (max-age=600 sur
// GitHub Pages) ; sans réseau, celle du cache. Le reste porte une empreinte ou change rarement : le cache d'abord.
self.addEventListener('fetch', e => {
  const req = e.request
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return
  e.respondWith(
    (async () => {
      const cache = await caches.open(CACHE)
      if (req.mode === 'navigate') {
        try {
          return await fetch(new Request(req, { cache: 'no-cache' }))
        } catch {
          return (await cache.match('./')) ?? Response.error()
        }
      }

      return (await cache.match(req)) ?? fetch(req)
    })(),
  )
})

const montrer = async (m: Message): Promise<void> => {
  // Son et vibration selon les réglages de la situation, lancement d'une tâche de fond compris. Pendant les heures
  // calmes, seules les permissions sonnent (BRIEF.md, « Heures calmes »).
  const calme = m.situation !== 'permission' && estCalme(await lireHeuresCalmes().catch(() => ({ actif: false, debut: 0, fin: 0 })))
  const reglage = calme ? { son: false, vibration: false } : await lireReglage(m.situation)
  const options: Options = {
    body: m.texte,
    // Le même tag par session : un rappel remplace la notification précédente au lieu de s'empiler. Une tâche de
    // fond a le sien, que sa fin reprend.
    tag: m.tache ? `fond-${m.tache}` : m.sessionId,
    renotify: true,
    icon: './icones/icone-192.png',
    image: image(m),
    badge: './icones/badge-96.png',
    timestamp: m.date,
    ...sonEtVibration(reglage, [180, 90, 180]),
    data: { id: m.id },
  }
  // Une notification doit paraître quoi qu'il arrive : si la plus riche échoue, on note l'erreur (Réglages la montre)
  // et on montre l'appel tout simple.
  try {
    await self.registration.showNotification(titre(m), options)
  } catch (erreur) {
    await noterErreur(`Notification « ${m.situation} » : ${String(erreur)}`).catch(() => undefined)
    await self.registration.showNotification(titre(m), { body: m.texte, tag: options.tag, icon: options.icon, badge: options.badge, data: options.data })
  }
}

// Chrome refuse une notification silencieuse qui vibre : sans son, pas de vibration (une page web ne sait pas vibrer
// sans son, BRIEF.md, « Tâches de fond »).
const sonEtVibration = (r: { son: boolean; vibration: boolean }, motif: number[]): { silent: boolean; vibrate?: number[] } =>
  r.son ? { silent: false, vibrate: r.vibration ? motif : [] } : { silent: true }

// Une médaille gagnée : sa propre notification, avec sa grande image (public/medailles/), son et vibration selon Réglages.
const montrerMedaille = async (m: Medaille): Promise<void> => {
  const reglage = await lireReglage('medaille')
  const options: Options = {
    body: m.texte,
    tag: `medaille-${m.id}`,
    icon: './icones/icone-192.png',
    image: `./medailles/${m.id}.png`,
    badge: './icones/badge-96.png',
    ...sonEtVibration(reglage, [120, 60, 120, 60, 240]),
    data: { ecran: 'historique', medaille: m.id },
  }
  await self.registration.showNotification(`HÉHO · Médaille : ${m.titre}`, options)
}

// La progression d'un chantier : une notification silencieuse par session, mise à jour sur place
// (Chrome exige une notification à chaque push).
const montrerProgression = async (p: Progression): Promise<void> => {
  const total = p.etapes.length
  const options: Options = {
    body: estFini(p) ? `Terminé · ${total}/${total}` : `${faites(p)}/${total}${enCours(p) ? ` · ${enCours(p)}` : ''}`,
    tag: `chantier-${p.sessionId}`,
    renotify: false,
    silent: true,
    icon: './icones/icone-192.png',
    badge: './icones/badge-96.png',
    timestamp: p.date,
    // `fini` : la notification « Terminé » s'efface au prochain push ou à la prochaine ouverture de l'appli.
    data: { ecran: 'chantiers', fini: estFini(p) },
  }
  await self.registration.showNotification(`${p.session} · ${p.titre ?? 'Chantier en cours'}`, options)
}

const effacerLesTermines = async (sauf?: string): Promise<void> => {
  for (const n of await self.registration.getNotifications())
    if ((n.data as { fini?: boolean } | null)?.fini && n.tag !== sauf) n.close()
}

// L'appel ouvert de la session, que porte chaque envoi (BRIEF.md, « Appel ouvert »). Réglé (null) : sa notification
// n'a plus rien à dire et quitte le volet.
const noterOuvert = async (sessionId: string, ouvert: string | null | undefined, date: number, fermer: boolean): Promise<void> => {
  if (ouvert === undefined) return
  await ecrireOuvert(sessionId, ouvert, date).catch(() => undefined)
  if (ouvert === null && fermer) for (const n of await self.registration.getNotifications({ tag: sessionId })) n.close()
}

const prevenirLesFenetres = async (ecran: string): Promise<void> => {
  for (const client of await self.clients.matchAll({ type: 'window' })) client.postMessage({ type: 'maj', ecran })
}

self.addEventListener('push', e => {
  let brut: unknown = null
  try {
    brut = e.data?.json()
  } catch {
    return
  }
  // L'état du forfait voyage avec n'importe quel push (BRIEF.md, « Forfait »).
  const forfait = lireForfait(brut)
  if (forfait) e.waitUntil(ecrireForfait(forfait).catch(() => undefined))
  const s = lireSauvegarde(brut)
  if (s) {
    e.waitUntil(
      (async () => {
        await fusionnerActivite(s.jours.map(([jour, briques, murs]) => ({ jour, briques, murs })))
        await ajouterBatiments(s.batiments)
        const retires = s.retirer ? await retirerBatiments(s.retirer) : 0
        // Le passé repris du PC décerne ses médailles sans les annoncer.
        await decernerMedailles(true).catch(() => [])
        const corps = [
          s.jours.length || s.batiments.length ? `${s.jours.length} jour${s.jours.length > 1 ? 's' : ''} et ${s.batiments.length} bâtiment${s.batiments.length > 1 ? 's' : ''} repris du PC.` : '',
          retires ? `${retires} bâtiment${retires > 1 ? 's' : ''} retiré${retires > 1 ? 's' : ''} du quartier.` : '',
        ].filter(Boolean).join(' ')
        await self.registration.showNotification(s.retirer ? 'Hého · Quartier mis à jour' : 'Hého · Mur du chef restauré', {
          body: corps || 'Rien à changer.',
          tag: 'sauvegarde',
          silent: true,
          icon: './icones/icone-192.png',
          badge: './icones/badge-96.png',
          data: { ecran: 'historique', fini: true },
        })
        await prevenirLesFenetres('historique')
      })(),
    )

    return
  }
  const p = lireProgression(brut)
  if (p) {
    e.waitUntil(
      (async () => {
        await recevoirProgression(p)
        await noterOuvert(p.sessionId, p.ouvert, p.date, true)
        await nettoyer().catch(() => undefined)
        await effacerLesTermines(`chantier-${p.sessionId}`)
        await montrerProgression(p)
        for (const m of await decernerMedailles().catch(() => [])) await montrerMedaille(m)
        await prevenirLesFenetres('chantiers')
      })(),
    )

    return
  }
  const m = lireMessage(brut)
  if (!m) return
  e.waitUntil(
    (async () => {
      await effacerLesTermines()
      // Un lancement de tâche de fond livré après sa fin (téléphone en veille) va dans l'historique, sans écraser
      // la notification de fin : on remontre celle-ci, sans bruit (Chrome veut une notification par push).
      const fin = m.situation === 'fond' && m.tache ? (await lireHistorique()).find(x => x.tache === m.tache && x.situation === 'fond-fini') : undefined
      await ajouterMessage(m)
      await noterOuvert(m.sessionId, m.ouvert, m.date, false)
      await nettoyer().catch(() => undefined)
      if (fin) await self.registration.showNotification(titre(fin), { body: fin.texte, tag: `fond-${m.tache}`, silent: true, icon: './icones/icone-192.png', badge: './icones/badge-96.png' })
      else await montrer(m)
      await prevenirLesFenetres('historique')
    })(),
  )
})

// Un toucher sur la notification ouvre l'écran qui va avec (le téléphone ne fait que recevoir).
self.addEventListener('notificationclick', e => {
  e.notification.close()
  const ecran = (e.notification.data as { ecran?: string } | null)?.ecran ?? 'historique'
  e.waitUntil(
    (async () => {
      const fenetres = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const ouverte = fenetres[0]
      if (!ouverte) return void (await self.clients.openWindow(`./#${ecran}`))
      ouverte.postMessage({ type: 'aller', ecran })
      await ouverte.focus()
    })(),
  )
})

// L'appli demande une notification de test : même chemin qu'un vrai push, sans passer par le réseau.
self.addEventListener('message', e => {
  const m = lireMessage((e.data as { type?: string; message?: unknown })?.message)
  if ((e.data as { type?: string })?.type !== 'test' || !m) return
  e.waitUntil(ajouterMessage(m).then(() => montrer(m)))
})
