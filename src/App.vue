<script setup lang="ts">
import { onBeforeUnmount, onMounted, watch } from 'vue'
import { RouterLink, RouterView } from 'vue-router'
import { caricaGruppo } from './lib/gruppo'
import { collegata, impostazioni } from './lib/impostazioni'
import { aggiornaSpese } from './lib/spese'

// I dati si rileggono all'apertura, quando si torna all'app e quando cambia il collegamento
function aggiorna() {
  if (!collegata.value) return
  void caricaGruppo()
  void aggiornaSpese()
}
const alRitorno = () => document.visibilityState === 'visible' && aggiorna()

onMounted(() => {
  aggiorna()
  document.addEventListener('visibilitychange', alRitorno)
})
onBeforeUnmount(() => document.removeEventListener('visibilitychange', alRitorno))
watch(() => [impostazioni.token, impostazioni.repo], aggiorna)
</script>

<template>
  <div class="app">
    <main class="contenuto">
      <RouterView />
    </main>
    <nav class="barra">
      <RouterLink to="/spese" class="scheda">
        <span class="icona" aria-hidden="true">🧾</span><span>Spese</span>
      </RouterLink>
      <RouterLink to="/nuova" class="scheda">
        <span class="icona" aria-hidden="true">📷</span><span>Nuova</span>
      </RouterLink>
      <RouterLink to="/saldi" class="scheda">
        <span class="icona" aria-hidden="true">⚖️</span><span>Saldi</span>
      </RouterLink>
      <RouterLink to="/impostazioni" class="scheda">
        <span class="icona" aria-hidden="true">⚙</span><span>Impostazioni</span>
      </RouterLink>
    </nav>
  </div>
</template>
