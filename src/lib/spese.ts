// Le spese: un file per spesa in spese/<id>.json nel repo dati, così due telefoni che ne aggiungono
// una ciascuno non si pestano i piedi. Copia in IndexedDB per vederle (e fare i conti) offline.
import { get, set } from 'idb-keyval'
import { reactive } from 'vue'
import type { Spesa, Voce } from './conti'
import { caricaFoto, eliminaFoto } from './foto'
import { elencaCartella, eliminaFile, ErroreGitHub, leggiBlobJson, scriviJson } from './github'
import { nuovoId } from './id'
import { impostazioni } from './impostazioni'

interface Cache {
  repo: string
  spese: Record<string, { sha: string; dati: Spesa }>
}

const CHIAVE_CACHE = 'cache:spese'
const percorso = (id: string) => `spese/${id}.json`

export const spese = reactive({
  elenco: [] as Spesa[],
  sha: {} as Record<string, string>,
  caricamento: false,
  caricato: false,
  errore: '',
})

const ordina = (s: Spesa[]) => s.sort((a, b) => b.data.localeCompare(a.data) || b.creata_il.localeCompare(a.creata_il))

export const oggi = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function normalizzaVoce(v: Partial<Voce>): Voce {
  const quote: Record<string, number> = {}
  for (const [id, p] of Object.entries(v.quote ?? {})) {
    if (Number.isFinite(p) && p > 0) quote[id] = Math.round(p)
  }
  return {
    id: v.id || nuovoId(),
    nome: v.nome?.trim() || 'Voce',
    prezzo: Number.isFinite(v.prezzo) ? Math.round(v.prezzo!) : 0,
    quote,
  }
}

export function normalizzaSpesa(s: Partial<Spesa>): Spesa {
  const adesso = new Date().toISOString()
  return {
    id: s.id || nuovoId(),
    tipo: s.tipo === 'rimborso' ? 'rimborso' : 'spesa',
    titolo: s.titolo?.trim() || 'Spesa',
    data: /^\d{4}-\d{2}-\d{2}$/.test(s.data ?? '') ? s.data! : oggi(),
    pagata_da: s.pagata_da ?? '',
    voci: (s.voci ?? []).map(normalizzaVoce),
    totale_scontrino: Number.isFinite(s.totale_scontrino) ? s.totale_scontrino! : null,
    nota: s.nota?.trim() ?? '',
    foto: s.foto ?? [],
    creata_da: s.creata_da ?? '',
    creata_il: s.creata_il ?? adesso,
    modificata_il: s.modificata_il ?? adesso,
  }
}

async function leggiCache(): Promise<Cache> {
  try {
    const c = await get<Cache>(CHIAVE_CACHE)
    if (c && c.repo === impostazioni.repo) return c
  } catch {
    /* IndexedDB non disponibile */
  }
  return { repo: impostazioni.repo, spese: {} }
}

async function salvaCache() {
  try {
    await set(
      CHIAVE_CACHE,
      JSON.parse(
        JSON.stringify({
          repo: impostazioni.repo,
          spese: Object.fromEntries(spese.elenco.map((s) => [percorso(s.id), { sha: spese.sha[s.id] ?? '', dati: s }])),
        } satisfies Cache),
      ),
    )
  } catch {
    /* pazienza */
  }
}

function applica(c: Cache) {
  spese.elenco = ordina(Object.values(c.spese).map((v) => v.dati))
  spese.sha = Object.fromEntries(Object.values(c.spese).map((v) => [v.dati.id, v.sha]))
}

/** Mostra subito la copia sul telefono, poi scarica da GitHub solo le spese nuove o cambiate. */
export async function aggiornaSpese(): Promise<void> {
  if (spese.caricamento) return
  spese.caricamento = true
  spese.errore = ''
  const cache = await leggiCache()
  if (!spese.caricato) applica(cache)
  try {
    const file = (await elencaCartella('spese')).filter((v) => v.type === 'file' && v.name.endsWith('.json'))
    const nuova: Cache = { repo: impostazioni.repo, spese: {} }
    await Promise.all(
      file.map(async (v) => {
        const vecchia = cache.spese[v.path]
        const dati = vecchia && vecchia.sha === v.sha ? vecchia.dati : await leggiBlobJson<Spesa>(v.sha)
        nuova.spese[v.path] = { sha: v.sha, dati: normalizzaSpesa(dati) }
      }),
    )
    applica(nuova)
    await salvaCache()
  } catch (e) {
    spese.errore =
      e instanceof ErroreGitHub && e.stato === 0 ? 'Sei offline: mostro la copia salvata sul telefono' : String(e instanceof Error ? e.message : e)
  } finally {
    spese.caricamento = false
    spese.caricato = true
  }
}

/** Salva una spesa nuova o modificata. `fotoNuove`: foto già ridotte, da caricare e aggiungere a quelle che ha già. */
export async function salvaSpesa(s: Partial<Spesa>, fotoNuove: Blob[] = []): Promise<Spesa> {
  const esistente = s.id ? spese.elenco.find((x) => x.id === s.id) : undefined
  const caricate: string[] = []
  try {
    for (const f of fotoNuove) caricate.push(await caricaFoto(f, s.titolo || 'scontrino'))
    const pulita = normalizzaSpesa({
      ...s,
      foto: [...(s.foto ?? []), ...caricate],
      creata_da: s.creata_da || impostazioni.nome,
      modificata_il: new Date().toISOString(),
    })
    const sha = await scriviJson(
      percorso(pulita.id),
      pulita,
      `${esistente ? 'Modifica' : pulita.tipo === 'rimborso' ? 'Rimborso' : 'Spesa'}: ${pulita.titolo}`,
      esistente ? spese.sha[pulita.id] : undefined,
    )
    spese.elenco = ordina([...spese.elenco.filter((x) => x.id !== pulita.id), pulita])
    spese.sha[pulita.id] = sha
    void salvaCache()
    for (const vecchia of esistente?.foto ?? []) {
      if (!pulita.foto.includes(vecchia)) void eliminaFoto(vecchia, pulita.titolo)
    }
    return pulita
  } catch (e) {
    for (const f of caricate) void eliminaFoto(f, s.titolo || 'scontrino')
    if (e instanceof ErroreGitHub && e.conflitto) {
      throw new Error('Nel frattempo questa spesa è stata modificata da un altro telefono. Torna all’elenco e riaprila.')
    }
    throw e
  }
}

export async function eliminaSpesa(s: Spesa): Promise<void> {
  const sha = spese.sha[s.id]
  if (sha) await eliminaFile(percorso(s.id), sha, `Elimina: ${s.titolo}`)
  for (const f of s.foto) void eliminaFoto(f, s.titolo)
  spese.elenco = spese.elenco.filter((x) => x.id !== s.id)
  delete spese.sha[s.id]
  await salvaCache()
}
