// Dettatura con il riconoscimento vocale del browser (Chrome su Android: gratis, in italiano).
// Dove non c'è, resta la tastiera, che su Android ha comunque il suo microfono.

interface Riconoscimento extends EventTarget {
  lang: string
  continuous: boolean
  interimResults: boolean
  start(): void
  stop(): void
  abort(): void
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
}

const Costruttore = (): (new () => Riconoscimento) | undefined => {
  const w = globalThis as unknown as { SpeechRecognition?: new () => Riconoscimento; webkitSpeechRecognition?: new () => Riconoscimento }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition
}

export const dettaturaDisponibile = () => !!Costruttore()

export interface Ascolto {
  ferma(): void
}

/**
 * Ascolta finché non viene fermato. Chrome su Android chiude l'ascolto a ogni pausa:
 * qui riparte da solo, così si può dettare con calma.
 */
export function ascolta(eventi: {
  /** una frase riconosciuta in via definitiva */
  frase(testo: string): void
  /** quello che sta sentendo adesso (cambia mentre si parla) */
  provvisorio(testo: string): void
  errore(messaggio: string): void
  fine(): void
}): Ascolto {
  const C = Costruttore()
  if (!C) {
    eventi.errore('Su questo browser la dettatura non c’è: usa il microfono della tastiera')
    eventi.fine()
    return { ferma() {} }
  }
  let attivo = true
  let r: Riconoscimento

  const avvia = () => {
    r = new C()
    r.lang = 'it-IT'
    r.continuous = false
    r.interimResults = true
    r.onresult = (e) => {
      let provvisorio = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const risultato = e.results[i]!
        const testo = risultato[0]!.transcript
        if (risultato.isFinal) eventi.frase(testo.trim())
        else provvisorio += testo
      }
      eventi.provvisorio(provvisorio.trim())
    }
    r.onerror = (e) => {
      if (e.error === 'no-speech' || e.error === 'aborted') return
      attivo = false
      eventi.errore(
        e.error === 'not-allowed' || e.error === 'service-not-allowed'
          ? 'Microfono non autorizzato: consenti l’uso del microfono a questo sito'
          : e.error === 'network'
            ? 'La dettatura ha bisogno della rete'
            : `La dettatura si è interrotta (${e.error})`,
      )
    }
    r.onend = () => {
      eventi.provvisorio('')
      if (attivo) {
        try {
          avvia()
          return
        } catch {
          attivo = false
        }
      }
      eventi.fine()
    }
    r.start()
  }

  try {
    avvia()
  } catch {
    attivo = false
    eventi.errore('Non riesco ad avviare la dettatura')
    eventi.fine()
  }
  return {
    ferma() {
      attivo = false
      try {
        r.stop()
      } catch {
        /* già ferma */
      }
    },
  }
}
