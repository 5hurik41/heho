// L'historique, les chantiers et les réglages, dans IndexedDB : le service worker écrit, l'appli lit, hors ligne compris.
import { estFini, faites, type Message, type Progression, type Situation } from './message'

const BASE = 'heho'
const HISTORIQUE = 'historique'
const REGLAGES = 'reglages'
// La dernière progression de chaque session, une par session.
const CHANTIERS = 'chantiers'
// Le mur d'activité : par jour, les briques posées (étapes faites) et les murs finis.
const ACTIVITE = 'activite'
// Le quartier : chaque mur fini devient un bâtiment de la ligne d'horizon. Il garde ses derniers bâtiments.
const QUARTIER = 'quartier'
const BATIMENTS_MAX = 60
// Au-delà, les plus anciens messages sont effacés.
const GARDER = 200
// Le nettoyage (BRIEF.md, « La suite », bloc 1) : un appel quitte l'historique après 30 jours ; un chantier, fini ou
// abandonné, quitte l'écran Chantiers 7 jours après sa dernière progression. Le mur du chef et le quartier restent.
const JOUR_MS = 24 * 3600_000
const HISTORIQUE_MS = 30 * JOUR_MS
const CHANTIER_MS = 7 * JOUR_MS

export type Reglage = { son: boolean; vibration: boolean }
// Un chantier tel que le téléphone le garde : la progression reçue, et l'heure où il a été vu terminé.
export type Chantier = Progression & { finiA?: number }
export type Journee = { jour: string; briques: number; murs: number }
// Un bâtiment du quartier : un chantier fini, autant d'étages que d'étapes.
export type Batiment = { id: string; session: string; couleur: string; titre: string | null; etages: number; date: number }

// Le jour, à l'heure du téléphone : « 2026-10-27 ».
export const jourDe = (ms: number): string => {
  const d = new Date(ms)

  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const ouvrir = (): Promise<IDBDatabase> =>
  new Promise((resoudre, rejeter) => {
    const req = indexedDB.open(BASE, 4)
    // Chaque version ajoute ce qui lui manque : un téléphone en version 1 garde son historique.
    req.onupgradeneeded = e => {
      const db = req.result
      if (e.oldVersion < 1) {
        db.createObjectStore(HISTORIQUE, { keyPath: 'id' }).createIndex('date', 'date')
        db.createObjectStore(REGLAGES)
      }
      if (e.oldVersion < 2) db.createObjectStore(CHANTIERS, { keyPath: 'sessionId' })
      if (e.oldVersion < 3) db.createObjectStore(ACTIVITE, { keyPath: 'jour' })
      if (e.oldVersion < 4) db.createObjectStore(QUARTIER, { keyPath: 'id' }).createIndex('date', 'date')
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

// Une restauration depuis le PC : pour chaque jour, le plus grand des deux comptes (rien ne compte deux fois).
export const fusionnerActivite = async (journees: Journee[]): Promise<void> => {
  const db = await ouvrir()
  const store = db.transaction(ACTIVITE, 'readwrite').objectStore(ACTIVITE)
  for (const j of journees) {
    const avant = ((await attendre(store.get(j.jour))) as Journee | undefined) ?? { jour: j.jour, briques: 0, murs: 0 }
    await attendre(store.put({ jour: j.jour, briques: Math.max(avant.briques, j.briques), murs: Math.max(avant.murs, j.murs) }))
  }
}

// Ajoute ou remplace des bâtiments (même id, même chantier fini), puis ne garde que les plus récents.
export const ajouterBatiments = async (batiments: Batiment[]): Promise<void> => {
  const db = await ouvrir()
  const store = db.transaction(QUARTIER, 'readwrite').objectStore(QUARTIER)
  for (const b of batiments) await attendre(store.put(b))
  const cles = await attendre(store.index('date').getAllKeys())
  for (const cle of cles.slice(0, Math.max(0, cles.length - BATIMENTS_MAX))) store.delete(cle)
}

// Du plus ancien au plus récent : la ligne d'horizon se lit de gauche à droite.
export const lireQuartier = async (): Promise<Batiment[]> => {
  const db = await ouvrir()

  return (await attendre(db.transaction(QUARTIER).objectStore(QUARTIER).index('date').getAll())) as Batiment[]
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

// Les briques que cette progression ajoute au mur d'activité : les étapes faites depuis la précédente du même
// plan (un autre titre est un nouveau plan), et un mur de plus s'il vient d'être fini. Le mod notify-worker tient
// le même compte (`compter`), avec les mêmes règles.
export const recevoirProgression = async (p: Progression): Promise<void> => {
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

// Efface les appels et les chantiers trop vieux ; à chaque push reçu et à chaque ouverture de l'appli.
export const nettoyer = async (maintenant = Date.now()): Promise<void> => {
  const db = await ouvrir()
  const t = db.transaction([HISTORIQUE, CHANTIERS], 'readwrite')
  const appels = t.objectStore(HISTORIQUE)
  for (const cle of await attendre(appels.index('date').getAllKeys(IDBKeyRange.upperBound(maintenant - HISTORIQUE_MS, true)))) appels.delete(cle)
  const chantiers = t.objectStore(CHANTIERS)
  for (const c of (await attendre(chantiers.getAll())) as Chantier[]) if (c.date < maintenant - CHANTIER_MS) chantiers.delete(c.sessionId)
  await new Promise<void>((resoudre, rejeter) => {
    t.oncomplete = () => resoudre()
    t.onerror = () => rejeter(t.error)
  })
}

// Retire du quartier les bâtiments dont l'id commence par l'un de ces préfixes ; renvoie combien sont partis.
export const retirerBatiments = async (prefixes: string[]): Promise<number> => {
  const db = await ouvrir()
  const store = db.transaction(QUARTIER, 'readwrite').objectStore(QUARTIER)
  const cles = (await attendre(store.getAllKeys())) as string[]
  const partants = cles.filter(c => prefixes.some(p => c.startsWith(p)))
  for (const c of partants) await attendre(store.delete(c))

  return partants.length
}
