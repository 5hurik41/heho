import { describe, expect, test } from 'vitest'
import { BOITE, HAUTEUR_CORPS, METIERS, ouvrierEnBoite } from './equipe'
import { ROLES } from './message'
import { batiment, ETAGE, palette, planBatiment, RDC } from './pixels'

// Les règles de la refonte graphique (BRIEF.md, « Refonte graphique » et « Équipe tirée des outils »).
describe('la refonte graphique', () => {
  test('un ouvrier, contour compris, fait exactement un étage', () => {
    expect(HAUTEUR_CORPS + 2).toBe(ETAGE)
  })

  test('chaque rôle a son dessin, ses deux images dans la même boîte', () => {
    for (const r of ROLES) {
      expect(METIERS[r]).toBeDefined()
      for (const i of [0, 1]) {
        const g = ouvrierEnBoite(r, i)
        expect([g.length, g[0]!.length]).toEqual([BOITE.hauteur, BOITE.largeur])
        // Les semelles reposent sur la ligne des pieds : la ligne juste au-dessus porte des bottes.
        expect(g[BOITE.pieds - 1]!.some(c => c !== null && c !== '#0E0F11')).toBe(true)
      }
    }
  })

  test('le type de bâtiment suit son nombre d’étages', () => {
    const types = (n: number) => new Set(Array.from({ length: 60 }, (_, i) => planBatiment(`b${i}`, n, '#cba6f7').type))
    expect([...types(2)].sort()).toEqual(['atelier', 'commerce', 'pavillon'])
    expect([...types(4)].sort()).toEqual(['brique', 'commerce', 'pierre'])
    expect([...types(7)].sort()).toEqual(['barre', 'brique', 'pierre'])
    expect([...types(12)].sort()).toEqual(['barre', 'bureaux'])
  })

  test('un bâtiment se tire toujours pareil de son nom, et monte d’un étage tous les 15 px', () => {
    const P = palette(0, 0)
    const plan = planBatiment('s1:42', 5, '#a6e3a1')
    expect(planBatiment('s1:42', 5, '#a6e3a1')).toEqual(plan)
    const a = batiment(plan, P)
    const b = batiment({ ...plan, etages: 6 }, P)
    expect(b.h - a.h).toBe(ETAGE)
    expect(a.h).toBeGreaterThanOrEqual(RDC + 4 * ETAGE)
  })

  test('la nuit voile les murs mais pas les lampes', () => {
    const jour = palette(0, 0)
    const nuit = palette(1, 10)
    expect(nuit.beton).not.toBe(jour.beton)
    expect(nuit.vitrine.toUpperCase()).toBe('#FFD27A')
  })
})
