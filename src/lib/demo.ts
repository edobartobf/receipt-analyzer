// Repo dati finto per la modalità di prova (token "demo"): risponde come le API di GitHub
// ma tiene i file nel localStorage di questo telefono.
const CHIAVE = 'scontrini:demo'

interface FileFinto {
  b64: string
  sha: string
}

let file: Record<string, FileFinto> = {}
try {
  file = JSON.parse(localStorage.getItem(CHIAVE) ?? '{}')
} catch {
  /* si parte da vuoto */
}

function salva() {
  try {
    localStorage.setItem(CHIAVE, JSON.stringify(file))
  } catch {
    /* spazio finito (foto grandi): resta in memoria fino alla chiusura */
  }
}

const json = (corpo: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json', ...headers } })

const nuovoSha = () => Math.random().toString(16).slice(2).padEnd(12, '0') + Date.now().toString(16)

export function rispostaDemo(percorso: string, init: RequestInit): Response {
  const metodo = init.method ?? 'GET'
  const intestazioni = (init.headers ?? {}) as Record<string, string>
  const resto = percorso.match(/^\/repos\/[^/]+\/[^/]+(\/.*)?$/)?.[1] ?? ''
  if (!resto) return json({ full_name: 'prova (dati solo su questo telefono)', permissions: { push: true } })

  if (resto.startsWith('/git/blobs/')) {
    const trovato = Object.values(file).find((f) => f.sha === resto.slice('/git/blobs/'.length))
    return trovato ? json({ content: trovato.b64 }) : json({ message: 'Not Found' }, 404)
  }

  if (!resto.startsWith('/contents/')) return json({ message: 'Not Found' }, 404)
  const nome = decodeURIComponent(resto.slice('/contents/'.length))
  const esistente = file[nome]

  if (metodo === 'PUT') {
    const corpo = JSON.parse(String(init.body)) as { content: string; sha?: string }
    if (esistente && corpo.sha !== esistente.sha) return json({ message: 'sha non valido' }, 409)
    file[nome] = { b64: corpo.content, sha: nuovoSha() }
    salva()
    return json({ content: { sha: file[nome].sha } })
  }
  if (metodo === 'DELETE') {
    delete file[nome]
    salva()
    return json({})
  }
  if (esistente) {
    if (intestazioni['If-None-Match'] === `"${esistente.sha}"`) return new Response(null, { status: 304 })
    if (intestazioni.Accept === 'application/vnd.github.raw') {
      return new Response(Uint8Array.from(atob(esistente.b64), (c) => c.charCodeAt(0)))
    }
    return json({ content: esistente.b64, sha: esistente.sha }, 200, { ETag: `"${esistente.sha}"` })
  }
  const figli = Object.entries(file)
    .filter(([p]) => p.startsWith(`${nome}/`) && !p.slice(nome.length + 1).includes('/'))
    .map(([p, f]) => ({ name: p.slice(nome.length + 1), path: p, sha: f.sha, type: 'file' }))
  return figli.length ? json(figli) : json({ message: 'Not Found' }, 404)
}

export function svuotaDemo() {
  file = {}
  salva()
}
