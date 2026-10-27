// Répondre depuis le téléphone (BRIEF.md, bloc 4) : la réponse, chiffrée en AES-256-GCM avec la clé que le PC a
// donnée (push `cle`), est déposée sur le canal ntfy.sh que le mod notify-worker relève tant que l'appel attend.
// Utilisé par le service worker (boutons de la notification) et par l'appli (fiche de l'appel).
import type { Cle, Message, Reponse } from './message'
import { lireBoite, marquerRepondu } from './stockage'

const NTFY = 'https://ntfy.sh'
// Au-delà, le PC ne relève plus le canal (ECOUTE_MS dans notify-worker) : répondre ne servirait à rien.
export const REPONSE_MS = 30 * 60_000

export type Contenu = { choix: string } | { texte: string } | { refus: true }

// On peut répondre à un appel qui l'accepte, pas encore répondu, de moins de REPONSE_MS, quand la boîte est connue.
export const peutRepondre = (m: Message, boite: Cle | undefined, maintenant = Date.now()): boolean =>
  boite !== undefined && m.attendue !== undefined && m.repondu === undefined && maintenant - m.date < REPONSE_MS

const b64u = (octets: Uint8Array): string => btoa(String.fromCharCode(...octets)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const deB64u = (s: string): Uint8Array => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0))

// b64u(iv de 12 octets ‖ chiffré ‖ étiquette) : le format qu'ouvre `ouvrirReponse` de web-push.mjs.
export const fermer = async (texte: string, cle: string, iv = crypto.getRandomValues(new Uint8Array(12))): Promise<string> => {
  const k = await crypto.subtle.importKey('raw', deB64u(cle) as BufferSource, 'AES-GCM', false, ['encrypt'])
  const chiffre = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, k, new TextEncoder().encode(texte)))
  const tout = new Uint8Array(iv.length + chiffre.length)
  tout.set(iv)
  tout.set(chiffre, iv.length)

  return b64u(tout)
}

// Le texte qu'on garde de la réponse, pour la fiche et la confirmation.
export const dire = (c: Contenu): string => ('choix' in c ? c.choix : 'texte' in c ? c.texte : 'Refusé')

// Dépose la réponse et la note sur l'appel ; rejette si la boîte manque ou si ntfy.sh ne l'accepte pas.
export const repondre = async (m: Message, c: Contenu, envoyer: typeof fetch = fetch): Promise<void> => {
  const boite = await lireBoite()
  if (!boite || !m.attendue) throw new Error('Pas de boîte aux lettres, ou appel sans réponse possible.')
  const reponse: Reponse = { v: 1, appel: m.attendue.appel, sessionId: m.sessionId, ...c, date: Date.now() }
  const r = await envoyer(`${NTFY}/${boite.canal}`, { method: 'POST', body: await fermer(JSON.stringify(reponse), boite.cle) })
  if (!r.ok) throw new Error(`ntfy.sh a répondu ${r.status}.`)
  await marquerRepondu(m.attendue.appel, dire(c))
}
