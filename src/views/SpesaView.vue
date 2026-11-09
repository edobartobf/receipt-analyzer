<script setup lang="ts">
// Una spesa: le voci, chi le ha prese, chi ha pagato. Serve sia per quella appena letta dallo scontrino
// (percorso /spese/nuova, presa dalla bozza) sia per riaprire e correggere una spesa salvata.
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Dettatura from '../components/Dettatura.vue'
import FotoRepo from '../components/FotoRepo.vue'
import { dimenticaBozza, leggiBozza, ricordaBozza } from '../lib/bozza'
import { assegnata, nonAssegnato, quoteSpesa, ripartisci, totaleSpesa, type Spesa, type Voce } from '../lib/conti'
import { caricaGruppo, gruppo, nomeDi } from '../lib/gruppo'
import { nuovoId } from '../lib/id'
import { impostazioni, inProva } from '../lib/impostazioni'
import { euro, inCampo, leggiImporto } from '../lib/soldi'
import { aggiornaSpese, eliminaSpesa, normalizzaSpesa, salvaSpesa, spese } from '../lib/spese'

const route = useRoute()
const router = useRouter()
const nuova = route.path === '/spese/nuova'

const s = ref<Spesa | null>(null)
const mancante = ref(false)
const fotoNuove = ref<{ blob: Blob; url: string }[]>([])
const avvisi = ref('')
const partiAperte = ref('')
const errore = ref('')
const salvataggio = ref(false)
const indicazioni = ref('')
const riassegnazione = ref(false)
const mostraRiassegna = ref(false)

onMounted(async () => {
  if (!gruppo.caricato) await caricaGruppo()
  if (nuova) {
    const b = await leggiBozza()
    s.value = b?.spesa ?? normalizzaSpesa({ titolo: '', pagata_da: impostazioni.io, voci: [{ id: '', nome: '', prezzo: 0, quote: {} }] })
    fotoNuove.value = (b?.foto ?? []).map((blob) => ({ blob, url: URL.createObjectURL(blob) }))
    avvisi.value = b?.avvisi ?? ''
  } else {
    if (!spese.caricato) await aggiornaSpese()
    const trovata = spese.elenco.find((x) => x.id === route.params.id)
    if (trovata) s.value = JSON.parse(JSON.stringify(trovata)) as Spesa
    else mancante.value = true
  }
})
onBeforeUnmount(() => fotoNuove.value.forEach((f) => URL.revokeObjectURL(f.url)))

// La bozza segue le correzioni: se il telefono chiude l'app non si perde niente
watch(
  s,
  (v) => {
    if (nuova && v && !salvataggio.value) void ricordaBozza({ spesa: v, foto: fotoNuove.value.map((f) => f.blob), avvisi: avvisi.value })
  },
  { deep: true },
)

/** Le persone attive, più quelle che compaiono già in questa spesa. */
const persone = computed(() => {
  const spesa = s.value
  if (!spesa) return []
  return gruppo.persone.filter((p) => p.attiva || p.id === spesa.pagata_da || spesa.voci.some((v) => v.quote[p.id]))
})
const attive = computed(() => persone.value.filter((p) => p.attiva))

const totale = computed(() => (s.value ? totaleSpesa(s.value) : 0))
const quote = computed(() => (s.value ? quoteSpesa(s.value) : {}))
const daAssegnare = computed(() => (s.value ? nonAssegnato(s.value) : 0))
const senzaNessuno = computed(() => s.value?.voci.filter((v) => !assegnata(v)).length ?? 0)
const differenza = computed(() => (s.value?.totale_scontrino == null ? 0 : s.value.totale_scontrino - totale.value))

function alterna(v: Voce, id: string) {
  if (v.quote[id]) delete v.quote[id]
  else v.quote[id] = 1
}

function tutti(v: Voce) {
  const giaTutti = attive.value.every((p) => v.quote[p.id])
  v.quote = giaTutti ? {} : Object.fromEntries(attive.value.map((p) => [p.id, 1]))
}

function cambiaParti(v: Voce, id: string, quanto: number) {
  const n = Math.max(0, (v.quote[id] ?? 0) + quanto)
  if (n) v.quote[id] = n
  else delete v.quote[id]
}

function cambiaPrezzo(v: Voce, e: Event) {
  const campo = e.target as HTMLInputElement
  const letto = leggiImporto(campo.value)
  if (letto !== null) v.prezzo = letto
  campo.value = inCampo(v.prezzo)
}

const dettaglio = (v: Voce) => {
  const r = Object.entries(ripartisci(v.prezzo, v.quote))
  return r.length > 1 ? r.map(([id, q]) => `${nomeDi(id)} ${euro(q)}`).join(' · ') : ''
}

async function aggiungiVoce() {
  s.value!.voci.push({ id: nuovoId(), nome: '', prezzo: 0, quote: {} })
  await nextTick()
  document.querySelector<HTMLInputElement>('.voce-conto:last-child .nome')?.focus()
}

function togliVoce(v: Voce) {
  s.value!.voci = s.value!.voci.filter((x) => x.id !== v.id)
}

function restoATutti() {
  for (const v of s.value!.voci) {
    if (!assegnata(v)) v.quote = Object.fromEntries(attive.value.map((p) => [p.id, 1]))
  }
}

function aggiungiDifferenza() {
  s.value!.voci.push({ id: nuovoId(), nome: 'Differenza con lo scontrino', prezzo: differenza.value, quote: {} })
}

async function riassegna() {
  errore.value = ''
  riassegnazione.value = true
  try {
    const ai = await import('../lib/ai')
    const esito = await ai.riassegna(s.value!.voci, indicazioni.value, attive.value)
    for (const v of s.value!.voci) {
      if (esito.quote[v.id]) v.quote = esito.quote[v.id]!
    }
    avvisi.value = esito.avvisi
    s.value!.nota = [s.value!.nota, indicazioni.value.trim()].filter(Boolean).join('\n')
    indicazioni.value = ''
    mostraRiassegna.value = false
  } catch (e) {
    errore.value = e instanceof Error ? e.message : String(e)
  } finally {
    riassegnazione.value = false
  }
}

async function salva() {
  const spesa = s.value!
  errore.value = ''
  spesa.voci = spesa.voci.filter((v) => v.nome.trim() || v.prezzo)
  if (!spesa.voci.length) {
    errore.value = 'Aggiungi almeno una voce con il suo importo'
    return
  }
  if (!spesa.pagata_da) {
    errore.value = 'Indica chi ha pagato'
    return
  }
  salvataggio.value = true
  try {
    await salvaSpesa(
      spesa,
      fotoNuove.value.map((f) => f.blob),
    )
    if (nuova) await dimenticaBozza()
    router.replace('/spese')
  } catch (e) {
    errore.value = e instanceof Error ? e.message : String(e)
    salvataggio.value = false
  }
}

async function scarta() {
  if (!confirm('Scarto questa spesa senza salvarla?')) return
  salvataggio.value = true // ferma il salvataggio automatico della bozza
  await dimenticaBozza()
  router.replace('/nuova')
}

async function elimina() {
  if (!confirm(`Elimino «${s.value!.titolo}»? I saldi si aggiornano di conseguenza.`)) return
  salvataggio.value = true
  try {
    await eliminaSpesa(s.value!)
    router.replace('/spese')
  } catch (e) {
    errore.value = e instanceof Error ? e.message : String(e)
    salvataggio.value = false
  }
}
</script>

<template>
  <p v-if="mancante" class="messaggio avviso">Questa spesa non c'è più: forse è stata eliminata da un altro telefono.</p>
  <p v-else-if="!s" class="tenue">Carico…</p>

  <template v-else>
    <div class="intestazione">
      <h1>{{ nuova ? 'Controlla e salva' : s.tipo === 'rimborso' ? 'Rimborso' : 'Spesa' }}</h1>
      <button v-if="!nuova" class="pericolo piccolo" :disabled="salvataggio" @click="elimina">Elimina</button>
    </div>

    <div v-if="avvisi" class="messaggio avviso">{{ avvisi }}</div>

    <div class="scheda-box">
      <div class="riga-campi">
        <div>
          <label for="titolo" style="margin-top: 0">Dove</label>
          <input id="titolo" v-model="s.titolo" placeholder="Es. Trattoria, Esselunga" />
        </div>
        <div>
          <label for="data" style="margin-top: 0">Quando</label>
          <input id="data" v-model="s.data" type="date" />
        </div>
      </div>
      <label>{{ s.tipo === 'rimborso' ? 'Chi ha restituito' : 'Chi ha pagato' }}</label>
      <div class="chips">
        <button v-for="p in persone" :key="p.id" class="chip" :class="{ attivo: s.pagata_da === p.id }" @click="s.pagata_da = p.id">
          {{ p.nome }}
        </button>
      </div>
      <div v-if="s.foto.length || fotoNuove.length" class="anteprime">
        <FotoRepo v-for="f in s.foto" :key="f" :percorso="f" alt="Scontrino" ingrandibile />
        <img v-for="f in fotoNuove" :key="f.url" :src="f.url" alt="Scontrino" />
      </div>
    </div>

    <h2>Voci <span class="tenue">· tocca chi le ha prese</span></h2>
    <div class="scheda-box">
      <div v-for="v in s.voci" :key="v.id" class="voce-conto" :class="{ senza: !assegnata(v) }">
        <div class="riga-voce">
          <input v-model="v.nome" class="nome" placeholder="Cosa" aria-label="Nome della voce" />
          <input
            class="prezzo"
            :value="inCampo(v.prezzo)"
            inputmode="decimal"
            aria-label="Importo in euro"
            @focus="($event.target as HTMLInputElement).select()"
            @change="cambiaPrezzo(v, $event)"
          />
          <button class="secondario piccolo" aria-label="Togli la voce" @click="togliVoce(v)">✕</button>
        </div>
        <div class="chips">
          <button v-for="p in persone" :key="p.id" class="chip" :class="{ attivo: v.quote[p.id] }" @click="alterna(v, p.id)">
            {{ p.nome }}<span v-if="(v.quote[p.id] ?? 0) > 1" class="parti">×{{ v.quote[p.id] }}</span>
          </button>
          <button class="chip comando" @click="tutti(v)">Tutti</button>
          <button class="chip comando" @click="partiAperte = partiAperte === v.id ? '' : v.id">Parti diverse</button>
        </div>
        <div v-if="partiAperte === v.id" class="righe-parti">
          <p class="tenue" style="margin-bottom: 4px">Chi ha preso di più ha più parti (es. due birre su tre: 2 e 1).</p>
          <div v-for="p in persone" :key="p.id" class="riga-parti">
            <span class="spazio">{{ p.nome }}</span>
            <button class="secondario piccolo" :aria-label="`Meno parti a ${p.nome}`" @click="cambiaParti(v, p.id, -1)">−</button>
            <span class="numero">{{ v.quote[p.id] ?? 0 }}</span>
            <button class="secondario piccolo" :aria-label="`Più parti a ${p.nome}`" @click="cambiaParti(v, p.id, 1)">＋</button>
          </div>
        </div>
        <p v-if="dettaglio(v)" class="tenue dettaglio-quote">{{ dettaglio(v) }}</p>
      </div>
      <div class="azioni">
        <button class="secondario" @click="aggiungiVoce">＋ Aggiungi una voce</button>
        <button v-if="senzaNessuno" class="secondario" @click="restoATutti">Dividi tra tutti le {{ senzaNessuno }} senza nome</button>
      </div>
    </div>

    <div class="scheda-box">
      <button v-if="!mostraRiassegna" class="secondario" style="width: 100%" @click="mostraRiassegna = true">
        🎤 Assegna a voce
      </button>
      <template v-else>
        <h2 style="margin-top: 0">Di' chi ha preso cosa</h2>
        <Dettatura v-model="indicazioni" segnaposto="Es. i caffè sono di Luca e Francesco, il dolce diviso tra tutti" />
        <div v-if="!inProva && !impostazioni.chiaveAi" class="messaggio avviso">Manca la chiave Anthropic nelle impostazioni.</div>
        <div class="azioni">
          <button class="secondario" :disabled="riassegnazione" @click="mostraRiassegna = false">Chiudi</button>
          <button :disabled="!indicazioni.trim() || riassegnazione || (!inProva && !impostazioni.chiaveAi)" @click="riassegna">
            {{ riassegnazione ? 'Assegno…' : 'Assegna' }}
          </button>
        </div>
      </template>
    </div>

    <h2>Riepilogo</h2>
    <div class="scheda-box riepilogo">
      <div v-for="p in persone.filter((x) => quote[x.id])" :key="p.id" class="riga">
        <span>{{ p.nome }}</span><span class="importo">{{ euro(quote[p.id] ?? 0) }}</span>
      </div>
      <div v-if="daAssegnare" class="riga negativo">
        <span>Da assegnare</span><span class="importo">{{ euro(daAssegnare) }}</span>
      </div>
      <div class="riga totale">
        <span>Totale</span><span class="importo">{{ euro(totale) }}</span>
      </div>
      <div v-if="differenza" class="messaggio avviso">
        Sullo scontrino il totale è {{ euro(s.totale_scontrino ?? 0) }}: le voci danno {{ euro(Math.abs(differenza)) }}
        {{ differenza > 0 ? 'in meno' : 'in più' }}. Controlla gli importi, oppure
        <div class="azioni"><button class="secondario" @click="aggiungiDifferenza">Aggiungi la differenza come voce</button></div>
      </div>
    </div>

    <p v-if="s.nota" class="tenue spezza">Dettato: «{{ s.nota }}»</p>
    <div v-if="errore" class="messaggio errore">{{ errore }}</div>

    <div class="barra-salva">
      <div class="azioni">
        <button v-if="nuova" class="secondario" :disabled="salvataggio" @click="scarta">Scarta</button>
        <button v-else class="secondario" :disabled="salvataggio" @click="router.back()">Annulla</button>
        <button :disabled="salvataggio" @click="salva">{{ salvataggio ? 'Salvo…' : 'Salva' }}</button>
      </div>
    </div>
    <p v-if="daAssegnare" class="tenue">Puoi salvare anche così: le voci non assegnate restano fuori dai saldi finché non le completi.</p>
  </template>
</template>
