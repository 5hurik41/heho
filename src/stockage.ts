// L'historique et les réglages, dans IndexedDB : le service worker écrit, l'appli lit, hors ligne compris.
import type { Message, Situation } from './message'

const BASE = 'heho'
const HISTORIQUE = 'historique'
const REGLAGES = 'reglages'
// Au-delà, les plus anciens messages sont effacés.
const GARDER = 200

export type Reglage = { son: boolean; vibration: boolean }

const ouvrir = (): Promise<IDBDatabase> =>
  new Promise((resoudre, rejeter) => {
    const req = indexedDB.open(BASE, 1)
    req.onupgradeneeded = () => {
      const db = req.result
      db.createObjectStore(HISTORIQUE, { keyPath: 'id' }).createIndex('date', 'date')
      db.createObjectStore(REGLAGES)
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

export const lireReglage = async (s: Situation): Promise<Reglage> => {
  const db = await ouvrir()
  const r = await attendre(db.transaction(REGLAGES).objectStore(REGLAGES).get(s))

  return (r as Reglage | undefined) ?? { son: true, vibration: true }
}

export const ecrireReglage = async (s: Situation, r: Reglage): Promise<void> => {
  const db = await ouvrir()
  await attendre(db.transaction(REGLAGES, 'readwrite').objectStore(REGLAGES).put(r, s))
}
