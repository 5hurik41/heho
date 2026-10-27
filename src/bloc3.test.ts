import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { beforeEach, describe, expect, test } from 'vitest'
import { avancer, etages, LARGEUR, nouvellePartie, poser } from './jeu'
import { gagnees, grilleMedaille, MEDAILLES, plusLongueSerie } from './medailles'
import { decernerMedailles, fusionnerActivite, lireMedailles, type Batiment, type Journee } from './stockage'

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
})

const jour = (j: string, briques: number, murs = 0): Journee => ({ jour: j, briques, murs })
const bat = (etages: number, date: number): Batiment => ({ id: `b${date}`, session: 'A', couleur: '#f5c2e7', titre: null, etages, date })

describe('les médailles', () => {
  test('la plus longue série, même à cheval sur deux mois', () => {
    expect(plusLongueSerie([jour('2026-09-29', 1), jour('2026-09-30', 2), jour('2026-10-01', 1), jour('2026-10-03', 4), jour('2026-10-04', 0)])).toBe(3)
    expect(plusLongueSerie([])).toBe(0)
  })

  test('chaque famille selon ses paliers', () => {
    const journees = [jour('2026-10-25', 60, 1), jour('2026-10-26', 45, 3), jour('2026-10-27', 2, 0)]
    const ids = gagnees(journees, [bat(12, new Date(2026, 9, 26, 14).getTime()), bat(3, new Date(2026, 9, 26, 2).getTime())])
    expect([...ids].sort()).toEqual(
      ['etages-10', 'etages-100', 'batiments-1', 'series-3', 'exploit-tour', 'exploit-triple', 'exploit-nuit'].sort(),
    )
  })

  test('quatorze médailles, toutes dessinées en 16 × 16', () => {
    expect(MEDAILLES.length).toBe(14)
    for (const m of MEDAILLES) expect(grilleMedaille(m, true).map(l => l.length)).toEqual(Array(16).fill(16))
  })

  test('le premier calcul se tait, les suivants annoncent, une restauration se tait', async () => {
    await fusionnerActivite([jour('2026-10-26', 12)])
    expect(await decernerMedailles()).toEqual([])
    expect([...(await lireMedailles()).keys()]).toEqual(['etages-10'])

    await fusionnerActivite([jour('2026-10-27', 95)])
    expect((await decernerMedailles()).map(m => m.id)).toEqual(['etages-100'])
    expect(await decernerMedailles()).toEqual([])

    await fusionnerActivite([jour('2026-10-28', 400)])
    expect(await decernerMedailles(true)).toEqual([])
    expect((await lireMedailles()).has('etages-500')).toBe(true)
  })
})

describe('le mini-jeu', () => {
  test('une pose parfaite garde la largeur et en rend un peu', () => {
    const p = nouvellePartie()
    p.courante.x = p.pile[0]!.x + 2
    expect(poser(p).resultat).toBe('parfaite')
    expect(p.pile[1]).toEqual({ x: p.pile[0]!.x, l: 180 })
  })

  test('ce qui dépasse tombe, la brique suivante est plus étroite', () => {
    const p = nouvellePartie()
    p.courante.x = p.pile[0]!.x + 30
    const { resultat, chute } = poser(p)
    expect(resultat).toBe('posee')
    expect(chute).toEqual({ x: p.pile[0]!.x + 180, l: 30 })
    expect([p.pile[1]!.l, p.courante.l, etages(p)]).toEqual([150, 150, 1])
  })

  test('à côté, c’est fini', () => {
    const p = nouvellePartie()
    p.courante.x = LARGEUR + 10
    expect(poser(p).resultat).toBe('ratee')
    expect(p.finie).toBe(true)
  })

  test('la brique rebondit sur les bords', () => {
    const p = nouvellePartie()
    const sens = Math.sign(p.courante.v)
    for (let i = 0; i < 400; i++) avancer(p)
    expect(p.courante.x).toBeGreaterThan(-p.courante.l)
    expect(p.courante.x).toBeLessThan(LARGEUR)
    expect(Math.abs(p.courante.v)).toBeGreaterThan(0)
    expect([1, -1]).toContain(sens)
  })
})
