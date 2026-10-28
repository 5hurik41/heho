// Ce qui attend la personne (BRIEF.md, « À toi » et « Appel ouvert ») : par session, son dernier appel, s'il est
// d'un genre qui attend et toujours ouvert. Le PC le dit quand il le sait (`ouvert`) ; sinon, une progression de la
// session plus récente que l'appel montre qu'elle est repartie.
import { appelDe, ATTENTES, type Message } from './message'

// Le dernier `ouvert` reçu d'une session, et l'heure de l'envoi qui le portait.
export type EtatSession = { ouvert: string | null; date: number }
export type ATraiter = { message: Message; depuis: number; rappels: number }

// Un appel plus vieux ne compte plus : la session a sûrement été fermée sans prévenir.
const PERIME_MS = 24 * 3600_000
// Une progression partie dans la foulée de l'appel (la fin d'un tour) ne le règle pas.
const MARGE_MS = 5_000
// Ces envois ne disent rien de l'avancement de la session.
const NEUTRES = new Set(['budget', 'bilan', 'fond', 'fond-fini'])

const estTest = (m: Message): boolean => m.sessionId === 'test' || m.id.startsWith('test-')

export const aTraiter = (messages: Message[], etats: Map<string, EtatSession>, chantiers: { sessionId: string; date: number }[], maintenant = Date.now()): ATraiter[] => {
  const derniers = new Map<string, Message>()
  for (const m of messages) {
    // Un appel de test (Réglages, /heho test) n'attend personne : aucune session ne viendrait le régler.
    if (NEUTRES.has(m.situation) || estTest(m)) continue
    const d = derniers.get(m.sessionId)
    if (!d || m.date > d.date) derniers.set(m.sessionId, m)
  }
  const resultat: ATraiter[] = []
  for (const m of derniers.values()) {
    if (!ATTENTES.includes(m.situation) || maintenant - m.date > PERIME_MS) continue
    const appel = appelDe(m)
    const etat = etats.get(m.sessionId)
    const ouvert =
      etat && etat.date >= m.date
        ? etat.ouvert === appel
        : m.ouvert !== undefined
          ? m.ouvert === appel
          : !chantiers.some(c => c.sessionId === m.sessionId && c.date > m.date + MARGE_MS)
    if (!ouvert) continue
    const memes = messages.filter(x => appelDe(x) === appel)
    resultat.push({ message: m, depuis: Math.min(...memes.map(x => x.date)), rappels: memes.length - 1 })
  }

  return resultat.sort((a, b) => a.depuis - b.depuis)
}

// L'historique sans les rappels : un appel n'y paraît qu'une fois, à son dernier envoi, avec son nombre de rappels.
export const sansRappels = (messages: Message[]): { message: Message; rappels: number }[] => {
  const vus = new Map<string, { message: Message; rappels: number }>()
  for (const m of messages) {
    const a = appelDe(m)
    const v = vus.get(a)
    if (!v) vus.set(a, { message: m, rappels: 0 })
    else {
      v.rappels += 1
      if (m.date > v.message.date) v.message = m
    }
  }

  return [...vus.values()].sort((a, b) => b.message.date - a.message.date)
}

// « attend depuis 12 min », « depuis 2 h 05 ».
export const depuis = (date: number, maintenant = Date.now()): string => {
  const min = Math.max(0, Math.round((maintenant - date) / 60_000))
  if (min < 1) return "attend depuis moins d'une minute"
  if (min < 60) return `attend depuis ${min} min`

  return `attend depuis ${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}`
}

// La fin estimée d'un chantier en cours : la durée moyenne de ses étapes faites, depuis le début du plan, pour
// chacune de celles qui restent (BRIEF.md, « Fin estimée »). Rien sans au moins une étape faite.
export const finEstimee = (c: { debut?: number; date: number; etapes: { statut: string }[] }): number | null => {
  const faites = c.etapes.filter(e => e.statut === 'completed').length
  const reste = c.etapes.length - faites
  if (!c.debut || faites === 0 || reste === 0 || c.date <= c.debut) return null

  return c.date + ((c.date - c.debut) / faites) * reste
}

// « fin vers 14 h 20 », ou « fin imminente » quand l'heure est passée.
export const direFin = (fin: number, maintenant = Date.now()): string => {
  if (fin <= maintenant) return 'fin imminente'
  const d = new Date(fin)

  return `fin vers ${d.getHours()} h ${String(d.getMinutes()).padStart(2, '0')}`
}
