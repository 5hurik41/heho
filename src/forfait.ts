// L'écran Forfait : la semaine et la fenêtre de 5 heures, telles que le PC les a mesurées au dernier appel
// (BRIEF.md, « Forfait »). La jauge est un mur de 20 briques, 5 % chacune, posées rangée par rangée depuis le bas.
import { echapper, horodatage } from './chantier'
import type { Fenetre, Forfait } from './message'

const BRIQUES = 20
const PAR_RANGEE = 10
// Au-delà, la jauge passe à l'orange balise : le seuil de la première alerte budget du mod.
const ALERTE = 75

// « dans 2 j 4 h », « dans 3 h 10 », « dans 12 min » ; « passée » si la remise est déjà là.
export const dans = (ms: number): string => {
  const min = Math.round(ms / 60_000)
  if (min <= 0) return 'passée'
  if (min < 60) return `dans ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `dans ${h} h${min % 60 ? ` ${String(min % 60).padStart(2, '0')}` : ''}`

  return `dans ${Math.floor(h / 24)} j${h % 24 ? ` ${h % 24} h` : ''}`
}

// « samedi à 14 h », « aujourd'hui à 16 h 30 ».
const quand = (date: number, maintenant: number): string => {
  const d = new Date(date)
  const jour = d.toDateString() === new Date(maintenant).toDateString() ? "aujourd'hui" : d.toLocaleDateString('fr-FR', { weekday: 'long' })

  return `${jour} à ${d.getHours()} h${d.getMinutes() ? ` ${String(d.getMinutes()).padStart(2, '0')}` : ''}`
}

// Le mur : les briques pleines jusqu'au pourcentage, et celle où la projection mène, en pointillés.
const mur = (pourcent: number, projection: number | null): string => {
  const pleines = Math.min(BRIQUES, Math.round(pourcent / (100 / BRIQUES)))
  const prevue = projection === null ? -1 : Math.min(BRIQUES, Math.round(projection / (100 / BRIQUES))) - 1
  // Les rangées s'affichent du haut vers le bas, mais se remplissent depuis le bas.
  const rangees = Array.from({ length: BRIQUES / PAR_RANGEE }, (_, r) => {
    const rangee = BRIQUES / PAR_RANGEE - 1 - r
    const briques = Array.from({ length: PAR_RANGEE }, (_, i) => {
      const n = rangee * PAR_RANGEE + i

      return `<i class="${n < pleines ? 'pleine' : ''}${n === prevue && n >= pleines ? ' prevue' : ''}"></i>`
    }).join('')

    return `<span class="rangee">${briques}</span>`
  }).join('')

  return `<div class="mur-forfait${pourcent >= ALERTE ? ' alerte' : ''}" role="meter" aria-valuenow="${pourcent}" aria-valuemin="0" aria-valuemax="100">${rangees}</div>`
}

const carteFenetre = (nom: string, f: Fenetre, projection: number | null, maintenant: number): string => {
  const remise = f.remise === null ? '' : `<p class="aide">Remise à zéro ${quand(f.remise, maintenant)}, ${dans(f.remise - maintenant)}.</p>`
  const rythme =
    projection === null
      ? ''
      : projection >= 100
        ? `<p class="projection depasse">À ce rythme, tu atteins ${projection} % avant la remise.</p>`
        : `<p class="projection">À ce rythme : ${projection} % à la remise.</p>`

  return `
    <article class="forfait">
      <div class="forfait-tete"><h3>${echapper(nom)}</h3><strong class="pourcent">${f.pourcent} %</strong></div>
      ${mur(f.pourcent, projection)}
      ${rythme}
      ${remise}
    </article>`
}

export const ecranForfait = (f: Forfait | undefined, maintenant = Date.now()): string => {
  if (!f)
    return `<h2>Forfait</h2><p class="aide">Pas encore de mesure : le PC l'enverra avec son prochain appel ou sa prochaine étape.</p>`

  return `
    <h2>Forfait</h2>
    ${f.semaine ? carteFenetre('La semaine', f.semaine, f.semaine.projection, maintenant) : ''}
    ${f.cinqHeures ? carteFenetre('Les 5 heures', f.cinqHeures, null, maintenant) : ''}
    <p class="aide maj">Mesuré par le PC ${horodatage(f.date)}. Mis à jour avec chaque appel et chaque étape.</p>`
}
