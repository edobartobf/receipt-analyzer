import { describe, expect, it } from 'vitest'
import { inCampo, leggiImporto } from '../src/lib/soldi'

describe('leggiImporto', () => {
  it('accetta virgola, punto, segno meno e simbolo dell’euro', () => {
    expect(leggiImporto('12,4')).toBe(1240)
    expect(leggiImporto('12.40')).toBe(1240)
    expect(leggiImporto('-1,50')).toBe(-150)
    expect(leggiImporto('€ 3')).toBe(300)
    expect(leggiImporto('0,07')).toBe(7)
  })
  it('rifiuta quello che non è un importo', () => {
    expect(leggiImporto('')).toBeNull()
    expect(leggiImporto('abc')).toBeNull()
    expect(leggiImporto('1,2,3')).toBeNull()
  })
  it('inCampo scrive sempre due decimali con la virgola', () => {
    expect(inCampo(1240)).toBe('12,40')
    expect(inCampo(-150)).toBe('-1,50')
  })
})
