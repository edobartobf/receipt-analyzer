# Scontrini: decisioni di progetto

App per Edoardo e i colleghi con cui fa la spesa o pranza: uno paga per tutti, si fotografa lo scontrino e l'app
tiene i conti di chi deve cosa a chi, come Tricount ma con le voci lette dalla foto e assegnate a voce.
Decisioni prese il 9/11/2026. Stessa impostazione di Dispensa (`food-shopper`): tutto su GitHub, nessun server.

## Architettura

```
 Telefono (PWA "Scontrini")                      GitHub, account edobartobf
┌───────────────────────────┐   API REST      ┌──────────────────────────────────┐
│ foto, dettatura, voci,    │ ──────────────▶ │ receipt-analyzer-data (PRIVATO)  │
│ saldi; copia offline      │  file JSON      │   gruppo.json                    │
└───────────────────────────┘                 │   spese/<id>.json                │
      │            ▲                          │   foto/<id>.jpg                  │
      │            │ GitHub Pages             └──────────────────────────────────┘
      │      ┌───────────────────────────┐
      │      │ receipt-analyzer (PUBBLICO)│  solo codice, nessun dato
      │      └───────────────────────────┘
      ▼
 api.anthropic.com  (foto + indicazioni → voci assegnate)
```

- **Due repo**: `receipt-analyzer` pubblico (codice, su `edobartobf.github.io/receipt-analyzer`) e
  `receipt-analyzer-data` privato (dati). Pages da repo privato richiederebbe GitHub Pro.
- **Accesso senza account**: un token fine-grained limitato a `receipt-analyzer-data` (*Contents: read and write*).
  Chi entra nel gruppo apre il link del gruppo (Impostazioni → «Invita un collega»): token e chiave Anthropic
  stanno dopo il `#`, quindi non arrivano a nessun server. Poi sceglie il proprio nome.
- **Lettura dello scontrino dal telefono**: l'app chiama direttamente Anthropic con la chiave del gruppo.
  In Dispensa la chiave sta in un segreto di GitHub Actions e l'import dura un minuto; qui serve la risposta
  subito, mentre si è ancora a tavola. Il prezzo è che la chiave sta sui telefoni dei colleghi: va usata una chiave
  dedicata a quest'app, con un tetto di spesa basso nella console Anthropic, da revocare se il link finisce in giro.
- **Modello**: `claude-opus-5-5` a impegno basso (`src/lib/ai.ts`, costante `MODELLO`): qualche centesimo a scontrino.
  Se si vuole spendere meno si prova `claude-haiku-5-5` (circa un decimo di centesimo) sugli scontrini veri.
- **Dettatura**: riconoscimento vocale del browser (Chrome su Android), il testo resta modificabile prima dell'invio.
  Claude non riceve audio. Dove il riconoscimento non c'è si usa il microfono della tastiera.
- **Concorrenza**: una spesa = un file, quindi due telefoni che aggiungono spese non si toccano. Le modifiche usano
  lo `sha` del file: se un altro telefono ha cambiato la stessa spesa, l'app lo dice e non sovrascrive.
- **Offline**: le spese si vedono e i saldi si calcolano dalla copia sul telefono (IndexedDB). Per aggiungere o
  modificare serve la rete.

## I conti
- Importi sempre in centesimi interi. Una voce si divide per **parti** (`{edo: 1, fra: 1}` = metà a testa,
  `{edo: 2, luca: 1}` = due terzi e un terzo); i centesimi che avanzano vanno a chi ha il resto più grande.
- Saldo di una persona = quello che ha pagato per gli altri − le sue quote. La somma dei saldi fa sempre zero.
- Le voci non assegnate restano fuori dai saldi finché qualcuno non le assegna (la spesa si può salvare lo stesso).
- «Come saldare»: chi deve di più paga chi deve ricevere di più, e così via: al massimo (persone − 1) pagamenti.
  «Segna pagato» registra un **rimborso**, che è una spesa con una sola voce: chi restituisce "paga",
  chi riceve ha tutta la quota. Così i conti non hanno casi speciali.
- Se la somma delle voci non coincide con il totale letto sullo scontrino, l'app lo segnala e offre di aggiungere
  la differenza come voce.

## Tecnologia
Vue 3 + Vite + TypeScript, `vue-router` con hash, `vite-plugin-pwa`, `idb-keyval`, `@anthropic-ai/sdk` + `zod`
(output strutturato). `src/lib/github.ts` e `foto.ts` vengono da Dispensa.
Modalità di prova (token `demo`): repo finto nel localStorage e scontrino finto, per provare l'app e per i test a mano.

## Non ancora fatto
- Provato solo in modalità di prova: mancano la lettura di uno scontrino vero, la dettatura su un telefono vero
  e il giro completo con il repo dati.
- Più gruppi, valute diverse dall'euro, vocale registrato (servirebbe una trascrizione a parte),
  ricevere la foto dal menu «Condividi», modifiche offline in coda, storico per coppia di persone.

## Formato dei dati

`gruppo.json`
```json
{ "persone": [{ "id": "mh8k2x-4f9a", "nome": "Edo", "attiva": true }] }
```

`spese/<id>.json`
```json
{
  "id": "mh8k3a-77qp",
  "tipo": "spesa",
  "titolo": "Trattoria",
  "data": "2026-11-09",
  "pagata_da": "mh8k2x-4f9a",
  "voci": [
    { "id": "v1", "nome": "Pasta al sugo", "prezzo": 1800, "quote": { "mh8k2x-4f9a": 1, "mh8k2y-1b2c": 1 } },
    { "id": "v2", "nome": "Caffè", "prezzo": 500, "quote": {} }
  ],
  "totale_scontrino": 2300,
  "nota": "Edo e Francesco hanno mangiato la pasta al sugo",
  "foto": ["foto/mh8k3b-9zzt.jpg"],
  "creata_da": "Edo",
  "creata_il": "2026-11-09T12:40:00Z",
  "modificata_il": "2026-11-09T12:40:00Z"
}
```
`prezzo` e `totale_scontrino` in centesimi. `tipo: "rimborso"` per i pagamenti tra persone.
