// Lettura dello scontrino e proposta di chi ha preso cosa, con Claude.
// La chiamata parte dal telefono con la chiave Anthropic del gruppo (vedi DECISIONI.md): nessun server in mezzo.
import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { z } from 'zod'
import type { Voce } from './conti'
import { bytesInBase64 } from './github'
import type { Persona } from './gruppo'
import { nuovoId } from './id'
import { impostazioni, inProva } from './impostazioni'

export const MODELLO = 'claude-opus-5-5'

const Assegnazione = z.object({
  persona: z.string().describe("id della persona, copiato dall'elenco delle persone"),
  parti: z.number().describe('quante parti della voce le spettano: 1 a testa per dividere in parti uguali'),
})

const Scontrino = z.object({
  esercente: z.string().describe('nome del negozio o del locale, breve; stringa vuota se non si legge'),
  data: z.string().nullable().describe('data dello scontrino in formato AAAA-MM-GG, null se non si legge'),
  totale: z.number().nullable().describe('totale pagato scritto sullo scontrino, in euro; null se non si legge'),
  voci: z.array(
    z.object({
      nome: z.string().describe('nome della voce, scritto in modo leggibile (senza sigle di cassa)'),
      prezzo: z.number().describe('importo totale della riga in euro (quantità × prezzo); negativo per sconti e resi'),
      assegnazioni: z.array(Assegnazione).describe('chi ha preso la voce; vuoto se le indicazioni non lo dicono'),
    }),
  ),
  avvisi: z.string().describe('una o due frasi su ciò che non torna o non si legge; stringa vuota se è tutto chiaro'),
})

const Riassegnazione = z.object({
  voci: z.array(z.object({ id: z.string(), assegnazioni: z.array(Assegnazione) })),
  avvisi: z.string().describe('una frase su ciò che non era chiaro nelle indicazioni; stringa vuota se è tutto chiaro'),
})

type Assegnazioni = z.infer<typeof Assegnazione>[]

export interface ScontrinoLetto {
  titolo: string
  data: string | null
  totale_scontrino: number | null
  voci: Voce[]
  avvisi: string
}

const REGOLE_ASSEGNAZIONE = `Come assegnare le voci:
- Le indicazioni sono dettate a voce, quindi possono contenere errori di trascrizione, soprannomi e nomi abbreviati ("edo" per Edoardo): abbina ogni nome alla persona più plausibile dell'elenco.
- Le indicazioni descrivono i piatti a parole loro ("la pasta al sugo"), lo scontrino usa le sue ("PENNE POMOD."): abbina per significato.
- Se più persone hanno preso la stessa voce, dividila tra loro con 1 parte a testa. Usa parti diverse solo se le indicazioni lo dicono ("due birre io, una Luca" su una riga da tre birre → 2 e 1).
- "Tutti", "diviso tra tutti", "in comune" → tutte le persone dell'elenco, 1 parte a testa.
- Voci comuni come coperto, servizio, acqua, pane: se le indicazioni non ne parlano, assegnale a chi risulta aver mangiato (le persone nominate), 1 parte a testa.
- Quello che le indicazioni non permettono di attribuire resta senza assegnazioni: lo sistemerà una persona a mano, ed è meglio una voce vuota di una attribuita a caso.
- Usa solo gli id dell'elenco.`

const SISTEMA_SCONTRINO = `Leggi la foto di uno scontrino o di un conto per un'app con cui un gruppo di colleghi si divide le spese. Quello che estrai viene mostrato a una persona che lo controlla e lo corregge, poi entra nei conti del gruppo: contano la precisione degli importi e non inventare nulla.

Cosa estrarre:
- Una voce per ogni riga di prodotto o piatto, con l'importo totale della riga (se c'è "2 x 3,50" il prezzo è 7,00). Riscrivi i nomi in modo leggibile.
- Sconti, buoni e resi come voci a parte con prezzo negativo, a meno che la riga non riporti già l'importo scontato.
- Non sono voci: subtotali, totale, riepilogo IVA, contanti, resto, pagamento con carta, punti fedeltà.
- Se arrivano più foto sono parti dello stesso scontrino: non ripetere le righe che compaiono in due foto.
- La somma delle voci dovrebbe dare il totale dello scontrino. Se non torna, non aggiustare i prezzi: riporta quello che leggi e dillo negli avvisi.

${REGOLE_ASSEGNAZIONE}`

const SISTEMA_RIASSEGNA = `Un gruppo di colleghi si divide una spesa. Ricevi l'elenco delle voci già lette dallo scontrino e le indicazioni, dettate a voce, su chi ha preso cosa. Restituisci per ogni voce le sue assegnazioni, usando gli id delle voci così come sono. Le assegnazioni attuali sono riportate: cambiale dove le indicazioni dicono altro, lasciale dove non ne parlano.

${REGOLE_ASSEGNAZIONE}`

const elencoPersone = (persone: Persona[]) => persone.map((p) => `- ${p.nome} (id: ${p.id})`).join('\n')

function inQuote(assegnazioni: Assegnazioni, persone: Persona[]): Record<string, number> {
  const quote: Record<string, number> = {}
  for (const a of assegnazioni) {
    const parti = Math.round(a.parti)
    if (parti > 0 && persone.some((p) => p.id === a.persona)) quote[a.persona] = (quote[a.persona] ?? 0) + parti
  }
  return quote
}

/** Dal risultato dell'IA (euro, id persone) alle voci dell'app (centesimi, quote solo di persone esistenti). */
export function daScontrino(letto: z.infer<typeof Scontrino>, persone: Persona[]): ScontrinoLetto {
  return {
    titolo: letto.esercente.trim(),
    data: letto.data && /^\d{4}-\d{2}-\d{2}$/.test(letto.data) ? letto.data : null,
    totale_scontrino: letto.totale === null ? null : Math.round(letto.totale * 100),
    voci: letto.voci.map((v) => ({
      id: nuovoId(),
      nome: v.nome.trim() || 'Voce',
      prezzo: Math.round(v.prezzo * 100),
      quote: inQuote(v.assegnazioni, persone),
    })),
    avvisi: letto.avvisi.trim(),
  }
}

function cliente(): Anthropic {
  if (!impostazioni.chiaveAi) throw new Error('Manca la chiave Anthropic: inseriscila nelle impostazioni')
  // La chiave è quella del gruppo, inserita da chi usa l'app: non c'è un server a cui affidarla.
  return new Anthropic({ apiKey: impostazioni.chiaveAi, dangerouslyAllowBrowser: true, maxRetries: 2 })
}

function spiega(e: unknown): Error {
  if (e instanceof Anthropic.AuthenticationError) return new Error('La chiave Anthropic non è valida: controllala nelle impostazioni')
  if (e instanceof Anthropic.PermissionDeniedError) return new Error('La chiave Anthropic non ha il permesso di usare questo modello')
  if (e instanceof Anthropic.RateLimitError) return new Error('Troppe richieste o credito Anthropic esaurito: riprova tra poco')
  if (e instanceof Anthropic.APIConnectionError) return new Error('Nessuna connessione: per leggere lo scontrino serve la rete')
  if (e instanceof Anthropic.APIError) return new Error(`Errore del servizio di lettura (${e.status ?? '?'}): ${e.message}`)
  return e instanceof Error ? e : new Error(String(e))
}

async function chiedi<T extends z.ZodType>(schema: T, sistema: string, contenuto: Anthropic.ContentBlockParam[]): Promise<z.infer<T>> {
  let risposta
  try {
    risposta = await cliente().messages.parse({
      model: MODELLO,
      max_tokens: 16000,
      system: sistema,
      messages: [{ role: 'user', content: contenuto }],
      output_config: { effort: 'low', format: zodOutputFormat(schema) },
    })
  } catch (e) {
    throw spiega(e)
  }
  if (risposta.stop_reason === 'refusal') throw new Error('Il servizio di lettura ha rifiutato la richiesta')
  if (risposta.stop_reason === 'max_tokens') throw new Error('Scontrino troppo lungo da leggere in una volta: prova a fotografarlo in due parti')
  if (!risposta.parsed_output) throw new Error('La lettura non ha dato un risultato utilizzabile: riprova')
  return risposta.parsed_output
}

const pausa = (ms: number) => new Promise((ok) => setTimeout(ok, ms))

/** Legge le foto di uno scontrino e propone le assegnazioni secondo le indicazioni dettate. */
export async function leggiScontrino(foto: Blob[], indicazioni: string, persone: Persona[], oggi: string): Promise<ScontrinoLetto> {
  if (inProva.value) {
    await pausa(900)
    return scontrinoDiProva(persone)
  }
  const immagini: Anthropic.ContentBlockParam[] = []
  for (const f of foto) {
    immagini.push({
      type: 'image',
      source: { type: 'base64', media_type: 'image/jpeg', data: bytesInBase64(new Uint8Array(await f.arrayBuffer())) },
    })
  }
  const testo = `Persone del gruppo:\n${elencoPersone(persone)}\n\nOggi è il ${oggi}.\n\nIndicazioni su chi ha preso cosa:\n${
    indicazioni.trim() || '(nessuna: lascia tutte le voci senza assegnazioni)'
  }`
  return daScontrino(await chiedi(Scontrino, SISTEMA_SCONTRINO, [...immagini, { type: 'text', text: testo }]), persone)
}

/** Rifà le assegnazioni di voci già lette, con nuove indicazioni. Restituisce le quote per id di voce. */
export async function riassegna(
  voci: Voce[],
  indicazioni: string,
  persone: Persona[],
): Promise<{ quote: Record<string, Record<string, number>>; avvisi: string }> {
  if (inProva.value) {
    await pausa(600)
    const tutti = Object.fromEntries(persone.map((p) => [p.id, 1]))
    return { quote: Object.fromEntries(voci.map((v) => [v.id, tutti])), avvisi: 'Prova: ho diviso tutto tra tutti.' }
  }
  const elencoVoci = voci
    .map((v) => {
      const attuali = Object.entries(v.quote)
        .map(([id, p]) => `${id}×${p}`)
        .join(', ')
      return `- id ${v.id}: ${v.nome}, ${(v.prezzo / 100).toFixed(2)} € (ora: ${attuali || 'nessuno'})`
    })
    .join('\n')
  const testo = `Persone del gruppo:\n${elencoPersone(persone)}\n\nVoci:\n${elencoVoci}\n\nIndicazioni:\n${indicazioni.trim()}`
  const esito = await chiedi(Riassegnazione, SISTEMA_RIASSEGNA, [{ type: 'text', text: testo }])
  return {
    quote: Object.fromEntries(esito.voci.filter((v) => voci.some((x) => x.id === v.id)).map((v) => [v.id, inQuote(v.assegnazioni, persone)])),
    avvisi: esito.avvisi.trim(),
  }
}

function scontrinoDiProva(persone: Persona[]): ScontrinoLetto {
  const [a, b, c] = persone
  const uno = (p?: Persona) => ({ persona: p?.id ?? '', parti: 1 })
  return daScontrino(
    {
      esercente: 'Trattoria di prova',
      data: null,
      totale: 41.5,
      voci: [
        { nome: 'Pasta al sugo', prezzo: 18, assegnazioni: [uno(a), uno(b)] },
        { nome: 'Insalata con tonno', prezzo: 9.5, assegnazioni: [uno(c ?? a)] },
        { nome: 'Acqua naturale', prezzo: 3, assegnazioni: persone.map(uno) },
        { nome: 'Caffè', prezzo: 5, assegnazioni: [] },
        { nome: 'Coperto', prezzo: 6, assegnazioni: persone.map(uno) },
      ],
      avvisi: 'Scontrino finto della modalità di prova: non so chi ha preso i caffè.',
    },
    persone,
  )
}
