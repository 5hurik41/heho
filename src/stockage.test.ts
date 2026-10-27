import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { beforeEach, describe, expect, test } from 'vitest'
import type { Message, Progression, Statut } from './message'
import {
  ajouterBatiments,
  ajouterMessage,
  fusionnerActivite,
  jourDe,
  lireActivite,
  lireChantiers,
  lireHistorique,
  lireQuartier,
  nettoyer,
  recevoirProgression,
  retirerBatiments,
} from './stockage'

// Une base neuve à chaque test.
beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
})

const JOUR = 24 * 3600_000
const MAINTENANT = new Date(2026, 9, 27, 15).getTime()

const plan = (statuts: Statut[], date: number, titre: string | null = 'Maison', sessionId = 's1'): Progression => ({
  v: 1,
  type: 'progression',
  sessionId,
  session: 'VITRINE L3',
  couleur: '#f5c2e7',
  titre,
  etapes: statuts.map((statut, i) => ({ texte: `Étape ${i + 1}`, statut })),
  ouvriers: [],
  date,
})

const batiment = (id: string, date: number) => ({ id, session: 'A', couleur: '#f5c2e7', titre: null, etages: 3, date })

describe('recevoirProgression', () => {
  test('chaque étape faite pose une brique, une seule fois', async () => {
    await recevoirProgression(plan(['completed', 'in_progress', 'pending'], MAINTENANT))
    await recevoirProgression(plan(['completed', 'in_progress', 'pending'], MAINTENANT + 1))
    await recevoirProgression(plan(['completed', 'completed', 'in_progress'], MAINTENANT + 2))
    expect((await lireActivite()).get(jourDe(MAINTENANT))).toEqual({ jour: jourDe(MAINTENANT), briques: 2, murs: 0 })
    expect(await lireQuartier()).toEqual([])
  })

  test('un plan fini devient un bâtiment d’autant d’étages que d’étapes, une seule fois', async () => {
    await recevoirProgression(plan(['completed', 'completed', 'in_progress'], MAINTENANT))
    await recevoirProgression(plan(['completed', 'completed', 'completed'], MAINTENANT + 1))
    await recevoirProgression(plan(['completed', 'completed', 'completed'], MAINTENANT + 2))
    expect((await lireActivite()).get(jourDe(MAINTENANT))).toEqual({ jour: jourDe(MAINTENANT), briques: 3, murs: 1 })
    expect((await lireQuartier()).map(b => [b.id, b.etages])).toEqual([[`s1:${MAINTENANT + 1}`, 3]])
    expect((await lireChantiers())[0]?.finiA).toBe(MAINTENANT + 1)
  })

  test('un autre titre est un nouveau plan : ses étapes faites comptent toutes', async () => {
    await recevoirProgression(plan(['completed', 'completed'], MAINTENANT, 'Maison'))
    await recevoirProgression(plan(['completed', 'pending'], MAINTENANT + 1, 'Garage'))
    expect((await lireActivite()).get(jourDe(MAINTENANT))?.briques).toBe(3)
  })
})

describe('fusionnerActivite', () => {
  test('pour chaque jour, le plus grand des deux comptes : une restauration ne compte rien deux fois', async () => {
    await recevoirProgression(plan(['completed', 'completed', 'pending'], MAINTENANT))
    const jour = jourDe(MAINTENANT)
    await fusionnerActivite([{ jour, briques: 1, murs: 1 }, { jour: '2026-10-01', briques: 4, murs: 0 }])
    await fusionnerActivite([{ jour, briques: 1, murs: 1 }])
    const activite = await lireActivite()
    expect(activite.get(jour)).toEqual({ jour, briques: 2, murs: 1 })
    expect(activite.get('2026-10-01')).toEqual({ jour: '2026-10-01', briques: 4, murs: 0 })
  })
})

describe('ajouterBatiments et retirerBatiments', () => {
  test('un même id remplace, les préfixes retirent', async () => {
    await ajouterBatiments([batiment('s1:1', 1), batiment('essai-1', 2), batiment('essai-2', 3)])
    await ajouterBatiments([{ ...batiment('s1:1', 1), etages: 5 }])
    expect(await retirerBatiments(['essai-'])).toBe(2)
    expect((await lireQuartier()).map(b => [b.id, b.etages])).toEqual([['s1:1', 5]])
  })

  test('le quartier garde ses 60 derniers bâtiments', async () => {
    await ajouterBatiments(Array.from({ length: 65 }, (_, i) => batiment(`s:${i}`, i)))
    const quartier = await lireQuartier()
    expect([quartier.length, quartier[0]?.id]).toEqual([60, 's:5'])
  })
})

describe('nettoyer', () => {
  const message = (id: string, date: number): Message => ({ v: 1, id, sessionId: 's1', session: 'A', couleur: '#f5c2e7', situation: 'done', texte: 'fini', rappel: 0, date })

  test('l’historique perd les appels de plus de 30 jours', async () => {
    await ajouterMessage(message('vieux', MAINTENANT - 31 * JOUR))
    await ajouterMessage(message('limite', MAINTENANT - 29 * JOUR))
    await ajouterMessage(message('recent', MAINTENANT - 1000))
    await nettoyer(MAINTENANT)
    expect((await lireHistorique()).map(m => m.id)).toEqual(['recent', 'limite'])
  })

  test('les chantiers finis ou abandonnés depuis plus de 7 jours quittent l’écran, pas le mur ni le quartier', async () => {
    await recevoirProgression(plan(['completed', 'completed'], MAINTENANT - 8 * JOUR, 'Fini', 'fini'))
    await recevoirProgression(plan(['completed', 'pending'], MAINTENANT - 8 * JOUR, 'Abandonné', 'abandonne'))
    await recevoirProgression(plan(['completed', 'pending'], MAINTENANT - 6 * JOUR, 'En cours', 'en-cours'))
    await nettoyer(MAINTENANT)
    expect((await lireChantiers()).map(c => c.sessionId)).toEqual(['en-cours'])
    expect((await lireQuartier()).length).toBe(1)
    expect((await lireActivite()).get(jourDe(MAINTENANT - 8 * JOUR))?.briques).toBe(3)
  })
})
