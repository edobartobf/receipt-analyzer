<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import Dettatura from '../components/Dettatura.vue'
import { dimenticaBozza, leggiBozza, ricordaBozza, type Bozza } from '../lib/bozza'
import { riduciFoto } from '../lib/foto'
import { attive, caricaGruppo, gruppo } from '../lib/gruppo'
import { impostazioni, inProva } from '../lib/impostazioni'
import { normalizzaSpesa, oggi } from '../lib/spese'

const router = useRouter()

const foto = ref<{ blob: Blob; url: string }[]>([])
const indicazioni = ref('')
const pagataDa = ref(impostazioni.io)
const stato = ref<'' | 'foto' | 'lettura'>('')
const errore = ref('')
const sospesa = ref<Bozza | null>(null)

const persone = computed(() => attive())
const puoLeggere = computed(() => inProva.value || !!impostazioni.chiaveAi)

onMounted(async () => {
  if (!gruppo.caricato) void caricaGruppo()
  sospesa.value = await leggiBozza()
})
onBeforeUnmount(() => foto.value.forEach((f) => URL.revokeObjectURL(f.url)))

async function aggiungiFoto(e: Event) {
  const campo = e.target as HTMLInputElement
  const scelte = [...(campo.files ?? [])]
  campo.value = ''
  errore.value = ''
  stato.value = 'foto'
  try {
    for (const f of scelte) {
      const blob = await riduciFoto(f)
      foto.value.push({ blob, url: URL.createObjectURL(blob) })
    }
  } catch (err) {
    errore.value = err instanceof Error ? err.message : String(err)
  } finally {
    stato.value = ''
  }
}

function togliFoto(i: number) {
  URL.revokeObjectURL(foto.value[i]!.url)
  foto.value.splice(i, 1)
}

async function leggi() {
  errore.value = ''
  stato.value = 'lettura'
  try {
    // caricato solo qui: è la parte più pesante dell'app
    const { leggiScontrino } = await import('../lib/ai')
    const blob = foto.value.map((f) => f.blob)
    const letto = await leggiScontrino(blob, indicazioni.value, persone.value, oggi())
    await ricordaBozza({
      spesa: normalizzaSpesa({
        titolo: letto.titolo,
        data: letto.data ?? oggi(),
        pagata_da: pagataDa.value,
        voci: letto.voci,
        totale_scontrino: letto.totale_scontrino,
        nota: indicazioni.value,
      }),
      foto: blob,
      avvisi: letto.avvisi,
    })
    router.push('/spese/nuova')
  } catch (err) {
    errore.value = err instanceof Error ? err.message : String(err)
  } finally {
    stato.value = ''
  }
}

async function aMano() {
  await ricordaBozza({ spesa: normalizzaSpesa({ titolo: '', pagata_da: pagataDa.value, voci: [{ id: '', nome: '', prezzo: 0, quote: {} }] }), foto: [], avvisi: '' })
  router.push('/spese/nuova')
}

async function scarta() {
  await dimenticaBozza()
  sospesa.value = null
}
</script>

<template>
  <h1>Nuova spesa</h1>

  <div v-if="sospesa" class="messaggio avviso">
    Hai una spesa non ancora salvata{{ sospesa.spesa.titolo ? ` (${sospesa.spesa.titolo})` : '' }}.
    <div class="azioni">
      <button @click="router.push('/spese/nuova')">Riprendila</button>
      <button class="secondario" @click="scarta">Scartala</button>
    </div>
  </div>

  <div v-if="persone.length < 2" class="messaggio avviso">
    Per dividere una spesa servono almeno due persone: aggiungile nelle <RouterLink to="/impostazioni">impostazioni</RouterLink>.
  </div>

  <div class="scheda-box">
    <h2 style="margin-top: 0">1. Lo scontrino</h2>
    <div class="azioni" style="margin-top: 0">
      <label class="pulsante-link" style="margin: 0">
        📷 Scatta
        <input class="nascosto" type="file" accept="image/*" capture="environment" @change="aggiungiFoto" />
      </label>
      <label class="pulsante-link secondario" style="margin: 0">
        🖼 Dalla galleria
        <input class="nascosto" type="file" accept="image/*" multiple @change="aggiungiFoto" />
      </label>
    </div>
    <p v-if="stato === 'foto'" class="tenue" style="margin-top: 8px">Preparo la foto…</p>
    <div v-if="foto.length" class="anteprime">
      <div v-for="(f, i) in foto" :key="f.url" class="anteprima">
        <img :src="f.url" alt="Foto dello scontrino" />
        <button class="pericolo" aria-label="Togli la foto" @click="togliFoto(i)">✕</button>
      </div>
    </div>
    <p v-if="foto.length" class="tenue" style="margin: 8px 0 0">Scontrino lungo? Aggiungi un'altra foto per il resto.</p>
  </div>

  <div class="scheda-box">
    <h2 style="margin-top: 0">2. Chi ha pagato</h2>
    <div class="chips">
      <button v-for="p in persone" :key="p.id" class="chip" :class="{ attivo: pagataDa === p.id }" @click="pagataDa = p.id">
        {{ p.nome }}
      </button>
    </div>
  </div>

  <div class="scheda-box">
    <h2 style="margin-top: 0">3. Chi ha preso cosa <span class="tenue">(facoltativo)</span></h2>
    <Dettatura
      v-model="indicazioni"
      segnaposto="Es. Edo e Francesco hanno mangiato la pasta al sugo, Luca l'insalata con tonno, l'acqua è di tutti"
    />
    <p class="tenue" style="margin: 8px 0 0">Dillo a parole tue: le voci arrivano già divise e poi le puoi correggere.</p>
  </div>

  <div v-if="!puoLeggere" class="messaggio avviso">
    Per leggere gli scontrini manca la chiave Anthropic: inseriscila nelle <RouterLink to="/impostazioni">impostazioni</RouterLink>.
  </div>
  <div v-if="errore" class="messaggio errore">{{ errore }}</div>

  <div class="azioni">
    <button :disabled="!foto.length || !pagataDa || !puoLeggere || !!stato" @click="leggi">
      {{ stato === 'lettura' ? 'Leggo lo scontrino…' : 'Leggi lo scontrino' }}
    </button>
  </div>
  <p v-if="stato === 'lettura'" class="tenue" style="margin-top: 8px">Di solito bastano 10–20 secondi.</p>

  <div class="azioni">
    <button class="secondario" :disabled="!pagataDa || !!stato" @click="aMano">Scrivi una spesa a mano</button>
  </div>
</template>
