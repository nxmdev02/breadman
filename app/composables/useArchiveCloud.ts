import { doc, getDoc, setDoc } from 'firebase/firestore'
import type {
  BudgetSnapshot,
  FinanceSummary,
  ReadingSnapshot,
  SyncPhase
} from '~/types/firebase'
import type { BookEntry } from '~/types/book'
import type { BudgetEntry } from '~/types/finance'

const normalizeReadingSnapshot = (snapshot?: Partial<ReadingSnapshot> | null): ReadingSnapshot => ({
  items: Array.isArray(snapshot?.items) ? snapshot.items as BookEntry[] : [],
  updatedAt: typeof snapshot?.updatedAt === 'string' ? snapshot.updatedAt : undefined
})

const normalizeBudgetSnapshot = (snapshot?: Partial<BudgetSnapshot> | null): BudgetSnapshot => ({
  items: Array.isArray(snapshot?.items) ? snapshot.items as BudgetEntry[] : [],
  updatedAt: typeof snapshot?.updatedAt === 'string' ? snapshot.updatedAt : undefined
})

const normalizeFinanceSummary = (snapshot?: Partial<FinanceSummary> | null): FinanceSummary => ({
  currentBalance: Number(snapshot?.currentBalance ?? 0),
  updatedAt: typeof snapshot?.updatedAt === 'string' ? snapshot.updatedAt : undefined
})

const removeUndefinedFields = <T>(value: T): T => {
  if (Array.isArray(value)) {
    return value.map((item) => removeUndefinedFields(item)) as T
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, fieldValue]) => fieldValue !== undefined)
        .map(([key, fieldValue]) => [key, removeUndefinedFields(fieldValue)])
    ) as T
  }

  return value
}

export const useArchiveCloud = () => {
  const { $firestore } = useNuxtApp()
  const { user } = useFirebaseSession()

  const isCloudConfigured = computed(() => Boolean($firestore))
  const isAuthenticated = computed(() => Boolean(user.value?.uid))

  const getReadingRef = () => doc($firestore!, 'users', user.value!.uid, 'archives', 'reading')
  const getBudgetRef = () => doc($firestore!, 'users', user.value!.uid, 'archives', 'budget')
  const getFinanceRef = () => doc($firestore!, 'users', user.value!.uid, 'archives', 'finance')

  const readingSyncState = useState<SyncPhase>('reading-sync-state', () => 'idle')
  const budgetSyncState = useState<SyncPhase>('budget-sync-state', () => 'idle')
  const financeSyncState = useState<SyncPhase>('finance-sync-state', () => 'idle')

  const readingSyncError = useState<string | null>('reading-sync-error', () => null)
  const budgetSyncError = useState<string | null>('budget-sync-error', () => null)
  const financeSyncError = useState<string | null>('finance-sync-error', () => null)

  const runWithSync = async <T>(
    state: Ref<SyncPhase>,
    errorState: Ref<string | null>,
    phase: SyncPhase,
    task: () => Promise<T>
  ) => {
    if (!$firestore || !user.value?.uid) {
      return null as T | null
    }

    state.value = phase
    errorState.value = null

    try {
      const result = await task()
      state.value = 'idle'
      return result
    } catch (error) {
      state.value = 'error'
      errorState.value = error instanceof Error ? error.message : 'Firebase request failed'
      return null as T | null
    }
  }

  const fetchReadingSnapshot = async (phase: SyncPhase = 'loading') =>
    runWithSync(readingSyncState, readingSyncError, phase, async () => {
      const readingRef = getReadingRef()
      const readingSnapshot = await getDoc(readingRef)

      if (!readingSnapshot.exists()) {
        return null
      }

      return normalizeReadingSnapshot(readingSnapshot.data() as Partial<ReadingSnapshot>)
    })

  const saveReadingSnapshot = async (items: BookEntry[]) =>
    runWithSync(readingSyncState, readingSyncError, 'saving', async () => {
      const readingRef = getReadingRef()
      await setDoc(readingRef, {
        items: removeUndefinedFields(items),
        updatedAt: new Date().toISOString()
      })
      return true
    })

  const fetchBudgetSnapshot = async (phase: SyncPhase = 'loading') =>
    runWithSync(budgetSyncState, budgetSyncError, phase, async () => {
      const budgetRef = getBudgetRef()
      const budgetSnapshot = await getDoc(budgetRef)

      if (!budgetSnapshot.exists()) {
        return null
      }

      return normalizeBudgetSnapshot(budgetSnapshot.data() as Partial<BudgetSnapshot>)
    })

  const saveBudgetSnapshot = async (items: BudgetEntry[]) =>
    runWithSync(budgetSyncState, budgetSyncError, 'saving', async () => {
      const budgetRef = getBudgetRef()
      await setDoc(budgetRef, {
        items: removeUndefinedFields(items),
        updatedAt: new Date().toISOString()
      })
      return true
    })

  const fetchFinanceSummary = async (phase: SyncPhase = 'loading') =>
    runWithSync(financeSyncState, financeSyncError, phase, async () => {
      const financeRef = getFinanceRef()
      const financeSnapshot = await getDoc(financeRef)

      if (!financeSnapshot.exists()) {
        return null
      }

      return normalizeFinanceSummary(financeSnapshot.data() as Partial<FinanceSummary>)
    })

  const saveFinanceSummary = async (currentBalance: number) =>
    runWithSync(financeSyncState, financeSyncError, 'saving', async () => {
      const financeRef = getFinanceRef()
      await setDoc(financeRef, {
        currentBalance,
        updatedAt: new Date().toISOString()
      })
      return true
    })

  return {
    isCloudConfigured,
    isAuthenticated,
    readingSyncState,
    budgetSyncState,
    financeSyncState,
    readingSyncError,
    budgetSyncError,
    financeSyncError,
    fetchReadingSnapshot,
    saveReadingSnapshot,
    fetchBudgetSnapshot,
    saveBudgetSnapshot,
    fetchFinanceSummary,
    saveFinanceSummary
  }
}
