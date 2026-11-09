<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { svuotaDemo } from '../lib/demo'
import { verificaAccesso } from '../lib/github'
import { aggiungiPersona, caricaGruppo, gruppo, rinominaPersona, togliPersona, type Persona } from '../lib/gruppo'
import { collegata, configurata, impostazioni, inProva, linkConfigurazione, REPO_PREDEFINITO } from '../lib/impostazioni'
import { aggiornaSpese, spese } from '../lib/spese'

const router = useRouter()

const mostraSegreti = ref(false)
const verifica = ref<{ ok: boolean; messaggio: string } | null>(null)
const inVerifica = ref(false)
const linkCopiato = ref(false)
const nuovoNome = ref('')
const errorePersone = ref('')
const occupato = ref(false)

const persone = computed(() => gruppo.persone.filter((p) => p.attiva || p.id === impostazioni.io))

onMounted(() => {
  if (collegata.value) void caricaGruppo()
})

async function controlla() {
  inVerifica.value = true
  verifica.value = await verificaAccesso()
  inVerifica.value = false
  if (verifica.value.ok) await caricaGruppo()
}

function provaSenzaAccount() {
  impostazioni.token = 'demo'
  impostazioni.io = ''
  verifica.value = null
  void caricaGruppo()
}

function esciDallaProva() {
  svuotaDemo()
  Object.assign(impostazioni, { token: '', repo: REPO_PREDEFINITO, io: '', nome: '' })
  gruppo.persone = []
  gruppo.caricato = false
  spese.elenco = []
  spese.caricato = false
}

async function conPersone(azione: () => Promise<unknown>) {
  errorePersone.value = ''
  occupato.value = true
  try {
    await azione()
  } catch (e) {
    errorePersone.value = e instanceof Error ? e.message : String(e)
  } finally {
    occupato.value = false
  }
}

const aggiungi = () =>
  conPersone(async () => {
    const p = await aggiungiPersona(nuovoNome.value)
    nuovoNome.value = ''
    // il primo che si aggiunge di solito è chi sta configurando
    if (!impostazioni.io) sonoIo(p)
  })

function sonoIo(p: Persona) {
  impostazioni.io = p.id
  impostazioni.nome = p.nome
}

function rinomina(p: Persona) {
  const nome = prompt('Nuovo nome', p.nome)?.trim()
  if (!nome || nome === p.nome) return
  void conPersone(async () => {
    await rinominaPersona(p.id, nome)
    if (impostazioni.io === p.id) impostazioni.nome = nome
  })
}

function togli(p: Persona) {
  const haSpese = spese.elenco.some((s) => s.pagata_da === p.id || s.voci.some((v) => v.quote[p.id]))
  const domanda = haSpese
    ? `${p.nome} ha delle spese: resta nei conti ma non comparirà più nelle spese nuove. Continuo?`
    : `Tolgo ${p.nome} dal gruppo?`
  if (!confirm(domanda)) return
  void conPersone(async () => {
    if (!spese.caricato) await aggiornaSpese()
    await togliPersona(p.id, haSpese)
    if (impostazioni.io === p.id) Object.assign(impostazioni, { io: '', nome: '' })
  })
}

async function condividiLink() {
  const link = linkConfigurazione()
  if (navigator.share) {
    try {
      await navigator.share({ title: 'Entra in Scontrini', text: 'Apri questo link dal telefono per entrare nel gruppo delle spese', url: link })
      return
    } catch {
      /* annullato: proviamo a copiarlo */
    }
  }
  await navigator.clipboard.writeText(link)
  linkCopiato.value = true
}
</script>

<template>
  <h1>Impostazioni</h1>

  <div v-if="inProva" class="messaggio avviso">
    Modalità di prova: i dati restano solo su questo telefono e lo scontrino letto è finto.
    <div class="azioni"><button class="secondario" @click="esciDallaProva">Esci dalla prova e cancella i dati</button></div>
  </div>
  <div v-else-if="!collegata" class="messaggio avviso">
    Se ti hanno mandato un link del gruppo, aprilo da questo telefono: si configura tutto da solo. Altrimenti inserisci qui
    sotto il token GitHub del repo dei dati.
  </div>
  <div v-else-if="!configurata" class="messaggio avviso">Manca solo una cosa: di' chi sei nell'elenco delle persone.</div>

  <div v-if="collegata" class="scheda-box">
    <h2 style="margin-top: 0">Persone del gruppo</h2>
    <p class="tenue">Tra queste persone si dividono le spese. Tocca «Sono io» sul tuo nome.</p>
    <div v-if="gruppo.errore" class="messaggio errore">{{ gruppo.errore }}</div>
    <div v-for="p in persone" :key="p.id" class="riga-persona">
      <span class="nome">{{ p.nome }} <span v-if="impostazioni.io === p.id" class="etichetta">io</span></span>
      <button v-if="impostazioni.io !== p.id" class="secondario piccolo" @click="sonoIo(p)">Sono io</button>
      <button class="secondario piccolo" :disabled="occupato" aria-label="Rinomina" @click="rinomina(p)">✎</button>
      <button class="pericolo piccolo" :disabled="occupato" aria-label="Togli" @click="togli(p)">✕</button>
    </div>
    <p v-if="gruppo.caricato && !persone.length" class="tenue">Ancora nessuno: aggiungi te e i tuoi colleghi.</p>
    <form class="riga-aggiungi" @submit.prevent="aggiungi">
      <input v-model="nuovoNome" placeholder="Nome da aggiungere" autocomplete="off" enterkeyhint="done" />
      <button :disabled="!nuovoNome.trim() || occupato">Aggiungi</button>
    </form>
    <div v-if="errorePersone" class="messaggio errore">{{ errorePersone }}</div>
    <div v-if="configurata" class="azioni">
      <button @click="router.push('/spese')">Vai alle spese</button>
    </div>
  </div>

  <div v-if="collegata && !inProva" class="scheda-box">
    <h2 style="margin-top: 0">Invita un collega</h2>
    <p class="tenue">
      Il link contiene il token e la chiave per leggere gli scontrini: mandalo solo a chi fa parte del gruppo. Chi lo apre
      sceglie il proprio nome.
    </p>
    <div class="azioni">
      <button class="secondario" @click="condividiLink">Condividi il link del gruppo</button>
    </div>
    <div v-if="linkCopiato" class="messaggio ok">Link copiato.</div>
  </div>

  <div v-if="!inProva" class="scheda-box">
    <h2 style="margin-top: 0">Collegamento</h2>
    <label for="token">Token GitHub</label>
    <input
      id="token"
      v-model.trim="impostazioni.token"
      :type="mostraSegreti ? 'text' : 'password'"
      placeholder="github_pat_…"
      autocomplete="off"
      spellcheck="false"
    />
    <label for="repo">Repo dei dati</label>
    <input id="repo" v-model.trim="impostazioni.repo" spellcheck="false" autocapitalize="off" />

    <label for="chiave">Chiave Anthropic</label>
    <input
      id="chiave"
      v-model.trim="impostazioni.chiaveAi"
      :type="mostraSegreti ? 'text' : 'password'"
      placeholder="sk-ant-…"
      autocomplete="off"
      spellcheck="false"
    />
    <p class="tenue" style="margin-top: 6px">Serve solo per leggere gli scontrini: senza, le spese si scrivono a mano.</p>

    <div class="azioni">
      <button class="secondario" @click="mostraSegreti = !mostraSegreti">{{ mostraSegreti ? 'Nascondi' : 'Mostra' }}</button>
      <button :disabled="!impostazioni.token || inVerifica" @click="controlla">
        {{ inVerifica ? 'Controllo…' : 'Controlla il collegamento' }}
      </button>
    </div>
    <div v-if="verifica" class="messaggio" :class="verifica.ok ? 'ok' : 'errore'">{{ verifica.messaggio }}</div>
  </div>

  <div v-if="!collegata" class="scheda-box">
    <h2 style="margin-top: 0">Solo per dare un'occhiata</h2>
    <p class="tenue">Prova l'app senza token: dati solo su questo telefono, scontrino finto.</p>
    <div class="azioni"><button class="secondario" @click="provaSenzaAccount">Prova senza account</button></div>
  </div>
</template>
