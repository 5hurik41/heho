// L'historique, les chantiers et les réglages, dans IndexedDB : le service worker écrit, l'appli lit, hors ligne compris.
import { gagnees, MEDAILLES, type Medaille } from './medailles'
import { estFini, faites, type Cle, type Forfait, type Message, type Progression, type Situation } from './message'

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
// Le dernier état du forfait reçu du PC, une seule entrée.
const FORFAIT = 'forfait'
// Les médailles gagnées et leur date ; l'entrée DEJA_VU marque le premier calcul, fait en silence.
const MEDAILLES_GAGNEES = 'medailles'
const DEJA_VU = '__premier-calcul'
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
// Un bâtiment du quartier : un chantier fini, autant d'étages que d'étapes. `etapes`, le texte de chacune pour sa
// fiche, n'existe que pour ceux vus finir sur ce téléphone : la sauvegarde du PC ne les porte pas (un push pèse 4 Ko).
export type Batiment = { id: string; session: string; couleur: string; titre: string | null; etages: number; date: number; etapes?: string[] }

// Le jour, à l'heure du téléphone : « 2026-10-27 ».
export const jourDe = (ms: number): string => {
  const d = new Date(ms)

  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const ouvrir = (): Promise<IDBDatabase> =>
  new Promise((resoudre, rejeter) => {
    const req = indexedDB.open(BASE, 6)
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
      if (e.oldVersion < 5) db.createObjectStore(FORFAIT)
      if (e.oldVersion < 6) db.createObjectStore(MEDAILLES_GAGNEES)
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

// Note la réponse du téléphone sur l'appel et tous ses rappels (même `attendue.appel`) : on n'y répond qu'une fois.
export const marquerRepondu = async (appel: string, texte: string, maintenant = Date.now()): Promise<void> => {
  const store = (await ouvrir()).transaction(HISTORIQUE, 'readwrite').objectStore(HISTORIQUE)
  for (const m of (await attendre(store.getAll())) as Message[])
    if (m.attendue?.appel === appel) await attendre(store.put({ ...m, repondu: { texte, date: maintenant } }))
}

// La boîte aux lettres des réponses, reçue du PC (push `cle`), dans les réglages.
export const ecrireBoite = async (c: Cle): Promise<void> => {
  const db = await ouvrir()
  await attendre(db.transaction(REGLAGES, 'readwrite').objectStore(REGLAGES).put(c, 'boite'))
}

export const lireBoite = async (): Promise<Cle | undefined> => {
  const db = await ouvrir()

  return (await attendre(db.transaction(REGLAGES).objectStore(REGLAGES).get('boite'))) as Cle | undefined
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

// Ajoute ou remplace des bâtiments (même id, même chantier fini), puis ne garde que les plus récents. Un bâtiment
// repris du PC garde les étapes que ce téléphone connaissait.
export const ajouterBatiments = async (batiments: Batiment[]): Promise<void> => {
  const db = await ouvrir()
  const store = db.transaction(QUARTIER, 'readwrite').objectStore(QUARTIER)
  for (const b of batiments) {
    const etapes = b.etapes ?? ((await attendre(store.get(b.id))) as Batiment | undefined)?.etapes
    await attendre(store.put(etapes ? { ...b, etapes } : b))
  }
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

// Le son et la vibration de chaque situation, et de l'annonce d'une médaille.
export type Reglable = Situation | 'medaille'

export const lireReglage = async (s: Reglable): Promise<Reglage> => {
  const db = await ouvrir()
  const r = await attendre(db.transaction(REGLAGES).objectStore(REGLAGES).get(s))

  return (r as Reglage | undefined) ?? { son: true, vibration: true }
}

export const ecrireReglage = async (s: Reglable, r: Reglage): Promise<void> => {
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
    await ajouterBatiments([
      { id: `${p.sessionId}:${p.date}`, session: p.session, couleur: p.couleur, titre: p.titre, etages: p.etapes.length, date: p.date, etapes: p.etapes.map(e => e.texte) },
    ])
}

// Garde l'état du forfait s'il est plus récent que celui qu'on a : deux sessions peuvent l'envoyer dans le désordre.
export const ecrireForfait = async (f: Forfait): Promise<void> => {
  const db = await ouvrir()
  const store = db.transaction(FORFAIT, 'readwrite').objectStore(FORFAIT)
  const avant = (await attendre(store.get('dernier'))) as Forfait | undefined
  if (!avant || avant.date <= f.date) await attendre(store.put(f, 'dernier'))
}

export const lireForfaitGarde = async (): Promise<Forfait | undefined> => {
  const db = await ouvrir()

  return (await attendre(db.transaction(FORFAIT).objectStore(FORFAIT).get('dernier'))) as Forfait | undefined
}

// Les médailles gagnées, et leur date.
export const lireMedailles = async (): Promise<Map<string, number>> => {
  const store = (await ouvrir()).transaction(MEDAILLES_GAGNEES).objectStore(MEDAILLES_GAGNEES)
  const [cles, dates] = await Promise.all([attendre(store.getAllKeys()), attendre(store.getAll())])

  return new Map((cles as string[]).map((c, i): [string, number] => [c, dates[i] as number]).filter(([c]) => c !== DEJA_VU))
}

// Note les médailles nouvellement gagnées et les rend, à annoncer. Le tout premier calcul (une mise à jour de
// l'appli sur un téléphone qui a déjà un passé), et un calcul `silencieux` (une restauration du PC), les notent
// sans les rendre : pas d'avalanche de notifications pour le passé.
export const decernerMedailles = async (silencieux = false, maintenant = Date.now()): Promise<Medaille[]> => {
  const [activite, quartier] = await Promise.all([lireActivite(), lireQuartier()])
  const ids = gagnees([...activite.values()], quartier)
  const store = (await ouvrir()).transaction(MEDAILLES_GAGNEES, 'readwrite').objectStore(MEDAILLES_GAGNEES)
  const deja = new Set((await attendre(store.getAllKeys())) as string[])
  const premier = !deja.has(DEJA_VU)
  const nouvelles = MEDAILLES.filter(m => ids.has(m.id) && !deja.has(m.id))
  for (const m of nouvelles) await attendre(store.put(maintenant, m.id))
  if (premier) await attendre(store.put(maintenant, DEJA_VU))

  return premier || silencieux ? [] : nouvelles
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
