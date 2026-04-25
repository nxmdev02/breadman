import type { BudgetEntry } from '~/types/finance'

const STORAGE_KEY = 'budget-archive-items'

const defaultBudgetEntries: BudgetEntry[] = [
  {
    id: 1,
    title: '교보문고',
    category: '도서',
    amount: 24800,
    spentAt: '2026-04-06',
    paymentMethod: '카드',
    memo: '읽고 싶던 신간 2권 구입',
    kind: 'expense'
  },
  {
    id: 2,
    title: '월급',
    category: '수입',
    amount: 3200000,
    spentAt: '2026-04-25',
    paymentMethod: '이체',
    memo: '4월 급여',
    kind: 'income'
  },
  {
    id: 3,
    title: '카페',
    category: '식비',
    amount: 5900,
    spentAt: '2026-04-23',
    paymentMethod: '카드',
    memo: '독서 모임 전에 커피',
    kind: 'expense'
  }
]

export const useBudgetArchive = () => {
  const budgetEntries = useState<BudgetEntry[]>('budget-entries', () => defaultBudgetEntries)

  const persist = () => {
    if (!import.meta.client) return
    localStorage.setItem(STORAGE_KEY, JSON.stringify(budgetEntries.value))
  }

  const hydrate = () => {
    if (!import.meta.client) return

    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return

    try {
      const parsed = JSON.parse(stored) as BudgetEntry[]
      if (Array.isArray(parsed) && parsed.length) {
        budgetEntries.value = parsed
      }
    } catch {
      budgetEntries.value = defaultBudgetEntries
    }
  }

  const saveEntry = (entry: Omit<BudgetEntry, 'id'> & { id?: number }) => {
    const normalizedEntry: BudgetEntry = {
      ...entry,
      id: entry.id ?? Date.now()
    }

    const existingIndex = budgetEntries.value.findIndex((item) => item.id === normalizedEntry.id)

    if (existingIndex >= 0) {
      budgetEntries.value[existingIndex] = normalizedEntry
    } else {
      budgetEntries.value.unshift(normalizedEntry)
    }
  }

  onMounted(() => {
    hydrate()
  })

  watch(
    budgetEntries,
    () => {
      persist()
    },
    { deep: true }
  )

  return {
    budgetEntries,
    saveEntry
  }
}
