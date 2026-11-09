// Gli importi si tengono sempre in centesimi interi: niente errori di arrotondamento nelle somme.
const formato = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' })

/** 1240 → "12,40 €" */
export const euro = (centesimi: number) => formato.format(centesimi / 100)

/** 1240 → "12,40" (per i campi da modificare) */
export const inCampo = (centesimi: number) => (centesimi / 100).toFixed(2).replace('.', ',')

/** "12,4", "12.40", "-1,50", "€ 3" → centesimi. null se non è un importo. */
export function leggiImporto(testo: string): number | null {
  const pulito = testo.replace(/[€\s]/g, '').replace(',', '.')
  if (!/^-?\d*\.?\d*$/.test(pulito) || !/\d/.test(pulito)) return null
  return Math.round(Number(pulito) * 100)
}
