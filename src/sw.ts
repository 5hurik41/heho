/// <reference lib="webworker" />
// Le service worker : reçoit le push, montre la notification, garde le message dans l'historique.
import { enCours, estFini, faites, image, lireMessage, lireProgression, titre, type Message, type Progression } from './message'
import { ajouterActivite, ajouterBatiments, ajouterMessage, ecrireChantier, jourDe, lireChantier, lireReglage } from './stockage'

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
      await (await caches.open(CACHE)).addAll(FICHIERS)
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

// La page : le réseau d'abord, pour avoir la dernière version ; sans réseau, celle du cache.
// Le reste porte une empreinte ou change rarement : le cache d'abord.
self.addEventListener('fetch', e => {
  const req = e.request
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return
  e.respondWith(
    (async () => {
      const cache = await caches.open(CACHE)
      if (req.mode === 'navigate') {
        try {
          return await fetch(req)
        } catch {
          return (await cache.match('./')) ?? Response.error()
        }
      }

      return (await cache.match(req)) ?? fetch(req)
    })(),
  )
})

const montrer = async (m: Message): Promise<void> => {
  const reglage = await lireReglage(m.situation)
  const options: Options = {
    body: m.texte,
    // Le même tag par session : un rappel remplace la notification précédente au lieu de s'empiler.
    tag: m.sessionId,
    renotify: true,
    icon: './icones/icone-192.png',
    image: image(m),
    badge: './icones/badge-96.png',
    timestamp: m.date,
    silent: !reglage.son,
    vibrate: reglage.vibration ? [180, 90, 180] : [],
    data: { id: m.id },
  }
  await self.registration.showNotification(titre(m), options)
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

// Les briques que cette progression ajoute au mur d'activité : les étapes faites depuis la précédente du même
// plan (un autre titre est un nouveau plan), et un mur de plus s'il vient d'être fini.
const recevoirProgression = async (p: Progression): Promise<void> => {
  const avant = await lireChantier(p.sessionId)
  const memePlan = avant !== undefined && avant.titre === p.titre
  const briques = Math.max(0, faites(p) - (memePlan ? faites(avant) : 0))
  const vientDeFinir = estFini(p) && !(memePlan && estFini(avant))
  await ecrireChantier({ ...p, finiA: vientDeFinir ? p.date : memePlan ? avant.finiA : undefined })
  if (briques || vientDeFinir) await ajouterActivite(jourDe(p.date), briques, vientDeFinir ? 1 : 0)
  // Un mur fini devient un bâtiment du quartier, d'autant d'étages que d'étapes.
  if (vientDeFinir)
    await ajouterBatiments([{ id: `${p.sessionId}:${p.date}`, session: p.session, couleur: p.couleur, titre: p.titre, etages: p.etapes.length, date: p.date }])
}

const effacerLesTermines = async (sauf?: string): Promise<void> => {
  for (const n of await self.registration.getNotifications())
    if ((n.data as { fini?: boolean } | null)?.fini && n.tag !== sauf) n.close()
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
  const p = lireProgression(brut)
  if (p) {
    e.waitUntil(
      (async () => {
        await recevoirProgression(p)
        await effacerLesTermines(`chantier-${p.sessionId}`)
        await montrerProgression(p)
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
      await ajouterMessage(m)
      await montrer(m)
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
