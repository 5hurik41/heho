import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { beforeEach, describe, expect, test } from 'vitest'
import { lireCle, lireMessage, type Cle, type Message } from './message'
import { fermer, peutRepondre, repondre, REPONSE_MS } from './reponse'
import { ajouterMessage, ecrireBoite, lireHistorique } from './stockage'

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
})

const b64u = (o: Uint8Array): string => btoa(String.fromCharCode(...o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const deB64u = (s: string): Uint8Array => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0))

const CLE: Cle = { v: 1, type: 'cle', sessionId: 'cle', canal: 'heho-canal', cle: b64u(new Uint8Array(32).fill(7)), date: 1 }

const appel = (id: string, rappel = 0, date = Date.now()): Message => ({
  v: 1,
  id: `${id}-${rappel}`,
  sessionId: 'abcdef123456',
  session: 'VITRINE L3',
  couleur: '#f5c2e7',
  situation: 'question',
  texte: 'Quel pli ?',
  rappel,
  date,
  attendue: { appel: id, options: ['A', 'B'], libre: true, refuser: false },
})

// Ce que fait ouvrirReponse de web-push.mjs côté PC (son passage par Node est vérifié dans web-push.test.mjs) :
// l'iv de 12 octets devant, le chiffré et son étiquette derrière.
const ouvrir = async (enveloppe: string, cle: string): Promise<string> => {
  const b = deB64u(enveloppe)
  const k = await crypto.subtle.importKey('raw', deB64u(cle) as BufferSource, 'AES-GCM', false, ['decrypt'])

  return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b.subarray(0, 12) as BufferSource }, k, b.subarray(12) as BufferSource))
}

describe('le format', () => {
  test('la clé : un canal et 32 octets en base64url, rien d’autre', () => {
    expect(lireCle(CLE)).toEqual(CLE)
    expect(lireCle({ ...CLE, cle: 'courte' })).toBeNull()
    expect(lireCle({ ...CLE, type: 'progression' })).toBeNull()
  })

  test('un appel garde ce qu’il accepte comme réponse ; quatre options au plus', () => {
    const m = appel('a1')
    expect(lireMessage(m)?.attendue).toEqual(m.attendue)
    expect(lireMessage({ ...m, attendue: { ...m.attendue, options: ['1', '2', '3', '4', '5'] } })?.attendue?.options).toEqual(['1', '2', '3', '4'])
    expect(lireMessage({ ...m, attendue: { appel: 'a1' } })?.attendue).toBeUndefined()
  })
})

describe('répondre', () => {
  test('le chiffré du téléphone s’ouvre avec la clé du PC', async () => {
    expect(await ouvrir(await fermer('{"choix":"B"}', CLE.cle), CLE.cle)).toBe('{"choix":"B"}')
  })

  test('la réponse part sur le canal, chiffrée, et l’appel et ses rappels la gardent', async () => {
    await ecrireBoite(CLE)
    await ajouterMessage(appel('a1', 0))
    await ajouterMessage(appel('a1', 1))
    const envois: { url: string; corps: string }[] = []
    const faux = (async (url: string, init?: RequestInit) => {
      envois.push({ url, corps: String(init?.body) })

      return new Response('', { status: 200 })
    }) as typeof fetch
    await repondre(appel('a1'), { choix: 'B' }, faux)
    expect(envois[0]!.url).toBe('https://ntfy.sh/heho-canal')
    expect(JSON.parse(await ouvrir(envois[0]!.corps, CLE.cle))).toMatchObject({ v: 1, appel: 'a1', sessionId: 'abcdef123456', choix: 'B' })
    expect((await lireHistorique()).map(m => m.repondu?.texte)).toEqual(['B', 'B'])
  })

  test('sans boîte, ou si ntfy.sh refuse, rien n’est noté', async () => {
    await ajouterMessage(appel('a1'))
    await expect(repondre(appel('a1'), { refus: true })).rejects.toThrow()
    await ecrireBoite(CLE)
    const refuse = (async () => new Response('', { status: 429 })) as typeof fetch
    await expect(repondre(appel('a1'), { texte: 'ok' }, refuse)).rejects.toThrow('429')
    expect((await lireHistorique())[0]!.repondu).toBeUndefined()
  })

  test('on ne répond qu’à un appel récent, qui l’accepte, pas encore répondu', () => {
    const t = Date.now()
    expect(peutRepondre(appel('a1', 0, t), CLE, t)).toBe(true)
    expect(peutRepondre(appel('a1', 0, t), undefined, t)).toBe(false)
    expect(peutRepondre(appel('a1', 0, t - REPONSE_MS - 1), CLE, t)).toBe(false)
    expect(peutRepondre({ ...appel('a1', 0, t), repondu: { texte: 'B', date: t } }, CLE, t)).toBe(false)
    expect(peutRepondre({ ...appel('a1', 0, t), attendue: undefined }, CLE, t)).toBe(false)
  })
})
