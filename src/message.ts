// Le contenu d'un push, tel que le mod notify-worker l'envoie (chiffré en aes128gcm, JSON une fois déchiffré).
// C'est la seule définition du format : le mod s'y réfère.

// « fond » : une tâche lancée en arrière-plan ; « fond-fini » : la même, terminée, qui remplace son lancement.
export const SITUATIONS = ['question', 'permission', 'done', 'recap', 'budget', 'fond', 'fond-fini'] as const
export type Situation = (typeof SITUATIONS)[number]
// Celles qui attendent une réponse de la personne : l'historique les marque d'une bande de rubalise.
export const ATTENTES: readonly Situation[] = ['question', 'permission', 'recap']
// Celles dont on règle le son et la vibration dans Réglages : toutes (BRIEF.md, « Tâches de fond »).
export const REGLABLES: readonly Situation[] = SITUATIONS

export type Message = {
  v: 1
  // Unique par envoi : un rappel a son propre id.
  id: string
  // Une session = une notification : les rappels de la même session la remplacent.
  sessionId: string
  // Le nom et la couleur du badge, venus du mod session-badge (« VITRINE L3 », « #f9e2af »).
  session: string
  couleur: string
  situation: Situation
  texte: string
  // 0 au premier envoi, puis 1, 2, 3 pour les rappels à 2, 5 et 10 minutes.
  rappel: number
  // Millisecondes depuis 1970, heure du PC.
  date: number
  // Une tâche de fond : l'id de l'appel qui l'a lancée. Sa fin remplace la notification de son lancement.
  tache?: string
}

// Le PC envoie la situation, l'appli écrit le titre (BRIEF.md, « Langue de l'interface »).
export const TITRES: Record<Situation, string> = {
  question: 'Claude te pose une question',
  permission: 'Claude demande ta permission',
  done: 'Claude a fini',
  recap: 'Récap avec des questions',
  budget: 'Alerte budget',
  fond: 'Tâche de fond lancée',
  'fond-fini': 'Tâche de fond terminée',
}

// Le libellé court, dans l'historique.
export const LIBELLES: Record<Situation, string> = {
  question: 'Question',
  permission: 'Permission',
  done: 'Terminé',
  recap: 'Récap',
  budget: 'Budget',
  fond: 'En fond',
  'fond-fini': 'Fond fini',
}

// L'ouvrier de chaque situation (public/ouvriers/, public/notifications/) : les deux temps d'une tâche de fond
// partagent le coursier.
export const OUVRIER: Record<Situation, string> = {
  question: 'question',
  permission: 'permission',
  done: 'done',
  recap: 'recap',
  budget: 'budget',
  fond: 'fond',
  'fond-fini': 'fond',
}

export const titre = (m: Message): string => `${m.session} · ${TITRES[m.situation]}`

// Les 10 couleurs de badge : la liste AUTO de session-badge, à laquelle notify-worker ramène toute autre
// couleur. scripts/generer-icones.mts fait une grande image par situation et par couleur.
export const BADGES = ['cba6f7', 'a6e3a1', 'fab387', '89b4fa', 'f5c2e7', '94e2d5', 'f9e2af', 'f38ba8', '74c7ec', 'b4befe']

// La grande image de la notification, ou rien pour une couleur sans image.
export const image = (m: Message): string | undefined => {
  const badge = m.couleur.slice(1).toLowerCase()

  return BADGES.includes(badge) ? `./notifications/${OUVRIER[m.situation]}-${badge}.png` : undefined
}

const chaine = (x: unknown): x is string => typeof x === 'string' && x.length > 0 && x.length < 2000
const nombre = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x)

// Un push mal formé est ignoré plutôt que d'afficher n'importe quoi.
export const lireMessage = (brut: unknown): Message | null => {
  if (typeof brut !== 'object' || brut === null) return null
  const m = brut as Record<string, unknown>
  if (m.v !== 1) return null
  if (!chaine(m.id) || !chaine(m.sessionId) || !chaine(m.session) || !chaine(m.texte)) return null
  if (typeof m.couleur !== 'string' || !/^#[0-9a-f]{6}$/i.test(m.couleur)) return null
  if (!SITUATIONS.includes(m.situation as Situation)) return null
  if (!nombre(m.rappel) || !nombre(m.date)) return null
  if (m.tache !== undefined && !chaine(m.tache)) return null

  return {
    v: 1,
    id: m.id,
    sessionId: m.sessionId,
    session: m.session,
    couleur: m.couleur,
    situation: m.situation as Situation,
    texte: m.texte,
    rappel: m.rappel,
    date: m.date,
    ...(m.tache ? { tache: m.tache } : {}),
  }
}

// ── La progression d'un chantier : le plan de task-steps, envoyé à chaque étape franchie ──
// Un push de progression porte `type: 'progression'` ; un appel n'a pas de champ `type`.

export const ROLES = ['builder', 'researcher', 'mechanic', 'foreman', 'painter', 'courier', 'thinker', 'resting'] as const
export type Role = (typeof ROLES)[number]
export type Statut = 'pending' | 'in_progress' | 'completed'

export type Progression = {
  v: 1
  type: 'progression'
  sessionId: string
  session: string
  couleur: string
  titre: string | null
  etapes: { texte: string; statut: Statut }[]
  // Les rôles des ouvriers au travail dans la session (Claude et ses sous-agents), pour l'animation.
  ouvriers: Role[]
  date: number
}

export const faites = (p: Progression): number => p.etapes.filter(e => e.statut === 'completed').length
export const enCours = (p: Progression): string | undefined => p.etapes.find(e => e.statut === 'in_progress')?.texte
export const estFini = (p: Progression): boolean => p.etapes.length > 0 && faites(p) === p.etapes.length

const STATUTS: readonly string[] = ['pending', 'in_progress', 'completed']

export const lireProgression = (brut: unknown): Progression | null => {
  if (typeof brut !== 'object' || brut === null) return null
  const p = brut as Record<string, unknown>
  if (p.v !== 1 || p.type !== 'progression') return null
  if (!chaine(p.sessionId) || !chaine(p.session) || !nombre(p.date)) return null
  if (typeof p.couleur !== 'string' || !/^#[0-9a-f]{6}$/i.test(p.couleur)) return null
  if (p.titre !== null && !chaine(p.titre)) return null
  if (!Array.isArray(p.etapes) || p.etapes.length > 30 || !Array.isArray(p.ouvriers)) return null
  const etapes = p.etapes.flatMap(e => {
    const { texte, statut } = (e ?? {}) as Record<string, unknown>

    return chaine(texte) && typeof statut === 'string' && STATUTS.includes(statut) ? [{ texte, statut: statut as Statut }] : []
  })
  const ouvriers = p.ouvriers.filter((r): r is Role => ROLES.includes(r as Role)).slice(0, 4)

  return { v: 1, type: 'progression', sessionId: p.sessionId, session: p.session, couleur: p.couleur, titre: p.titre, etapes, ouvriers, date: p.date }
}

// ── La sauvegarde : le PC renvoie le mur du chef et le quartier à un téléphone (nouvelle association, /heho restaurer) ──
// Le PC tient le même compte que le téléphone ; un envoi trop lourd pour un push part en plusieurs morceaux.

export type Sauvegarde = {
  v: 1
  type: 'sauvegarde'
  // Le numéro du morceau, pour que les morceaux ne se remplacent pas chez le service de push.
  sessionId: string
  jours: [jour: string, briques: number, murs: number][]
  batiments: { id: string; session: string; couleur: string; titre: string | null; etages: number; date: number }[]
  // Des préfixes d'id : les bâtiments qui commencent ainsi quittent le quartier (« essai- » pour des bâtiments de test).
  retirer?: string[]
}

export const lireSauvegarde = (brut: unknown): Sauvegarde | null => {
  if (typeof brut !== 'object' || brut === null) return null
  const s = brut as Record<string, unknown>
  if (s.v !== 1 || s.type !== 'sauvegarde' || !chaine(s.sessionId) || !Array.isArray(s.jours) || !Array.isArray(s.batiments)) return null
  const jours = s.jours.filter(
    (j): j is [string, number, number] =>
      Array.isArray(j) && typeof j[0] === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(j[0]) && nombre(j[1]) && nombre(j[2]),
  )
  const batiments = s.batiments.flatMap(b => {
    const { id, session, couleur, titre, etages, date } = (b ?? {}) as Record<string, unknown>
    const valide =
      chaine(id) && chaine(session) && typeof couleur === 'string' && /^#[0-9a-f]{6}$/i.test(couleur) &&
      (titre === null || chaine(titre)) && nombre(etages) && nombre(date)

    return valide ? [{ id, session, couleur, titre: titre as string | null, etages, date }] : []
  })

  const retirer = Array.isArray(s.retirer) ? s.retirer.filter(chaine) : []

  return { v: 1, type: 'sauvegarde', sessionId: s.sessionId, jours, batiments, ...(retirer.length ? { retirer } : {}) }
}
