// La spesa che si sta preparando (appena letta dallo scontrino o scritta a mano) prima di salvarla.
// Si tiene anche in IndexedDB: se l'app si ricarica o il telefono la chiude, non si rifà la lettura.
import { del, get, set } from 'idb-keyval'
import type { Spesa } from './conti'

export interface Bozza {
  spesa: Spesa
  /** foto dello scontrino già ridotte, ancora da caricare */
  foto: Blob[]
  /** cosa non tornava secondo l'IA (voci illeggibili, nomi non riconosciuti…) */
  avvisi: string
}

const CHIAVE = 'bozza'
let corrente: Bozza | null = null

export async function ricordaBozza(b: Bozza): Promise<void> {
  corrente = b
  try {
    await set(CHIAVE, { ...b, spesa: JSON.parse(JSON.stringify(b.spesa)) })
  } catch {
    /* resta in memoria */
  }
}

export async function leggiBozza(): Promise<Bozza | null> {
  if (corrente) return corrente
  try {
    corrente = (await get<Bozza>(CHIAVE)) ?? null
  } catch {
    /* IndexedDB non disponibile */
  }
  return corrente
}

export async function dimenticaBozza(): Promise<void> {
  corrente = null
  try {
    await del(CHIAVE)
  } catch {
    /* pazienza */
  }
}
