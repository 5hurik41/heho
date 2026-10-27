/// <reference lib="webworker" />
// Le service worker : reçoit le push, montre la notification, garde le message dans l'historique.
import { enCours, estFini, faites, image, lireBoiteJointe, lireCle, lireForfait, lireMessage, lireProgression, lireSauvegarde, titre, type Message, type Progression } from './message'
import { dire, peutRepondre, repondre, type Contenu } from './reponse'
import type { Medaille } from './medailles'
import {
  ajouterBatiments,
  ajouterMessage,
  decernerMedailles,
  ecrireBoite,
  lireBoite,
  noterErreur,
  ecrireForfait,
  fusionnerActivite,
  lireHistorique,
  lireReglage,
  nettoyer,
  recevoirProgression,
  retirerBatiments,
} from './stockage'

declare const self: ServiceWorkerGlobalScope

// Options que Chrome Android comprend mais que lib.webworker ne décrit pas toutes.
type Options = NotificationOptions & { image?: string; renotify?: boolean; vibrate?: number[]; timestamp?: number; actions?: { action: string; title: string }[] }

// Chrome sur Android montre deux boutons au plus sous une notification.
const BOUTONS_MAX = 2

// Les boutons de réponse d'un appel (BRIEF.md, bloc 4) : refuser une permission, ou les premières options d'une
// question ; un appel qui attend du texte ouvre sa fiche.
const boutons = (m: Message): { action: string; title: string }[] => {
  const a = m.attendue
  if (!a) return []
  if (a.refuser) return [{ action: 'refus', title: 'Refuser' }]
  if (a.options.length) return a.options.slice(0, BOUTONS_MAX).map((o, i) => ({ action: `choix:${i}`, title: o }))

  return a.libre ? [{ action: 'repondre', title: 'Répondre' }] : []
}

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
  // Son et vibration selon les réglages de la situation, lancement d'une tâche de fond compris.
  const reglage = await lireReglage(m.situation)
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
    data: { id: m.id, ...(m.attendue ? { fiche: m.id } : {}) },
  }
  // Une notification doit paraître quoi qu'il arrive : si l'option la plus riche échoue, on note l'erreur (Réglages
  // la montre) et on montre l'appel tout simple.
  try {
    const boite = await lireBoite().catch(() => undefined)
    await self.registration.showNotification(titre(m), { ...options, ...(peutRepondre(m, boite) ? { actions: boutons(m) } : {}) })
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
  // La boîte aux lettres des réponses, envoyée par le PC une fois (BRIEF.md, bloc 4).
  const cle = lireCle(brut)
  if (cle) {
    e.waitUntil(
      (async () => {
        await ecrireBoite(cle)
        await self.registration.showNotification('Hého · Réponses activées', {
          body: 'Tu peux répondre aux appels depuis le téléphone.',
          tag: 'cle',
          silent: true,
          icon: './icones/icone-192.png',
          badge: './icones/badge-96.png',
          data: { ecran: 'historique' },
        })
      })(),
    )

    return
  }
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
      // La boîte aux lettres jointe à l'appel, rangée avant la notification : ses boutons de réponse en dépendent.
      const boite = lireBoiteJointe(brut)
      if (boite) await ecrireBoite(boite).catch(() => undefined)
      // Un rappel arrivé après la réponse du téléphone garde la trace de cette réponse.
      const deja = m.attendue && (await lireHistorique()).find(x => x.attendue?.appel === m.attendue?.appel && x.repondu)
      await ajouterMessage(deja?.repondu ? { ...m, repondu: deja.repondu } : m)
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
  const data = (e.notification.data ?? {}) as { ecran?: string; id?: string; fiche?: string }
  const ecran = data.ecran ?? 'historique'
  // Un bouton de réponse : la réponse part d'ici, sans ouvrir l'appli ; une confirmation discrète la remplace.
  if (e.action === 'refus' || e.action.startsWith('choix:')) {
    e.waitUntil(
      (async () => {
        const m = (await lireHistorique()).find(x => x.id === data.id)
        if (!m?.attendue) return
        const c: Contenu = e.action === 'refus' ? { refus: true } : { choix: m.attendue.options[Number(e.action.slice(6))] ?? '' }
        const ok = await repondre(m, c).then(() => true, () => false)
        await self.registration.showNotification(titre(m), {
          body: ok ? `Réponse envoyée : ${dire(c)}` : 'La réponse n’est pas partie : ouvre Hého pour réessayer.',
          tag: e.notification.tag,
          silent: true,
          icon: './icones/icone-192.png',
          badge: './icones/badge-96.png',
          data: { ecran: 'historique', fiche: m.id },
        })
        await prevenirLesFenetres('historique')
      })(),
    )

    return
  }
  // Toucher un appel qui attend une réponse ouvre sa fiche ; sinon, l'écran qui va avec.
  const adresse = data.fiche ? `./?fiche=${encodeURIComponent(data.fiche)}#historique` : `./#${ecran}`
  e.waitUntil(
    (async () => {
      const fenetres = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const ouverte = fenetres[0]
      if (!ouverte) return void (await self.clients.openWindow(adresse))
      ouverte.postMessage({ type: 'aller', ecran, ...(data.fiche ? { fiche: data.fiche } : {}) })
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
