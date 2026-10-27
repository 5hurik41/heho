import { describe, expect, test } from 'vitest'
import { lireMessage, lireProgression, lireSauvegarde } from './message'

const appel = { v: 1, id: 'a-1-0', sessionId: 's1', session: 'VITRINE L3', couleur: '#f5c2e7', situation: 'question', texte: 'Quel pli ?', rappel: 0, date: 1 }

describe('lireMessage', () => {
  test('un appel bien formé passe tel quel', () => {
    expect(lireMessage(appel)).toEqual(appel)
    expect(lireMessage({ ...appel, situation: 'fond', tache: 'toolu_1' })?.tache).toBe('toolu_1')
  })

  test('un push mal formé est ignoré', () => {
    for (const brut of [null, 'texte', { ...appel, v: 2 }, { ...appel, situation: 'inconnue' }, { ...appel, couleur: 'rose' }, { ...appel, texte: '' }, { ...appel, date: Number.NaN }, { ...appel, tache: 3 }])
      expect(lireMessage(brut)).toBeNull()
  })

  test('les champs en trop ne passent pas', () => {
    expect(lireMessage({ ...appel, html: '<b>x</b>' })).toEqual(appel)
  })
})

describe('lireProgression', () => {
  const progression = { v: 1, type: 'progression', sessionId: 's1', session: 'VITRINE L3', couleur: '#f5c2e7', titre: 'Maison', etapes: [{ texte: 'Dalle', statut: 'completed' }], ouvriers: ['builder'], date: 1 }

  test('une progression bien formée passe', () => {
    expect(lireProgression(progression)).toEqual(progression)
  })

  test('les étapes et les ouvriers inconnus sont écartés, pas toute la progression', () => {
    const p = lireProgression({ ...progression, etapes: [...progression.etapes, { texte: 'X', statut: 'perdu' }], ouvriers: ['builder', 'pirate'] })
    expect([p?.etapes.length, p?.ouvriers]).toEqual([1, ['builder']])
  })

  test('un appel n’est pas une progression, et l’inverse', () => {
    expect(lireProgression(appel)).toBeNull()
    expect(lireMessage(progression)).toBeNull()
    expect(lireProgression({ ...progression, etapes: Array(31).fill(progression.etapes[0]) })).toBeNull()
  })
})

describe('lireSauvegarde', () => {
  test('garde les jours et bâtiments valides, et les préfixes à retirer', () => {
    const s = lireSauvegarde({
      v: 1,
      type: 'sauvegarde',
      sessionId: 'partie-0',
      jours: [['2026-10-27', 3, 1], ['hier', 1, 0]],
      batiments: [{ id: 's1:1', session: 'A', couleur: '#f5c2e7', titre: null, etages: 3, date: 1 }, { id: 's2:1' }],
      retirer: ['essai-', 4],
    })
    expect(s).toEqual({
      v: 1,
      type: 'sauvegarde',
      sessionId: 'partie-0',
      jours: [['2026-10-27', 3, 1]],
      batiments: [{ id: 's1:1', session: 'A', couleur: '#f5c2e7', titre: null, etages: 3, date: 1 }],
      retirer: ['essai-'],
    })
  })
})
