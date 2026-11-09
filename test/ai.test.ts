import { describe, expect, it } from 'vitest'
import { daScontrino, elencoPersone } from '../src/lib/ai'

const persone = [
  { id: 'edo', nome: 'Edoardo', attiva: true },
  { id: 'luca', nome: 'Luca', attiva: true },
]

describe('daScontrino', () => {
  it('converte gli euro in centesimi senza errori di arrotondamento', () => {
    const r = daScontrino(
      { esercente: ' Bar ', data: '2026-11-09', totale: 19.99, voci: [{ nome: 'Panino', prezzo: 4.35, assegnazioni: [] }], avvisi: '' },
      persone,
    )
    expect(r.titolo).toBe('Bar')
    expect(r.totale_scontrino).toBe(1999)
    expect(r.voci[0]!.prezzo).toBe(435)
  })
  it('scarta persone inventate, parti nulle e date scritte male', () => {
    const r = daScontrino(
      {
        esercente: '',
        data: '09/11/2026',
        totale: null,
        voci: [
          {
            nome: 'Birra',
            prezzo: 15,
            assegnazioni: [
              { persona: 'edo', parti: 2 },
              { persona: 'luca', parti: 1 },
              { persona: 'mario', parti: 1 },
              { persona: 'luca', parti: 0 },
            ],
          },
        ],
        avvisi: '',
      },
      persone,
    )
    expect(r.data).toBeNull()
    expect(r.voci[0]!.quote).toEqual({ edo: 2, luca: 1 })
  })
})

describe('elencoPersone', () => {
  it('dice chi sta dettando, così «io» si può attribuire', () => {
    expect(elencoPersone(persone, 'luca')).toContain('Chi detta: Luca (id: luca)')
  })
  it('se chi detta non è nel gruppo non inventa nessuno', () => {
    expect(elencoPersone(persone, 'boh')).not.toContain('Chi detta')
  })
})
