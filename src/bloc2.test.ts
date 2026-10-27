import { describe, expect, test } from 'vitest'
import { racineAppel } from './fiche'
import { filtrer, pastilles, typeDe, type Filtres } from './filtres'
import { dans, ecranForfait } from './forfait'
import { lireForfait, lireMessage, type Message, type Situation } from './message'

const appel = (id: string, session: string, situation: Situation): Message => ({
  v: 1,
  id,
  sessionId: session,
  session,
  couleur: '#f5c2e7',
  situation,
  texte: 'x',
  rappel: 0,
  date: 1,
})

describe('lireForfait', () => {
  const forfait = { semaine: { pourcent: 40, remise: 2, projection: 70 }, cinqHeures: { pourcent: 12.5, remise: null }, date: 1 }

  test('le forfait se lit sur n’importe quel push, et ne gêne pas la lecture de l’appel', () => {
    const brut = { ...appel('a-0', 'A', 'question'), forfait }
    expect(lireForfait(brut)).toEqual(forfait)
    expect(lireMessage(brut)).toEqual(appel('a-0', 'A', 'question'))
  })

  test('absent ou mal formé : rien, et une fenêtre manquante reste null', () => {
    expect(lireForfait(appel('a-0', 'A', 'question'))).toBeNull()
    expect(lireForfait({ forfait: { semaine: { pourcent: 'beaucoup' }, date: 1 } })).toBeNull()
    expect(lireForfait({ forfait: { semaine: { pourcent: 40, remise: null }, date: 1 } })).toEqual({
      semaine: { pourcent: 40, remise: null, projection: null },
      cinqHeures: null,
      date: 1,
    })
  })

  test('le bilan est une situation reconnue', () => {
    expect(lireMessage(appel('bilan-2026-10-27-0', 'HÉHO', 'bilan'))?.situation).toBe('bilan')
  })
})

describe('écran Forfait', () => {
  const H = 3600_000

  test('le temps jusqu’à la remise', () => {
    expect([dans(12 * 60_000), dans(3 * H + 10 * 60_000), dans(3 * H), dans(52 * H), dans(48 * H), dans(-1)]).toEqual([
      'dans 12 min',
      'dans 3 h 10',
      'dans 3 h',
      'dans 2 j 4 h',
      'dans 2 j',
      'passée',
    ])
  })

  test('le mur pose une brique par 5 %, la projection en pointillés, l’alerte passé 75 %', () => {
    const page = (pourcent: number, projection: number | null) =>
      ecranForfait({ semaine: { pourcent, remise: null, projection }, cinqHeures: null, date: 0 }, 0)
    const compter = (html: string, classe: string) => html.match(new RegExp(`<i class="[^"]*\\b${classe}\\b`, 'g'))?.length ?? 0
    expect([compter(page(40, 70), 'pleine'), compter(page(40, 70), 'prevue')]).toEqual([8, 1])
    expect(page(40, 70)).not.toContain('mur-forfait alerte')
    expect(page(80, 130)).toContain('mur-forfait alerte')
    expect(page(80, 130)).toMatch(/class="projection depasse">[^<]*130 %/)
  })

  test('sans mesure, l’écran le dit', () => {
    expect(ecranForfait(undefined)).toContain('Pas encore de mesure')
  })
})

describe('filtres de l’historique', () => {
  const messages = [appel('1', 'VITRINE', 'question'), appel('2', 'HEHO', 'fond'), appel('3', 'HEHO', 'fond-fini'), appel('4', 'VITRINE', 'done')]
  const f = (sessions: string[], types: string[]): Filtres => ({ sessions: new Set(sessions), types: new Set(types) })

  test('dans une rangée on élargit, d’une rangée à l’autre on combine', () => {
    expect(filtrer(messages, f([], [])).length).toBe(4)
    expect(filtrer(messages, f(['VITRINE', 'HEHO'], [])).length).toBe(4)
    expect(filtrer(messages, f([], ['fond'])).map(m => m.id)).toEqual(['2', '3'])
    expect(filtrer(messages, f(['VITRINE'], ['fond'])).length).toBe(0)
  })

  test('les pastilles : sessions et types présents, et ceux déjà choisis', () => {
    const p = pastilles(messages, f(['PARTIE'], ['recap']))
    expect(p.sessions.map(s => s.nom)).toEqual(['VITRINE', 'HEHO', 'PARTIE'])
    expect(p.types.map(t => t.libelle)).toEqual(['Question', 'Fond', 'Terminé', 'Récap'])
    expect(typeDe('fond-fini')).toBe('fond')
  })
})

test('un appel et ses rappels partagent leur racine', () => {
  expect(['abcdef12-question-3-0', 'abcdef12-question-3-2'].map(racineAppel)).toEqual(['abcdef12-question-3', 'abcdef12-question-3'])
})
