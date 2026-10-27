// Les filtres de l'historique : par session et par type, cumulables. Dans une même rangée, une pastille de plus
// élargit (cette session OU celle-là) ; d'une rangée à l'autre, elles se combinent (cette session ET ce type).
import { LIBELLES, type Message, type Situation } from './message'

export type Filtres = { sessions: Set<string>; types: Set<string> }

// Le lancement et la fin d'une tâche de fond sont un seul type pour le filtre.
export const typeDe = (s: Situation): string => (s === 'fond-fini' ? 'fond' : s)

export const filtrer = (messages: Message[], f: Filtres): Message[] =>
  messages.filter(m => (f.sessions.size === 0 || f.sessions.has(m.session)) && (f.types.size === 0 || f.types.has(typeDe(m.situation))))

// Les pastilles à proposer : les sessions et les types présents dans l'historique, dans l'ordre d'arrivée,
// plus ceux déjà choisis (un filtre actif ne disparaît pas de sous le doigt).
export const pastilles = (messages: Message[], f: Filtres): { sessions: { nom: string; couleur: string }[]; types: { type: string; libelle: string }[] } => {
  const sessions = new Map<string, string>()
  const types = new Map<string, string>()
  const libelle = (type: string) => (type === 'fond' ? 'Fond' : (LIBELLES[type as Situation] ?? type))
  for (const m of messages) {
    if (!sessions.has(m.session)) sessions.set(m.session, m.couleur)
    if (!types.has(typeDe(m.situation))) types.set(typeDe(m.situation), libelle(typeDe(m.situation)))
  }
  for (const s of f.sessions) if (!sessions.has(s)) sessions.set(s, '#3A3C40')
  for (const t of f.types) if (!types.has(t)) types.set(t, libelle(t))

  return {
    sessions: [...sessions].map(([nom, couleur]) => ({ nom, couleur })),
    types: [...types].map(([type, libelle]) => ({ type, libelle })),
  }
}
