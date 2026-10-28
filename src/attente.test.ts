import { describe, expect, test } from 'vitest'
import { aTraiter, bilanDelais, depuis, direFin, dureeReception, finEstimee, retard, sansRappels, type EtatSession } from './attente'
import { lireMessage, lireProgression, type Message } from './message'
import { estCalme } from './stockage'

const T = 1_000_000_000_000
const appel = (id: string, situation: Message['situation'], date: number, extra: Partial<Message> = {}): Message => ({
  v: 1, id, sessionId: id.split('-')[0]!, session: 'S', couleur: '#cba6f7', situation, texte: 'Quel toit ?', rappel: Number(id.split('-').at(-1)), date, ...extra,
})

// BRIEF.md, « À toi » et « Appel ouvert ».
describe('ce qui attend la personne', () => {
  test('le dernier appel d’une session attend tant que le PC le dit ouvert', () => {
    const m = [appel('a-question-1-0', 'question', T), appel('a-question-1-1', 'question', T + 120_000)]
    const ouvert = new Map<string, EtatSession>([['a', { ouvert: 'a-question-1', date: T + 120_000 }]])
    const r = aTraiter(m, ouvert, [], T + 200_000)
    expect(r.map(x => [x.message.id, x.depuis, x.rappels])).toEqual([['a-question-1-1', T, 1]])
    // Le PC dit que l'appel est réglé : il quitte « À toi ».
    expect(aTraiter(m, new Map([['a', { ouvert: null, date: T + 150_000 }]]), [], T + 200_000)).toEqual([])
  })

  test('sans l’avis du PC, une progression plus récente de la session règle l’appel', () => {
    const m = [appel('a-done-1-0', 'done', T)]
    expect(aTraiter(m, new Map(), [{ sessionId: 'a', date: T + 2_000 }], T + 60_000)).toHaveLength(1)
    expect(aTraiter(m, new Map(), [{ sessionId: 'a', date: T + 60_000 }], T + 90_000)).toEqual([])
  })

  test('une tâche de fond ou un budget ne cachent pas l’appel ; un appel de plus de 24 h ne compte plus', () => {
    const m = [appel('a-permission-1-0', 'permission', T), appel('a-fond-x-0', 'fond', T + 1_000), appel('b-recap-2-0', 'recap', T - 25 * 3600_000)]
    expect(aTraiter(m, new Map(), [], T + 5_000).map(x => x.message.situation)).toEqual(['permission'])
  })

  test('un appel de test n’attend personne', () => {
    const m = [appel('test-123', 'question', T, { sessionId: 'test' }), appel('a-question-1-0', 'question', T, { id: 'test-456' })]
    expect(aTraiter(m, new Map(), [], T + 5_000)).toEqual([])
  })

  test('les rappels d’un même appel ne font qu’une ligne', () => {
    const r = sansRappels([appel('a-question-1-2', 'question', T + 2), appel('a-question-1-0', 'question', T), appel('b-done-1-0', 'done', T + 5)])
    expect(r.map(x => [x.message.id, x.rappels])).toEqual([['b-done-1-0', 0], ['a-question-1-2', 1]])
  })

  test('depuis combien de temps', () => {
    expect(depuis(T, T + 12 * 60_000)).toBe('attend depuis 12 min')
    expect(depuis(T, T + 125 * 60_000)).toBe('attend depuis 2 h 05')
  })
})

describe('la fin estimée et les heures calmes', () => {
  test('la durée moyenne des étapes faites, pour celles qui restent', () => {
    const etapes = [{ statut: 'completed' }, { statut: 'completed' }, { statut: 'in_progress' }, { statut: 'pending' }]
    expect(finEstimee({ debut: T, date: T + 20 * 60_000, etapes })).toBe(T + 40 * 60_000)
    expect(finEstimee({ debut: T, date: T, etapes: [{ statut: 'pending' }] })).toBeNull()
    expect(direFin(new Date(2026, 9, 28, 14, 5).getTime(), new Date(2026, 9, 28, 13, 0).getTime())).toBe('fin vers 14 h 05')
  })

  test('une plage qui passe minuit', () => {
    const h = { actif: true, debut: 22 * 60, fin: 7 * 60 }
    expect(estCalme(h, new Date(2026, 9, 28, 23, 30))).toBe(true)
    expect(estCalme(h, new Date(2026, 9, 28, 6, 59))).toBe(true)
    expect(estCalme(h, new Date(2026, 9, 28, 7, 0))).toBe(false)
    expect(estCalme({ ...h, actif: false }, new Date(2026, 9, 28, 23, 30))).toBe(false)
  })
})

describe('le format des envois', () => {
  test('un appel porte ses questions et son appel ouvert ; un ancien envoi n’en a pas', () => {
    const brut = { ...appel('a-question-1-0', 'question', T), questions: [{ texte: 'Quel toit ?', options: ['Plat', 'Pignon', 7] }], ouvert: 'a-question-1' }
    expect(lireMessage(brut)).toMatchObject({ questions: [{ texte: 'Quel toit ?', options: ['Plat', 'Pignon'] }], ouvert: 'a-question-1' })
    expect(lireMessage(appel('a-question-1-0', 'question', T))).not.toHaveProperty('ouvert')
    expect(lireMessage({ ...appel('a-arret-2-0', 'arret', T) })?.situation).toBe('arret')
    const p = { v: 1, type: 'progression', sessionId: 'a', session: 'S', couleur: '#cba6f7', titre: null, etapes: [], ouvriers: [], date: T, ouvert: null }
    expect(lireProgression(p)?.ouvert).toBeNull()
  })
})

describe('la réception des envois', () => {
  test('un appel arrivé avec plus de 30 s de retard le dit', () => {
    expect(retard({ date: T, recu: T + 130_000 })).toBe(' · reçu 2 min 10 après')
    expect(retard({ date: T, recu: T + 4_000 })).toBe('')
    expect(retard({ date: T })).toBe('')
    expect(dureeReception(120_000)).toBe('2 min')
  })

  test('le délai médian, le pire et les retards', () => {
    expect(bilanDelais([{ delai: 2_000 }, { delai: 130_000 }, { delai: 3_000 }])).toEqual({ median: 3_000, pire: 130_000, enRetard: 1 })
    expect(bilanDelais([])).toBeNull()
  })
})
