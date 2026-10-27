// L'historique, les chantiers et les réglages, dans IndexedDB : le service worker écrit, l'appli lit, hors ligne compris.
import type { Message, Progression, Situation } from './message'

const BASE = 'heho'
const HISTORIQUE = 'historique'
const REGLAGES = 'reglages'
// La dernière progression de chaque session, une par session.
const CHANTIERS = 'chantiers'
// Au-delà, les plus anciens messages sont effacés.
const GARDER = 200

export type Reglage = { son: boolean; vibration: boolean }

const ouvrir = (): Promise<IDBDatabase> =>
  new Promise((resoudre, rejeter) => {
    const req = indexedDB.open(BASE, 2)
    // Chaque version ajoute ce qui lui manque : un téléphone en version 1 garde son historique.
    req.onupgradeneeded = e => {
      const db = req.result
      if (e.oldVersion < 1) {
        db.createObjectStore(HISTORIQUE, { keyPath: 'id' }).createIndex('date', 'date')
        db.createObjectStore(REGLAGES)
      }
      if (e.oldVersion < 2) db.createObjectStore(CHANTIERS, { keyPath: 'sessionId' })
    }
    req.onsuccess = () => resoudre(req.result)
    req.onerror = () => rejeter(req.error)
  })

const attendre = <T>(req: IDBRequest<T>): Promise<T> =>
  new Promise((resoudre, rejeter) => {
    req.onsuccess = () => resoudre(req.result)
    req.onerror = () => rejeter(req.error)
  })

export const ajouterMessage = async (m: Message): Promise<void> => {
  const db = await ouvrir()
  const store = db.transaction(HISTORIQUE, 'readwrite').objectStore(HISTORIQUE)
  await attendre(store.put(m))
  const cles = await attendre(store.index('date').getAllKeys())
  for (const cle of cles.slice(0, Math.max(0, cles.length - GARDER))) store.delete(cle)
}

// Du plus récent au plus ancien.
export const lireHistorique = async (): Promise<Message[]> => {
  const db = await ouvrir()
  const tous = await attendre(db.transaction(HISTORIQUE).objectStore(HISTORIQUE).index('date').getAll())

  return (tous as Message[]).reverse()
}

export const effacerMessage = async (id: string): Promise<void> => {
  const db = await ouvrir()
  await attendre(db.transaction(HISTORIQUE, 'readwrite').objectStore(HISTORIQUE).delete(id))
}

export const viderHistorique = async (): Promise<void> => {
  const db = await ouvrir()
  await attendre(db.transaction(HISTORIQUE, 'readwrite').objectStore(HISTORIQUE).clear())
}

export const ecrireChantier = async (p: Progression): Promise<void> => {
  const db = await ouvrir()
  await attendre(db.transaction(CHANTIERS, 'readwrite').objectStore(CHANTIERS).put(p))
}

// Du plus récemment mis à jour au plus ancien.
export const lireChantiers = async (): Promise<Progression[]> => {
  const db = await ouvrir()
  const tous = (await attendre(db.transaction(CHANTIERS).objectStore(CHANTIERS).getAll())) as Progression[]

  return tous.sort((a, b) => b.date - a.date)
}

export const effacerChantier = async (sessionId: string): Promise<void> => {
  const db = await ouvrir()
  await attendre(db.transaction(CHANTIERS, 'readwrite').objectStore(CHANTIERS).delete(sessionId))
}

export const lireReglage = async (s: Situation): Promise<Reglage> => {
  const db = await ouvrir()
  const r = await attendre(db.transaction(REGLAGES).objectStore(REGLAGES).get(s))

  return (r as Reglage | undefined) ?? { son: true, vibration: true }
}

export const ecrireReglage = async (s: Situation, r: Reglage): Promise<void> => {
  const db = await ouvrir()
  await attendre(db.transaction(REGLAGES, 'readwrite').objectStore(REGLAGES).put(r, s))
}
