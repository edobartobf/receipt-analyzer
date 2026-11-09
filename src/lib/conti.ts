// I conti: come si divide una voce, quanto deve ognuno, chi deve dare quanto a chi.
// Solo funzioni pure, in centesimi interi.

export interface Voce {
  id: string
  nome: string
  /** in centesimi; negativo per sconti e resi */
  prezzo: number
  /** id persona → parti. { edo: 1, fra: 1 } = metà a testa; { edo: 2, luca: 1 } = due terzi e un terzo */
  quote: Record<string, number>
}

export interface Spesa {
  id: string
  /** un rimborso è una spesa con una sola voce: chi restituisce "paga", chi riceve ha tutta la quota */
  tipo: 'spesa' | 'rimborso'
  titolo: string
  /** AAAA-MM-GG */
  data: string
  /** id di chi ha pagato */
  pagata_da: string
  voci: Voce[]
  /** totale letto sullo scontrino, per accorgersi se le voci non tornano */
  totale_scontrino: number | null
  /** quello che è stato dettato all'IA */
  nota: string
  /** foto/<id>.jpg nel repo dati */
  foto: string[]
  creata_da: string
  creata_il: string
  modificata_il: string
}

export interface Rimborso {
  da: string
  a: string
  importo: number
}

/**
 * Divide un importo secondo le parti. I centesimi che avanzano vanno a chi ha il resto più grande,
 * così la somma delle quote è sempre uguale all'importo.
 */
export function ripartisci(prezzo: number, quote: Record<string, number>): Record<string, number> {
  const parti = Object.entries(quote)
    .filter(([, p]) => p > 0)
    .sort(([a], [b]) => a.localeCompare(b))
  const totaleParti = parti.reduce((s, [, p]) => s + p, 0)
  if (!totaleParti) return {}
  const segno = prezzo < 0 ? -1 : 1
  const importo = Math.abs(prezzo)
  const righe = parti.map(([id, p]) => {
    const esatto = (importo * p) / totaleParti
    return { id, base: Math.floor(esatto), resto: esatto - Math.floor(esatto) }
  })
  let avanzo = importo - righe.reduce((s, r) => s + r.base, 0)
  for (const r of [...righe].sort((a, b) => b.resto - a.resto)) {
    if (avanzo <= 0) break
    r.base += 1
    avanzo -= 1
  }
  return Object.fromEntries(righe.map((r) => [r.id, segno * r.base]))
}

export const assegnata = (v: Voce) => Object.values(v.quote).some((p) => p > 0)

export const totaleSpesa = (s: Spesa) => s.voci.reduce((t, v) => t + v.prezzo, 0)

/** Quanto deve ogni persona per questa spesa (solo le voci assegnate). */
export function quoteSpesa(s: Spesa): Record<string, number> {
  const quote: Record<string, number> = {}
  for (const v of s.voci) {
    for (const [id, q] of Object.entries(ripartisci(v.prezzo, v.quote))) quote[id] = (quote[id] ?? 0) + q
  }
  return quote
}

/** Somma delle voci non ancora assegnate a nessuno. */
export const nonAssegnato = (s: Spesa) => s.voci.filter((v) => !assegnata(v)).reduce((t, v) => t + v.prezzo, 0)
export const vociNonAssegnate = (s: Spesa) => s.voci.filter((v) => !assegnata(v)).length

/**
 * Saldo di ognuno: positivo = deve ricevere, negativo = deve dare. La somma fa sempre zero.
 * Le voci non assegnate non contano (restano a chi ha pagato finché qualcuno non le assegna).
 */
export function saldi(spese: Spesa[], persone: string[] = []): Record<string, number> {
  const s: Record<string, number> = Object.fromEntries(persone.map((id) => [id, 0]))
  for (const spesa of spese) {
    for (const [id, q] of Object.entries(quoteSpesa(spesa))) {
      s[id] = (s[id] ?? 0) - q
      s[spesa.pagata_da] = (s[spesa.pagata_da] ?? 0) + q
    }
  }
  return s
}

/**
 * I pagamenti per chiudere tutti i debiti: chi deve di più paga chi deve ricevere di più, e così via.
 * Al massimo (persone − 1) pagamenti.
 */
export function rimborsi(saldo: Record<string, number>): Rimborso[] {
  const ordina = (a: [string, number], b: [string, number]) => b[1] - a[1] || a[0].localeCompare(b[0])
  const debitori = Object.entries(saldo)
    .filter(([, v]) => v < 0)
    .map(([id, v]) => [id, -v] as [string, number])
  const creditori = Object.entries(saldo).filter(([, v]) => v > 0)
  const piano: Rimborso[] = []
  while (debitori.length && creditori.length) {
    debitori.sort(ordina)
    creditori.sort(ordina)
    const d = debitori[0]!
    const c = creditori[0]!
    const importo = Math.min(d[1], c[1])
    piano.push({ da: d[0], a: c[0], importo })
    d[1] -= importo
    c[1] -= importo
    if (!d[1]) debitori.shift()
    if (!c[1]) creditori.shift()
  }
  return piano
}
