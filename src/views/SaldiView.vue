<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { nonAssegnato, rimborsi, saldi, totaleSpesa, type Rimborso } from '../lib/conti'
import { gruppo, nomeDi } from '../lib/gruppo'
import { impostazioni } from '../lib/impostazioni'
import { euro } from '../lib/soldi'
import { aggiornaSpese, oggi, salvaSpesa, spese } from '../lib/spese'

onMounted(() => void aggiornaSpese())

const saldo = computed(() =>
  saldi(
    spese.elenco,
    gruppo.persone.filter((p) => p.attiva).map((p) => p.id),
  ),
)
const righe = computed(() =>
  Object.entries(saldo.value)
    .map(([id, valore]) => ({ id, nome: nomeDi(id), valore }))
    .sort((a, b) => b.valore - a.valore || a.nome.localeCompare(b.nome, 'it')),
)
const piano = computed(() => rimborsi(saldo.value))
const totale = computed(() => spese.elenco.filter((s) => s.tipo === 'spesa').reduce((t, s) => t + totaleSpesa(s), 0))
const fuoriDaiConti = computed(() => spese.elenco.reduce((t, s) => t + nonAssegnato(s), 0))

const chi = (id: string) => (id === impostazioni.io ? 'Tu' : nomeDi(id))
const inCorso = ref('')
const errore = ref('')

async function segnaPagato(r: Rimborso) {
  if (!confirm(`Segno che ${nomeDi(r.da)} ha dato ${euro(r.importo)} a ${nomeDi(r.a)}?`)) return
  errore.value = ''
  inCorso.value = r.da + r.a
  try {
    await salvaSpesa({
      tipo: 'rimborso',
      titolo: `${nomeDi(r.da)} → ${nomeDi(r.a)}`,
      data: oggi(),
      pagata_da: r.da,
      voci: [{ id: '', nome: 'Rimborso', prezzo: r.importo, quote: { [r.a]: 1 } }],
    })
  } catch (e) {
    errore.value = e instanceof Error ? e.message : String(e)
  } finally {
    inCorso.value = ''
  }
}
</script>

<template>
  <h1>Saldi</h1>

  <div v-if="spese.errore" class="messaggio avviso">{{ spese.errore }}</div>
  <p v-if="!spese.caricato" class="tenue">Faccio i conti…</p>

  <template v-else>
    <div class="scheda-box">
      <div v-for="r in righe" :key="r.id" class="riga-saldo">
        <span class="chi">{{ r.nome }} <span v-if="r.id === impostazioni.io" class="etichetta">io</span></span>
        <span class="stato">
          <span v-if="!r.valore" class="tenue">in pari</span>
          <template v-else>
            <span class="importo" :class="r.valore > 0 ? 'positivo' : 'negativo'">{{ euro(Math.abs(r.valore)) }}</span>
            <div class="tenue">{{ r.valore > 0 ? 'da ricevere' : 'da dare' }}</div>
          </template>
        </span>
      </div>
      <p v-if="!righe.length" class="tenue">Aggiungi le persone del gruppo nelle impostazioni.</p>
    </div>

    <h2>Come saldare</h2>
    <div class="scheda-box">
      <p v-if="!piano.length" class="tenue" style="margin: 0">Siete tutti in pari: nessuno deve niente a nessuno.</p>
      <div v-for="r in piano" :key="r.da + r.a" class="pagamento">
        <div class="testo">
          <strong>{{ chi(r.da) }}</strong> → <strong>{{ chi(r.a) }}</strong>
          <div class="importo">{{ euro(r.importo) }}</div>
        </div>
        <button class="secondario" :disabled="!!inCorso" @click="segnaPagato(r)">
          {{ inCorso === r.da + r.a ? 'Salvo…' : 'Segna pagato' }}
        </button>
      </div>
    </div>
    <div v-if="errore" class="messaggio errore">{{ errore }}</div>
    <p v-if="piano.length" class="tenue">
      Sono i pagamenti minimi per chiudere tutto. Quando uno è fatto, «Segna pagato» lo registra e aggiorna i saldi.
    </p>

    <div v-if="fuoriDaiConti" class="messaggio avviso">
      Ci sono voci non ancora assegnate per {{ euro(fuoriDaiConti) }}: finché non le assegni non entrano nei saldi.
    </div>
    <p class="tenue">Speso in tutto dal gruppo: {{ euro(totale) }}</p>
  </template>
</template>
