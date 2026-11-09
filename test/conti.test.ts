import { describe, expect, it } from 'vitest'
import { nonAssegnato, quoteSpesa, rimborsi, ripartisci, saldi, type Spesa, type Voce } from '../src/lib/conti'

const voce = (prezzo: number, quote: Record<string, number>): Voce => ({ id: 'v', nome: 'x', prezzo, quote })
const spesa = (pagata_da: string, voci: Voce[]): Spesa => ({
  id: 's',
  tipo: 'spesa',
  titolo: 't',
  data: '2026-11-09',
  pagata_da,
  voci,
  totale_scontrino: null,
  nota: '',
  foto: [],
  creata_da: '',
  creata_il: '',
  modificata_il: '',
})
const somma = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0)

describe('ripartisci', () => {
  it('divide a metà', () => {
    expect(ripartisci(1800, { edo: 1, fra: 1 })).toEqual({ edo: 900, fra: 900 })
  })
  it('i centesimi che avanzano non si perdono', () => {
    const r = ripartisci(1000, { a: 1, b: 1, c: 1 })
    expect(somma(r)).toBe(1000)
    expect(Object.values(r).sort()).toEqual([333, 333, 334])
  })
  it('rispetta le parti diverse', () => {
    expect(ripartisci(900, { edo: 2, luca: 1 })).toEqual({ edo: 600, luca: 300 })
  })
  it('uno sconto si divide come una voce, con il segno meno', () => {
    const r = ripartisci(-100, { a: 1, b: 1, c: 1 })
    expect(somma(r)).toBe(-100)
  })
  it('senza nessuno non assegna niente', () => {
    expect(ripartisci(500, {})).toEqual({})
    expect(ripartisci(500, { a: 0 })).toEqual({})
  })
})

describe('saldi', () => {
  // l'esempio di Edoardo: pasta al sugo per Edo e Francesco, insalata per Luca, paga Edo
  const pranzo = spesa('edo', [voce(1800, { edo: 1, fra: 1 }), voce(950, { luca: 1 })])

  it('chi ha pagato deve ricevere le quote degli altri', () => {
    expect(quoteSpesa(pranzo)).toEqual({ edo: 900, fra: 900, luca: 950 })
    expect(saldi([pranzo])).toEqual({ edo: 1850, fra: -900, luca: -950 })
  })
  it('la somma dei saldi fa sempre zero', () => {
    const altre = [pranzo, spesa('luca', [voce(1000, { edo: 1, fra: 1, luca: 1 })]), spesa('fra', [voce(-333, { edo: 2, luca: 5 })])]
    expect(somma(saldi(altre))).toBe(0)
  })
  it('le voci non assegnate restano fuori dai conti', () => {
    const s = spesa('edo', [voce(1000, { luca: 1 }), voce(500, {})])
    expect(nonAssegnato(s)).toBe(500)
    expect(saldi([s])).toEqual({ edo: 1000, luca: -1000 })
  })
  it('un rimborso azzera il debito', () => {
    const rimborso = { ...spesa('luca', [voce(950, { edo: 1 })]), tipo: 'rimborso' as const }
    expect(saldi([pranzo, rimborso]).luca).toBe(0)
  })
  it('chi non ha spese compare in pari', () => {
    expect(saldi([], ['a', 'b'])).toEqual({ a: 0, b: 0 })
  })
})

describe('rimborsi', () => {
  it('propone i pagamenti che azzerano tutti i saldi', () => {
    const saldo = { edo: 1850, fra: -900, luca: -950 }
    const piano = rimborsi(saldo)
    expect(piano).toEqual([
      { da: 'luca', a: 'edo', importo: 950 },
      { da: 'fra', a: 'edo', importo: 900 },
    ])
  })
  it('non servono mai più pagamenti delle persone meno una', () => {
    const saldo = { a: 700, b: 300, c: -450, d: -250, e: -300 }
    const piano = rimborsi(saldo)
    expect(piano.length).toBeLessThanOrEqual(4)
    const dopo: Record<string, number> = { ...saldo }
    for (const r of piano) {
      dopo[r.da]! += r.importo
      dopo[r.a]! -= r.importo
    }
    expect(Object.values(dopo).every((v) => v === 0)).toBe(true)
  })
  it('tutti in pari: nessun pagamento', () => {
    expect(rimborsi({ a: 0, b: 0 })).toEqual([])
  })
})
