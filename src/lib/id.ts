/** id corto, ordinabile per data: es. "mh8k2x-4f9a" */
export function nuovoId(): string {
  const tempo = Date.now().toString(36)
  const caso = Math.random().toString(36).slice(2, 6).padEnd(4, '0')
  return `${tempo}-${caso}`
}
