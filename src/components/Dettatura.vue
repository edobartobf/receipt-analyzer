<script setup lang="ts">
// Campo di testo con il pulsante per dettare: quello che si dice si aggiunge in fondo e resta modificabile.
import { onBeforeUnmount, ref } from 'vue'
import { ascolta, dettaturaDisponibile, type Ascolto } from '../lib/voce'

const testo = defineModel<string>({ required: true })
defineProps<{ segnaposto?: string }>()

const disponibile = dettaturaDisponibile()
const inAscolto = ref(false)
const provvisorio = ref('')
const errore = ref('')
let ascolto: Ascolto | null = null

function alterna() {
  if (inAscolto.value) {
    ascolto?.ferma()
    return
  }
  errore.value = ''
  inAscolto.value = true
  ascolto = ascolta({
    frase: (f) => {
      if (f) testo.value = testo.value.trim() ? `${testo.value.trim()} ${f}` : f
    },
    provvisorio: (p) => (provvisorio.value = p),
    errore: (m) => (errore.value = m),
    fine: () => {
      inAscolto.value = false
      provvisorio.value = ''
    },
  })
}

onBeforeUnmount(() => ascolto?.ferma())
</script>

<template>
  <div class="dettatura">
    <textarea v-model="testo" :placeholder="segnaposto" rows="3"></textarea>
    <p v-if="provvisorio" class="tenue sentito">… {{ provvisorio }}</p>
    <div class="riga-comandi">
      <button v-if="disponibile" type="button" :class="inAscolto ? 'pericolo' : 'secondario'" @click="alterna">
        {{ inAscolto ? '■ Ferma' : '🎤 Detta' }}
      </button>
      <span v-if="inAscolto" class="tenue">Ti ascolto…</span>
      <span v-else-if="!disponibile" class="tenue">Per dettare usa il microfono della tastiera.</span>
      <span class="spazio"></span>
      <button v-if="testo && !inAscolto" type="button" class="secondario piccolo" @click="testo = ''">Cancella</button>
    </div>
    <div v-if="errore" class="messaggio errore">{{ errore }}</div>
  </div>
</template>
