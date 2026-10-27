// Le cycle du soleil (BRIEF.md, « Cycle du soleil ») : toute l'appli suit la hauteur réelle du soleil dans la ville
// choisie. Les couleurs glissent en continu ; l'interface bascule du sombre au clair quand le soleil passe BASCULE
// degrés, pour que le texte ne croise jamais son fond. Les palettes sont celles de la planche validée (docs/bloc3.html).

const RAD = Math.PI / 180
// Au-dessus, l'interface est claire.
export const BASCULE = 6

export type Ville = { nom: string; lat: number; lon: number }
export type Astre = { elevation: number; azimut: number }

// Jours depuis le 1er janvier 2000 à midi UTC.
const jours = (date: number): number => date / 86_400_000 - 10_957.5

// D'ascension droite et déclinaison à hauteur et azimut, pour un lieu et un instant.
const horizon = (date: number, ville: Ville, ra: number, dec: number): Astre => {
  const d = jours(date)
  const gmst = (((18.697374558 + 24.06570982441908 * d) % 24) + 24) % 24
  const H = (gmst * 15 + ville.lon) * RAD - ra
  const lat = ville.lat * RAD
  const elevation = Math.asin(Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(H)) / RAD
  const azimut = (Math.atan2(-Math.sin(H), Math.tan(dec) * Math.cos(lat) - Math.sin(lat) * Math.cos(H)) / RAD + 360) % 360

  return { elevation, azimut }
}

const OBLIQUITE = (d: number) => (23.439 - 0.00000036 * d) * RAD

// La longitude écliptique du soleil, en radians.
const longitudeSoleil = (d: number): number => {
  const g = (357.529 + 0.98560028 * d) * RAD

  return (280.459 + 0.98564736 * d + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * RAD
}

// Formules simplifiées, justes à quelques dixièmes de degré : bien assez pour une couleur de ciel.
export const soleil = (date: number, ville: Ville): Astre => {
  const d = jours(date)
  const L = longitudeSoleil(d)
  const e = OBLIQUITE(d)

  return horizon(date, ville, Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L)), Math.asin(Math.sin(e) * Math.sin(L)))
}

// La lune : sa position (à un degré près) et sa phase, 0 nouvelle lune, 0,5 pleine lune ; `croissante` jusqu'à la pleine.
export const lune = (date: number, ville: Ville): Astre & { eclairee: number; croissante: boolean } => {
  const d = jours(date)
  const M = (134.963 + 13.064993 * d) * RAD
  const F = (93.272 + 13.22935 * d) * RAD
  const l = (218.316 + 13.176396 * d) * RAD + 6.289 * RAD * Math.sin(M)
  const b = 5.128 * RAD * Math.sin(F)
  const e = OBLIQUITE(d)
  const ra = Math.atan2(Math.sin(l) * Math.cos(e) - Math.tan(b) * Math.sin(e), Math.cos(l))
  const dec = Math.asin(Math.sin(b) * Math.cos(e) + Math.cos(b) * Math.sin(e) * Math.sin(l))
  const ecart = ((((l - longitudeSoleil(d)) / RAD) % 360) + 360) % 360

  return { ...horizon(date, ville, ra, dec), eclairee: (1 - Math.cos(ecart * RAD)) / 2, croissante: ecart < 180 }
}

// ── Les palettes ─────────────────────────────────────────────────────────

type Palette = { asphalte: string; barre: string; carte: string; trait: string; craie: string; craieDouce: string; caseVide: string }

const P: Record<'nuit' | 'aubeSombre' | 'soirSombre' | 'aubeClaire' | 'soirClair' | 'jour', Palette> = {
  nuit: { asphalte: '#1B1C1E', barre: '#111214', carte: '#26282B', trait: '#3A3C40', craie: '#EDEAE0', craieDouce: '#B9B6AC', caseVide: '#2E3034' },
  aubeSombre: { asphalte: '#29232E', barre: '#141118', carte: '#352D3B', trait: '#4C4254', craie: '#F3EAE6', craieDouce: '#CBB9BE', caseVide: '#3A3240' },
  soirSombre: { asphalte: '#2B221E', barre: '#15100E', carte: '#3A2C26', trait: '#56413A', craie: '#F6E8DC', craieDouce: '#D2BBA9', caseVide: '#43332C' },
  aubeClaire: { asphalte: '#E8DCD3', barre: '#1B1C1E', carte: '#F6EEE8', trait: '#CDBFB4', craie: '#24201F', craieDouce: '#5E544F', caseVide: '#DACDC2' },
  soirClair: { asphalte: '#E7D8C5', barre: '#1B1C1E', carte: '#F5EADC', trait: '#CDB8A1', craie: '#261F19', craieDouce: '#5F5144', caseVide: '#DCC9B2' },
  jour: { asphalte: '#D9D6CC', barre: '#1B1C1E', carte: '#EFECE4', trait: '#B8B3A6', craie: '#1B1C1E', craieDouce: '#55524A', caseVide: '#CBC7BB' },
}
const CIELS = { nuit: ['#07080C', '#15182A'], aube: ['#3B4A7A', '#F2A7A0'], soir: ['#3A3466', '#F28A3C'], jour: ['#4F8FCF', '#BFDDF0'] } as const

const rgb = (h: string): number[] => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16))
export const melanger = (a: string, b: string, t: number): string =>
  `#${rgb(a)
    .map((x, i) => Math.round(x + (rgb(b)[i]! - x) * t).toString(16).padStart(2, '0'))
    .join('')}`
const entre = (x: number, a: number, b: number): number => Math.min(1, Math.max(0, (x - a) / (b - a)))
const doux = (t: number): number => t * t * (3 - 2 * t)
const melangerTout = (A: Palette, B: Palette, t: number): Palette =>
  Object.fromEntries(Object.keys(A).map(k => [k, melanger(A[k as keyof Palette], B[k as keyof Palette], t)])) as Palette

export type Ambiance = Palette & {
  clair: boolean
  accentTexte: string
  vitre: string
  cielHaut: string
  cielBas: string
  // 0 à 1.
  etoiles: number
  // La part des fenêtres allumées, en dixièmes.
  lumieres: number
}

// `matin` : le soleil est à l'est (il monte). Le matin tire vers le rose, le soir vers l'orange.
export const ambiance = (elevation: number, matin: boolean): Ambiance => {
  const clair = elevation >= BASCULE
  const couleurs = clair
    ? melangerTout(matin ? P.aubeClaire : P.soirClair, P.jour, doux(entre(elevation, BASCULE, 22)))
    : melangerTout(P.nuit, matin ? P.aubeSombre : P.soirSombre, doux(entre(elevation, -12, BASCULE)))
  const bas = matin ? CIELS.aube : CIELS.soir
  const ciel =
    elevation < 0
      ? [0, 1].map(i => melanger(CIELS.nuit[i]!, bas[i]!, doux(entre(elevation, -14, 0))))
      : [0, 1].map(i => melanger(bas[i]!, CIELS.jour[i]!, doux(entre(elevation, 0, 18))))
  // Nulle de jour, presque toutes les fenêtres au crépuscule, moins au cœur de la nuit.
  const part = elevation > 2 ? 0 : elevation > -8 ? 0.75 * doux(entre(-elevation, -2, 8)) : 0.45

  return {
    ...couleurs,
    clair,
    accentTexte: clair ? '#705200' : '#F5C542',
    vitre: clair ? melanger(ciel[1]!, '#1C1D21', 0.55) : '#1C1D21',
    cielHaut: ciel[0]!,
    cielBas: ciel[1]!,
    etoiles: 1 - doux(entre(elevation, -10, -2)),
    lumieres: Math.round(part * 10),
  }
}

// ── Les villes ───────────────────────────────────────────────────────────

export const VILLES: Ville[] = [
  ['Paris', 48.857, 2.352], ['Lyon', 45.764, 4.836], ['Marseille', 43.296, 5.37], ['Toulouse', 43.605, 1.444], ['Nice', 43.71, 7.262],
  ['Nantes', 47.218, -1.554], ['Strasbourg', 48.573, 7.752], ['Montpellier', 43.611, 3.877], ['Bordeaux', 44.838, -0.579], ['Lille', 50.629, 3.057],
  ['Rennes', 48.117, -1.678], ['Reims', 49.258, 4.032], ['Toulon', 43.124, 5.928], ['Grenoble', 45.188, 5.724], ['Dijon', 47.322, 5.041],
  ['Angers', 47.478, -0.563], ['Brest', 48.39, -4.486], ['Le Havre', 49.494, 0.108], ['Clermont-Ferrand', 45.778, 3.087], ['Tours', 47.394, 0.685],
  ['Limoges', 45.833, 1.262], ['Metz', 49.119, 6.176], ['Perpignan', 42.699, 2.895], ['Besançon', 47.238, 6.024], ['Orléans', 47.903, 1.909],
  ['Rouen', 49.443, 1.1], ['Caen', 49.183, -0.371], ['Nancy', 48.692, 6.184], ['Ajaccio', 41.919, 8.739], ['Bayonne', 43.493, -1.475],
  ['Saint-Denis (La Réunion)', -20.882, 55.45], ['Fort-de-France', 14.616, -61.059], ['Pointe-à-Pitre', 16.241, -61.533], ['Cayenne', 4.922, -52.313], ['Nouméa', -22.276, 166.458],
  ['Papeete', -17.535, -149.569], ['Bruxelles', 50.85, 4.352], ['Liège', 50.633, 5.567], ['Genève', 46.204, 6.143], ['Lausanne', 46.52, 6.633],
  ['Luxembourg', 49.612, 6.13], ['Monaco', 43.738, 7.425], ['Montréal', 45.502, -73.567], ['Québec', 46.813, -71.208], ['Dakar', 14.716, -17.467],
  ['Abidjan', 5.36, -4.008], ['Casablanca', 33.573, -7.59], ['Tunis', 36.806, 10.181], ['Alger', 36.754, 3.059], ['Antananarivo', -18.879, 47.508],
  ['Londres', 51.507, -0.128], ['Berlin', 52.52, 13.405], ['Madrid', 40.417, -3.704], ['Rome', 41.903, 12.496], ['New York', 40.713, -74.006],
  ['Tokyo', 35.676, 139.65],
].map(([nom, lat, lon]) => ({ nom: nom as string, lat: lat as number, lon: lon as number }))

const CLE_VILLE = 'heho-ville'

// Sans ville choisie : une estimation tirée du fuseau du téléphone (l'aube peut alors glisser d'une demi-heure).
const villeDuFuseau = (): Ville => ({ nom: 'Fuseau du téléphone', lat: 46, lon: -new Date().getTimezoneOffset() / 4 })

// La ville vit dans le stockage du navigateur : lue d'un coup au démarrage, sans attendre IndexedDB, pour que la
// première image soit déjà aux bonnes couleurs.
export const lireVille = (): Ville => {
  try {
    const v = JSON.parse(localStorage.getItem(CLE_VILLE) ?? 'null') as Ville | null
    if (v && typeof v.lat === 'number' && typeof v.lon === 'number' && typeof v.nom === 'string') return v
  } catch {
    // Pas de stockage : le fuseau.
  }

  return villeDuFuseau()
}

export const ecrireVille = (v: Ville | null): void => {
  try {
    if (v) localStorage.setItem(CLE_VILLE, JSON.stringify(v))
    else localStorage.removeItem(CLE_VILLE)
  } catch {
    // Sans stockage, la ville choisie ne durera que le temps de l'ouverture.
  }
}

// ── L'application de l'ambiance à la page ───────────────────────────────

export type Ciel = { soleil: Astre; lune: ReturnType<typeof lune> }

let derniereAmbiance: Ambiance | null = null
let dernierCiel: Ciel | null = null
export const cielActuel = (): Ciel | null => dernierCiel

// Pose les variables CSS de l'ambiance sur la page. La bascule sombre ↔ clair passe par une transition de vue
// (un fondu) quand le navigateur la connaît.
export const appliquer = (date = Date.now(), ville = lireVille()): Ciel => {
  const s = soleil(date, ville)
  const a = ambiance(s.elevation, s.azimut < 180)
  dernierCiel = { soleil: s, lune: lune(date, ville) }
  const poser = (): void => {
    const st = document.documentElement.style
    const vars: [string, string][] = [
      ['--asphalte', a.asphalte], ['--barre', a.barre], ['--carte', a.carte], ['--trait', a.trait], ['--craie', a.craie],
      ['--craie-douce', a.craieDouce], ['--case-vide', a.caseVide], ['--accent-texte', a.accentTexte], ['--vitre', a.vitre],
      ['--ciel-haut', a.cielHaut], ['--ciel-bas', a.cielBas], ['--etoiles', String(a.etoiles)],
    ]
    for (const [k, v] of vars) st.setProperty(k, v)
    document.documentElement.dataset.lumieres = String(a.lumieres)
    document.documentElement.dataset.mode = a.clair ? 'clair' : 'sombre'
  }
  const bascule = derniereAmbiance !== null && derniereAmbiance.clair !== a.clair
  const d = document as Document & { startViewTransition?: (f: () => void) => unknown }
  if (bascule && d.startViewTransition && !matchMedia('(prefers-reduced-motion: reduce)').matches) d.startViewTransition(poser)
  else poser()
  derniereAmbiance = a

  return dernierCiel
}

// Les fenêtres : chaque vitre porte un tirage de 0 à 9 (classe l0 à l9) ; `data-lumieres` sur la page dit combien
// de tirages sont allumés. Les règles sont écrites une fois, ici, plutôt que dix fois dans style.css.
export const reglesLumieres = (): string =>
  Array.from({ length: 10 }, (_, n) => `html[data-lumieres="${n + 1}"] .etage i:is(${Array.from({ length: n + 1 }, (_, k) => `.l${k}`).join(',')}){background:var(--lampe)}`).join('\n')
