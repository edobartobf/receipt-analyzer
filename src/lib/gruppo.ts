// Il gruppo: le persone tra cui si dividono le spese. Un solo file, gruppo.json, nel repo dati.
import { reactive } from 'vue'
import { ErroreGitHub, leggiJson, scriviJson } from './github'
import { impostazioni } from './impostazioni'
import { nuovoId } from './id'

export interface Persona {
  id: string
  nome: string
  /** false = non compare più nelle spese nuove, ma resta nei conti di quelle vecchie */
  attiva: boolean
}

interface FileGruppo {
  persone: Persona[]
}

const PERCORSO = 'gruppo.json'
const chiaveCopia = () => `scontrini:gruppo:${impostazioni.repo}`

export const gruppo = reactive({
  persone: [] as Persona[],
  caricato: false,
  errore: '',
})

function applica(dati: FileGruppo) {
  gruppo.persone = (dati.persone ?? []).map((p) => ({ id: p.id, nome: p.nome, attiva: p.attiva !== false }))
  try {
    localStorage.setItem(chiaveCopia(), JSON.stringify({ persone: gruppo.persone }))
  } catch {
    /* pazienza */
  }
}

export async function caricaGruppo(): Promise<void> {
  gruppo.errore = ''
  if (!gruppo.caricato) {
    try {
      const copia = localStorage.getItem(chiaveCopia())
      if (copia) gruppo.persone = (JSON.parse(copia) as FileGruppo).persone
    } catch {
      /* nessuna copia */
    }
  }
  try {
    const f = await leggiJson<FileGruppo>(PERCORSO)
    applica(f?.dati ?? { persone: [] })
    gruppo.caricato = true
  } catch (e) {
    gruppo.errore = e instanceof ErroreGitHub && e.stato === 0 ? 'Sei offline' : String(e instanceof Error ? e.message : e)
  }
}

/** Applica una modifica all'ultima versione del file; se un altro telefono ha scritto nel frattempo, rilegge e riprova. */
async function modifica(descrizione: string, cambia: (persone: Persona[]) => Persona[]): Promise<void> {
  for (let tentativo = 0; ; tentativo++) {
    const f = await leggiJson<FileGruppo>(PERCORSO)
    const dati = { persone: cambia(f?.dati.persone ?? []) }
    try {
      await scriviJson(PERCORSO, dati, descrizione, f?.sha)
      applica(dati)
      gruppo.caricato = true
      return
    } catch (e) {
      if (!(e instanceof ErroreGitHub && e.conflitto) || tentativo >= 3) throw e
    }
  }
}

export async function aggiungiPersona(nome: string): Promise<Persona> {
  const pulito = nome.trim()
  if (!pulito) throw new Error('Scrivi un nome')
  const nuova: Persona = { id: nuovoId(), nome: pulito, attiva: true }
  let risultato = nuova
  await modifica(`Nuova persona: ${pulito}`, (persone) => {
    const gia = persone.find((p) => p.nome.toLowerCase() === pulito.toLowerCase())
    if (gia) {
      risultato = { ...gia, attiva: true }
      return persone.map((p) => (p.id === gia.id ? risultato : p))
    }
    return [...persone, nuova]
  })
  return risultato
}

export const rinominaPersona = (id: string, nome: string) =>
  modifica(`Rinomina: ${nome}`, (persone) => persone.map((p) => (p.id === id ? { ...p, nome: nome.trim() || p.nome } : p)))

/** Con spese a suo nome la persona si può solo nascondere; senza, si toglie del tutto. */
export const togliPersona = (id: string, haSpese: boolean) =>
  modifica('Toglie una persona', (persone) =>
    haSpese ? persone.map((p) => (p.id === id ? { ...p, attiva: false } : p)) : persone.filter((p) => p.id !== id),
  )

export const nomeDi = (id: string) => gruppo.persone.find((p) => p.id === id)?.nome ?? '?'
export const attive = () => gruppo.persone.filter((p) => p.attiva)
