<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { RouterLink } from 'vue-router'
import { quoteSpesa, totaleSpesa, vociNonAssegnate, type Spesa } from '../lib/conti'
import { nomeDi } from '../lib/gruppo'
import { impostazioni } from '../lib/impostazioni'
import { euro } from '../lib/soldi'
import { aggiornaSpese, spese } from '../lib/spese'

onMounted(() => void aggiornaSpese())

const giorno = (data: string) => new Date(`${data}T12:00`).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' })

const righe = computed(() =>
  spese.elenco.map((s) => ({
    s,
    totale: totaleSpesa(s),
    mia: quoteSpesa(s)[impostazioni.io] ?? 0,
    daCompletare: vociNonAssegnate(s),
  })),
)

const descrizione = (s: Spesa) =>
  s.tipo === 'rimborso'
    ? `${nomeDi(s.pagata_da)} ha restituito a ${Object.keys(s.voci[0]?.quote ?? {}).map(nomeDi).join(', ') || '?'}`
    : `ha pagato ${s.pagata_da === impostazioni.io ? 'tu' : nomeDi(s.pagata_da)}`
</script>

<template>
  <div class="intestazione">
    <h1>Spese</h1>
    <RouterLink to="/nuova" class="pulsante-link">＋ Nuova</RouterLink>
  </div>

  <div v-if="spese.errore" class="messaggio avviso">{{ spese.errore }}</div>
  <p v-if="!spese.caricato" class="tenue">Carico le spese…</p>

  <div v-else-if="!righe.length" class="scheda-box vuoto">
    <p><strong>Ancora nessuna spesa</strong></p>
    <p class="tenue">Fotografa uno scontrino: le voci si leggono da sole e le dividi tra chi le ha prese.</p>
    <RouterLink to="/nuova" class="pulsante-link">📷 Fotografa uno scontrino</RouterLink>
  </div>

  <RouterLink v-for="r in righe" :key="r.s.id" :to="`/spese/${r.s.id}`" class="scheda-box compatta riga-spesa">
    <div class="testo">
      <div class="titolo">{{ r.s.tipo === 'rimborso' ? '↪ Rimborso' : r.s.titolo }}</div>
      <div class="tenue">{{ giorno(r.s.data) }} · {{ descrizione(r.s) }}</div>
      <span v-if="r.daCompletare" class="etichetta avviso">{{ r.daCompletare === 1 ? '1 voce da assegnare' : `${r.daCompletare} voci da assegnare` }}</span>
    </div>
    <div class="importi">
      <div class="importo">{{ euro(r.totale) }}</div>
      <div v-if="r.s.tipo === 'spesa' && r.mia" class="tenue">tu {{ euro(r.mia) }}</div>
    </div>
  </RouterLink>
</template>
