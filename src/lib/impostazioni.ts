// Impostazioni del telefono: token GitHub, repo dei dati, chiave Anthropic, chi sta usando l'app.
// Restano solo su questo telefono (localStorage).
import { computed, reactive, watch } from 'vue'

export const REPO_PREDEFINITO = 'edobartobf/receipt-analyzer-data'
const CHIAVE = 'scontrini:impostazioni'

interface Impostazioni {
  token: string
  repo: string
  /** chiave API Anthropic: serve solo per leggere gli scontrini */
  chiaveAi: string
  /** id della persona del gruppo che usa questo telefono */
  io: string
  /** il suo nome: firma le modifiche salvate su GitHub */
  nome: string
}

const VUOTE: Impostazioni = { token: '', repo: REPO_PREDEFINITO, chiaveAi: '', io: '', nome: '' }

function carica(): Impostazioni {
  try {
    return { ...VUOTE, ...JSON.parse(localStorage.getItem(CHIAVE) ?? '{}') }
  } catch {
    return { ...VUOTE }
  }
}

export const impostazioni = reactive<Impostazioni>(carica())

watch(impostazioni, (v) => {
  try {
    localStorage.setItem(CHIAVE, JSON.stringify(v))
  } catch {
    /* modalità privata: le impostazioni durano solo questa sessione */
  }
})

export const collegata = computed(() => !!impostazioni.token && !!impostazioni.repo)
export const configurata = computed(() => collegata.value && !!impostazioni.io)
/** Prova senza GitHub né Anthropic: i dati restano su questo telefono e lo scontrino letto è finto. */
export const inProva = computed(() => impostazioni.token === 'demo')

/** Link da aprire sugli altri telefoni: token e chiave stanno dopo il "#", quindi non arrivano a nessun server. */
export function linkConfigurazione(): string {
  const base = `${location.origin}${import.meta.env.BASE_URL}`
  const q = new URLSearchParams({ t: impostazioni.token, r: impostazioni.repo })
  if (impostazioni.chiaveAi) q.set('a', impostazioni.chiaveAi)
  return `${base}#/configura?${q}`
}
