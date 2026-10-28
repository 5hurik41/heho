import { describe, expect, test } from 'vitest'
import { ambiance, BASCULE, lune, soleil, VILLES } from './soleil'

const PARIS = VILLES.find(v => v.nom === 'Paris')!
// Le 27 octobre 2026, Paris est à UTC+1.
const aParis = (h: number, m = 0) => Date.UTC(2026, 9, 27, h - 1, m)

describe('le soleil', () => {
  test('à Paris le 27 octobre : levé vers 7 h 35, au plus haut vers 13 h, couché vers 17 h 35', () => {
    expect(soleil(aParis(7, 25), PARIS).elevation).toBeLessThan(0)
    expect(soleil(aParis(7, 50), PARIS).elevation).toBeGreaterThan(0)
    expect(soleil(aParis(13), PARIS).elevation).toBeCloseTo(28, 0)
    expect(soleil(aParis(17, 25), PARIS).elevation).toBeGreaterThan(0)
    expect(soleil(aParis(17, 50), PARIS).elevation).toBeLessThan(0)
    // Le matin à l'est, le soir à l'ouest.
    expect(soleil(aParis(9), PARIS).azimut).toBeLessThan(180)
    expect(soleil(aParis(16), PARIS).azimut).toBeGreaterThan(180)
  })

  test('la lune : pleine le 3 janvier 2026, nouvelle le 18', () => {
    expect(lune(Date.UTC(2026, 0, 3, 10), PARIS).eclairee).toBeGreaterThan(0.97)
    expect(lune(Date.UTC(2026, 0, 18, 19), PARIS).eclairee).toBeLessThan(0.03)
    expect(lune(Date.UTC(2025, 11, 28), PARIS).croissante).toBe(true)
  })
})

// Le contraste WCAG entre deux couleurs.
const luminance = (hex: string): number => {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))

  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!
}
const contraste = (a: string, b: string): number => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p)

  return (x! + 0.05) / (y! + 0.05)
}

describe('l’ambiance', () => {
  test('le texte reste lisible à toute hauteur du soleil, matin et soir', () => {
    for (let e = -30; e <= 70; e += 0.5)
      for (const matin of [true, false]) {
        const a = ambiance(e, matin)
        for (const fond of [a.asphalte, a.carte]) {
          expect(contraste(a.craie, fond), `craie à ${e}°`).toBeGreaterThanOrEqual(7)
          expect(contraste(a.craieDouce, fond), `craie douce à ${e}°`).toBeGreaterThanOrEqual(4.5)
          expect(contraste(a.accentTexte, fond), `accent à ${e}°`).toBeGreaterThanOrEqual(4.5)
        }
      }
  })

  test('une seule bascule, à BASCULE degrés ; la nuit est la palette B', () => {
    expect(ambiance(BASCULE - 0.1, true).clair).toBe(false)
    expect(ambiance(BASCULE, true).clair).toBe(true)
    expect(ambiance(-40, true).asphalte).toBe('#1b1c1e')
    expect(ambiance(-40, true).etoiles).toBe(1)
    expect(ambiance(30, true).etoiles).toBe(0)
  })

  test('les fenêtres : éteintes de jour, allumées au crépuscule', () => {
    expect(ambiance(20, false).lumieres).toBe(0)
    expect(ambiance(-6, false).lumieres).toBeGreaterThan(5)
    expect(ambiance(20, false).nuit).toBe(0)
    expect(ambiance(-20, false).nuit).toBe(1)
  })
})
