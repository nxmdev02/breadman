import type { BudgetEntry } from '~/types/finance'

export const useBudgetArchive = () => {
  const budgetEntries = useState<BudgetEntry[]>('budget-entries', () => [])
  const currentBalance = useState<number>('budget-current-balance', () => 0)

  const saveEntry = (entry: Omit<BudgetEntry, 'id'> & { id?: number }) => {
    const existingEntry = typeof entry.id === 'number'
      ? budgetEntries.value.find((item) => item.id === entry.id)
      : null

    const normalizedEntry: BudgetEntry = {
      ...entry,
      id: entry.id ?? Date.now(),
      createdAt: existingEntry?.createdAt ?? entry.createdAt ?? new Date().toISOString()
    }

    const existingIndex = budgetEntries.value.findIndex((item) => item.id === normalizedEntry.id)

    if (existingIndex >= 0) {
      budgetEntries.value[existingIndex] = normalizedEntry
    } else {
      budgetEntries.value.unshift(normalizedEntry)
    }
  }

  const deleteEntry = (id: number) => {
    budgetEntries.value = budgetEntries.value.filter((entry) => entry.id !== id)
  }

  return {
    budgetEntries,
    currentBalance,
    saveEntry,
    deleteEntry
  }
}
