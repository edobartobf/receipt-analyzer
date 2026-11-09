# Scontrini

App installabile (PWA) per dividere le spese tra colleghi: si fotografa lo scontrino, Claude legge le voci e le
assegna a chi le ha prese secondo quello che si detta ("Edo e Francesco la pasta al sugo, Luca l'insalata"),
si corregge a mano e l'app tiene i saldi e propone come pareggiare i conti.

Architettura, formato dei dati e scelte: [DECISIONI.md](DECISIONI.md).

- `npm run dev` avvia l'app in locale; in Impostazioni «Prova senza account» la fa girare senza GitHub né Anthropic
  (dati nel browser, scontrino finto).
- `npm test` · `npm run build`
- Ogni push su `main` pubblica su GitHub Pages (`.github/workflows/pubblica.yml`).
