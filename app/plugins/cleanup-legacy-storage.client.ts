export default defineNuxtPlugin(() => {
  const legacyKeys = [
    'reading-archive-items',
    'budget-archive-items',
    'budget-current-balance'
  ]

  for (const key of legacyKeys) {
    localStorage.removeItem(key)
  }
})
