// L'historique, les chantiers et les réglages, dans IndexedDB : le service worker écrit, l'appli lit, hors ligne compris.
import type { Message, Progression, Situation } from './message'

const BASE = 'heho'
const HISTORIQUE = 'historique'
const REGLAGES = 'reglages'
// La dernière progression de chaque session, une par session.
const CHANTIERS = 'chantiers'
// Le mur d'activité : par jour, les briques posées (étapes faites) et les murs finis.
const ACTIVITE = 'activite'
// Au-delà, les plus anciens messages sont effacés.
const GARDER = 200

export type Reglage = { son: boolean; vibration: boolean }
// Un chantier tel que le téléphone le garde : la progression reçue, et l'heure où il a été vu terminé.
export type Chantier = Progression & { finiA?: number }
export type Journee = { jour: string; briques: number; murs: number }

// Le jour, à l'heure du téléphone : « 2026-10-27 ».
export const jourDe = (ms: number): string => {
  const d = new Date(ms)

  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const ouvrir = (): Promise<IDBDatabase> =>
  new Promise((resoudre, rejeter) => {
    const req = indexedDB.open(BASE, 3)
    // Chaque version ajoute ce qui lui manque : un téléphone en version 1 garde son historique.
    req.onupgradeneeded = e => {
      const db = req.result
      if (e.oldVersion < 1) {
        db.createObjectStore(HISTORIQUE, { keyPath: 'id' }).createIndex('date', 'date')
        db.createObjectStore(REGLAGES)
      }
      if (e.oldVersion < 2) db.createObjectStore(CHANTIERS, { keyPath: 'sessionId' })
      if (e.oldVersion < 3) db.createObjectStore(ACTIVITE, { keyPath: 'jour' })
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

export const ecrireChantier = async (c: Chantier): Promise<void> => {
  const db = await ouvrir()
  await attendre(db.transaction(CHANTIERS, 'readwrite').objectStore(CHANTIERS).put(c))
}

export const lireChantier = async (sessionId: string): Promise<Chantier | undefined> => {
  const db = await ouvrir()

  return (await attendre(db.transaction(CHANTIERS).objectStore(CHANTIERS).get(sessionId))) as Chantier | undefined
}

// Du plus récemment mis à jour au plus ancien.
export const lireChantiers = async (): Promise<Chantier[]> => {
  const db = await ouvrir()
  const tous = (await attendre(db.transaction(CHANTIERS).objectStore(CHANTIERS).getAll())) as Chantier[]

  return tous.sort((a, b) => b.date - a.date)
}

export const ajouterActivite = async (jour: string, briques: number, murs: number): Promise<void> => {
  const db = await ouvrir()
  const store = db.transaction(ACTIVITE, 'readwrite').objectStore(ACTIVITE)
  const avant = ((await attendre(store.get(jour))) as Journee | undefined) ?? { jour, briques: 0, murs: 0 }
  await attendre(store.put({ jour, briques: avant.briques + briques, murs: avant.murs + murs }))
}

export const lireActivite = async (): Promise<Map<string, Journee>> => {
  const db = await ouvrir()
  const tous = (await attendre(db.transaction(ACTIVITE).objectStore(ACTIVITE).getAll())) as Journee[]

  return new Map(tous.map(j => [j.jour, j]))
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
