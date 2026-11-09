<script setup lang="ts">
import { onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { impostazioni } from '../lib/impostazioni'

// Aperto dal link di configurazione: #/configura?t=<token>&r=<repo>&a=<chiave Anthropic>
const route = useRoute()
const router = useRouter()

onMounted(() => {
  const { t, r, a } = route.query
  if (typeof t === 'string' && t) impostazioni.token = t
  if (typeof r === 'string' && r) impostazioni.repo = r
  if (typeof a === 'string' && a) impostazioni.chiaveAi = a
  // Toglie token e chiave dall'indirizzo e dalla cronologia
  router.replace('/impostazioni')
})
</script>

<template>
  <p>Configurazione in corso…</p>
</template>
