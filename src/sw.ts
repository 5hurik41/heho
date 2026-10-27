/// <reference lib="webworker" />
// Le service worker : reçoit le push, montre la notification, garde le message dans l'historique.
import { image, lireMessage, titre, type Message } from './message'
import { ajouterMessage, lireReglage } from './stockage'

declare const self: ServiceWorkerGlobalScope

// Options que Chrome Android comprend mais que lib.webworker ne décrit pas toutes.
type Options = NotificationOptions & { image?: string; renotify?: boolean; vibrate?: number[]; timestamp?: number }

self.addEventListener('install', () => void self.skipWaiting())
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()))

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

self.addEventListener('push', e => {
  let brut: unknown = null
  try {
    brut = e.data?.json()
  } catch {
    return
  }
  const m = lireMessage(brut)
  if (!m) return
  e.waitUntil(
    (async () => {
      await ajouterMessage(m)
      await montrer(m)
      for (const client of await self.clients.matchAll({ type: 'window' })) client.postMessage({ type: 'historique' })
    })(),
  )
})

// Un toucher sur la notification ouvre l'historique (le téléphone ne fait que recevoir).
self.addEventListener('notificationclick', e => {
  e.notification.close()
  e.waitUntil(
    (async () => {
      const fenetres = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const ouverte = fenetres[0]
      if (ouverte) return void (await ouverte.focus())
      await self.clients.openWindow('./#historique')
    })(),
  )
})

// L'appli demande une notification de test : même chemin qu'un vrai push, sans passer par le réseau.
self.addEventListener('message', e => {
  const m = lireMessage((e.data as { type?: string; message?: unknown })?.message)
  if ((e.data as { type?: string })?.type !== 'test' || !m) return
  e.waitUntil(ajouterMessage(m).then(() => montrer(m)))
})
