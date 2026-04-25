<script setup lang="ts">
import type { BookEntry, ReadingStatus } from '~/types/book'
import type { BudgetEntry, BudgetKind } from '~/types/finance'
import type { SyncPhase } from '~/types/firebase'

const { readingHistory, saveBook, updateStatus, deleteBook } = useReadingArchive()
const { budgetEntries, currentBalance, saveEntry, deleteEntry } = useBudgetArchive()
const { user, authReady, authPending, authError, loginWithGoogle, logout } = useFirebaseSession()
const {
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
} = useArchiveCloud()

const activeTab = ref<'reading' | 'budget'>('reading')
const query = ref('')
const selectedStatus = ref<'all' | 'finished' | 'reading' | 'paused'>('all')
const editingId = ref<number | null>(null)
const readingModalOpen = ref(false)
const budgetQuery = ref('')
const budgetKindFilter = ref<'all' | BudgetKind>('all')
const budgetEditingId = ref<number | null>(null)
const budgetModalOpen = ref(false)
const financeModalOpen = ref(false)
const currency = new Intl.NumberFormat('ko-KR')
const balanceInput = ref('0')

const latestBudgetDate = computed(() => {
  const sorted = [...budgetEntries.value].sort((a, b) => b.spentAt.localeCompare(a.spentAt))
  return sorted[0]?.spentAt ?? '2026-04-01'
})

const budgetReferenceYear = ref(Number(latestBudgetDate.value.slice(0, 4)))
const budgetReferenceMonth = ref(Number(latestBudgetDate.value.slice(5, 7)))

const emptyForm = () => ({
  genre: '소설',
  title: '',
  author: '',
  startedAt: '',
  finishedAt: '',
  rating: '',
  memo: '',
  status: 'reading' as ReadingStatus
})

const form = reactive(emptyForm())
const readingGenres = ['소설', '에세이', '인문', '경제경영', '자기계발', '역사', '과학', '철학', '예술', '고전', '기타']

const emptyBudgetForm = () => ({
  title: '식비',
  category: '생활비',
  amount: '',
  spentAt: '',
  paymentMethod: '카드',
  memo: '',
  kind: 'expense' as BudgetKind
})

const budgetForm = reactive(emptyBudgetForm())
const readingErrors = reactive({
  title: '',
  startedAt: '',
  finishedAt: ''
})
const budgetErrors = reactive({
  title: '',
  category: '',
  amount: '',
  spentAt: ''
})
const expenseTitleOptions = ['식비', '카페', '교통비', '주거비', '쇼핑', '생활용품', '의료비', '문화생활', '통신비', '기타']
const incomeTitleOptions = ['월급', '상여', '용돈', '환급', '이자', '부수입', '기타']
const expenseCategoryOptions = ['생활비', '식비', '교통', '주거', '쇼핑', '건강', '문화', '고정지출', '기타']
const incomeCategoryOptions = ['고정수입', '보너스', '금융수입', '부수입', '기타']
const paymentMethodOptions = ['카드', '현금', '계좌이체', '간편결제', '자동이체', '기타']
const budgetTitleOptions = computed(() =>
  budgetForm.kind === 'income' ? incomeTitleOptions : expenseTitleOptions
)
const budgetCategoryOptions = computed(() =>
  budgetForm.kind === 'income' ? incomeCategoryOptions : expenseCategoryOptions
)
const toastMessage = ref('')
const toastTone = ref<'success' | 'error'>('success')
const showToast = ref(false)
const readingValidationActive = ref(false)
const budgetValidationActive = ref(false)
let toastTimer: ReturnType<typeof setTimeout> | null = null

const totalBooks = computed(() => readingHistory.value.length)
const completedBooks = computed(
  () => readingHistory.value.filter((book) => book.status === 'finished').length
)
const averageRating = computed(() => {
  const rated = readingHistory.value.filter((book) => typeof book.rating === 'number')
  if (!rated.length) return 0
  const total = rated.reduce((sum, book) => sum + (book.rating ?? 0), 0)
  return Number((total / rated.length).toFixed(1))
})
const averageRatingStars = computed(() => {
  const roundedRating = Math.round(averageRating.value)
  if (!roundedRating) return '-'
  return `${'★'.repeat(roundedRating)}${'☆'.repeat(5 - roundedRating)}`
})

const getTodayDate = () => new Date().toISOString().slice(0, 10)

const currentReadingTitle = computed(() => {
  const currentBook = readingHistory.value
    .filter((book) => book.status === 'reading')
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0]

  return currentBook?.title ?? '-'
})

const totalExpense = computed(() =>
  budgetEntries.value
    .filter((entry) => entry.kind === 'expense')
    .reduce((sum, entry) => sum + entry.amount, 0)
)

const totalIncome = computed(() =>
  budgetEntries.value
    .filter((entry) => entry.kind === 'income')
    .reduce((sum, entry) => sum + entry.amount, 0)
)

const balance = computed(() => currentBalance.value + totalIncome.value - totalExpense.value)
const availableBudgetYears = computed(() => {
  const years = Array.from(new Set(budgetEntries.value.map((entry) => Number(entry.spentAt.slice(0, 4)))))
    .sort((a, b) => a - b)
  return years.length ? years : [budgetReferenceYear.value]
})

const budgetEntriesForYear = computed(() =>
  budgetEntries.value.filter((entry) => Number(entry.spentAt.slice(0, 4)) === budgetReferenceYear.value)
)

const budgetEntriesForMonth = computed(() =>
  budgetEntriesForYear.value.filter((entry) => Number(entry.spentAt.slice(5, 7)) === budgetReferenceMonth.value)
)

const previousBudgetPoint = computed(() => {
  const previousMonth = budgetReferenceMonth.value === 1 ? 12 : budgetReferenceMonth.value - 1
  const previousYear = budgetReferenceMonth.value === 1 ? budgetReferenceYear.value - 1 : budgetReferenceYear.value

  return { year: previousYear, month: previousMonth }
})

const previousBudgetEntriesForMonth = computed(() =>
  budgetEntries.value.filter((entry) => {
    const year = Number(entry.spentAt.slice(0, 4))
    const month = Number(entry.spentAt.slice(5, 7))
    return year === previousBudgetPoint.value.year && month === previousBudgetPoint.value.month
  })
)

const monthIncome = computed(() =>
  budgetEntriesForMonth.value
    .filter((entry) => entry.kind === 'income')
    .reduce((sum, entry) => sum + entry.amount, 0)
)

const monthExpense = computed(() =>
  budgetEntriesForMonth.value
    .filter((entry) => entry.kind === 'expense')
    .reduce((sum, entry) => sum + entry.amount, 0)
)

const monthNet = computed(() => monthIncome.value - monthExpense.value)

const previousMonthIncome = computed(() =>
  previousBudgetEntriesForMonth.value
    .filter((entry) => entry.kind === 'income')
    .reduce((sum, entry) => sum + entry.amount, 0)
)

const previousMonthExpense = computed(() =>
  previousBudgetEntriesForMonth.value
    .filter((entry) => entry.kind === 'expense')
    .reduce((sum, entry) => sum + entry.amount, 0)
)

const previousMonthNet = computed(() => previousMonthIncome.value - previousMonthExpense.value)

const monthDelta = (current: number, previous: number) => current - previous

const monthlyBudgetRows = computed(() => {
  let cumulative = currentBalance.value

  return Array.from({ length: 12 }, (_, index) => {
    const month = index + 1
    const items = budgetEntriesForYear.value.filter((entry) => Number(entry.spentAt.slice(5, 7)) === month)
    const income = items
      .filter((entry) => entry.kind === 'income')
      .reduce((sum, entry) => sum + entry.amount, 0)
    const expense = items
      .filter((entry) => entry.kind === 'expense')
      .reduce((sum, entry) => sum + entry.amount, 0)

    cumulative += income - expense

    return {
      month,
      income,
      expense,
      cumulative
    }
  })
})

const monthCumulativeBalance = computed(
  () => monthlyBudgetRows.value.find((row) => row.month === budgetReferenceMonth.value)?.cumulative ?? currentBalance.value
)

const topExpenseCategories = computed(() => {
  const grouped = budgetEntriesForMonth.value
    .filter((entry) => entry.kind === 'expense')
    .reduce<Record<string, number>>((acc, entry) => {
      const key = entry.category.trim() || '기타'
      acc[key] = (acc[key] ?? 0) + entry.amount
      return acc
    }, {})

  return Object.entries(grouped)
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount)
})

const topExpenseCategoriesLarge = computed(() => topExpenseCategories.value.slice(0, 5))
const topExpenseCategoriesSmall = computed(() => [...topExpenseCategories.value].reverse().slice(0, 5))

const incomeSources = computed(() => {
  const grouped = budgetEntriesForMonth.value
    .filter((entry) => entry.kind === 'income')
    .reduce<Record<string, number>>((acc, entry) => {
      const key = entry.category.trim() || entry.title.trim() || '기타'
      acc[key] = (acc[key] ?? 0) + entry.amount
      return acc
    }, {})

  return Object.entries(grouped)
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount)
})

const expensePalette = ['mint', 'coral', 'sky', 'gold', 'rose', 'slate']
const expenseCategoryKeys = computed(() => {
  return Array.from(
    new Set(
      budgetEntriesForYear.value
        .filter((entry) => entry.kind === 'expense')
        .map((entry) => entry.category.trim())
        .filter(Boolean)
    )
  ).sort((a, b) => a.localeCompare(b))
})

const expenseCategoryLegend = computed(() =>
  expenseCategoryKeys.value.map((category, index) => ({
    category,
    color: expensePalette[index % expensePalette.length]
  }))
)

const budgetChartData = computed(() => {
  const grouped = budgetEntriesForYear.value.reduce<
    Record<string, { label: string; income: number; expense: number; expensesByCategory: Record<string, number> }>
  >(
    (acc, entry) => {
      const monthKey = entry.spentAt.slice(0, 7)
      if (!acc[monthKey]) {
        const [year, month] = monthKey.split('-')
        acc[monthKey] = {
          label: `${year}.${month}`,
          income: 0,
          expense: 0,
          expensesByCategory: {}
        }
      }

      if (entry.kind === 'income') {
        acc[monthKey].income += entry.amount
      } else {
        acc[monthKey].expense += entry.amount
        const category = entry.category.trim() || '기타'
        acc[monthKey].expensesByCategory[category] =
          (acc[monthKey].expensesByCategory[category] ?? 0) + entry.amount
      }

      return acc
    },
    {}
  )

  return Array.from({ length: 12 }, (_, index) => {
    const month = index + 1
    const key = `${budgetReferenceYear.value}-${String(month).padStart(2, '0')}`
    const value = grouped[key] ?? {
      label: `${month}월`,
      income: 0,
      expense: 0,
      expensesByCategory: {}
    }

    return {
      ...value,
      label: `${month}월`,
      expenseSegments: expenseCategoryLegend.value
        .map(({ category, color }) => ({
          category,
          color,
          amount: value.expensesByCategory[category] ?? 0
        }))
        .filter((segment) => segment.amount > 0)
    }
  })
})

const budgetChartMax = computed(() => {
  const maxValue = Math.max(
    ...budgetChartData.value.flatMap((item) => [item.income, item.expense]),
    0
  )

  return maxValue || 1
})

const cumulativeChartMax = computed(() => {
  const maxValue = Math.max(...monthlyBudgetRows.value.map((row) => row.cumulative), 0)
  return maxValue || 1
})

const comboChartInnerWidth = 708
const comboChartHeight = 280
const comboChartInnerHeight = 232
const comboChartBottom = 244

const cumulativePolylinePoints = computed(() => {
  return monthlyBudgetRows.value
    .map((row, index) => {
      const x = 36 + index * 56 + 28
      const y = comboChartBottom - (row.cumulative / cumulativeChartMax.value) * comboChartInnerHeight
      return `${x},${Number(y.toFixed(2))}`
    })
    .join(' ')
})

const cumulativePointPositions = computed(() =>
  monthlyBudgetRows.value.map((row, index) => ({
    month: row.month,
    x: 36 + index * 56 + 28,
    y: comboChartBottom - (row.cumulative / cumulativeChartMax.value) * comboChartInnerHeight,
    value: row.cumulative
  }))
)

const comboLeftAxisTicks = computed(() =>
  Array.from({ length: 6 }, (_, index) => {
    const value = (budgetChartMax.value / 5) * (5 - index)
    return {
      label: currency.format(Math.round(value)),
      top: `${(index / 5) * 100}%`
    }
  })
)

const comboRightAxisTicks = computed(() =>
  Array.from({ length: 6 }, (_, index) => {
    const value = (cumulativeChartMax.value / 5) * (5 - index)
    return {
      label: currency.format(Math.round(value)),
      top: `${(index / 5) * 100}%`
    }
  })
)

const incomeDonutSegments = computed(() => {
  const total = incomeSources.value.reduce((sum, item) => sum + item.amount, 0)
  let start = 0

  return incomeSources.value.map((item, index) => {
    const ratio = total ? item.amount / total : 0
    const end = start + ratio * 360
    const segment = {
      ...item,
      color: expensePalette[index % expensePalette.length],
      start,
      end
    }
    start = end
    return segment
  })
})

const incomeDonutStyle = computed(() => {
  if (!incomeDonutSegments.value.length) {
    return { background: 'conic-gradient(#dfece7 0deg 360deg)' }
  }

  const gradient = incomeDonutSegments.value
    .map((segment) => {
      const colorMap: Record<string, string> = {
        mint: '#147d6f',
        coral: '#147d6f',
        sky: '#147d6f',
        gold: '#147d6f',
        rose: '#147d6f',
        slate: '#147d6f'
      }

      return `${colorMap[segment.color]} ${segment.start}deg ${segment.end}deg`
    })
    .join(', ')

  return { background: `conic-gradient(${gradient})` }
})

const expenseTreemap = computed(() => {
  const total = topExpenseCategoriesLarge.value.reduce((sum, item) => sum + item.amount, 0) || 1

  return topExpenseCategoriesLarge.value.map((item) => ({
    ...item,
    width: `${Math.max(18, (item.amount / total) * 100)}%`,
    color: '#cc4b1f'
  }))
})

const isWorkingState = (state: SyncPhase) =>
  state === 'loading' || state === 'saving' || state === 'deleting' || state === 'refreshing'

const readingBusy = computed(() => isWorkingState(readingSyncState.value))
const budgetBusy = computed(() => isWorkingState(budgetSyncState.value))
const financeBusy = computed(() => isWorkingState(financeSyncState.value))

const openToast = (message: string, tone: 'success' | 'error' = 'success') => {
  toastMessage.value = message
  toastTone.value = tone
  showToast.value = true

  if (toastTimer) {
    clearTimeout(toastTimer)
  }

  toastTimer = setTimeout(() => {
    showToast.value = false
  }, 1800)
}

const toggleActiveTab = () => {
  activeTab.value = activeTab.value === 'reading' ? 'budget' : 'reading'
  openToast(activeTab.value === 'reading' ? '독서 모드로 전환되었습니다.' : '가계부 모드로 전환되었습니다.')
}

const resetAllData = () => {
  readingHistory.value = []
  budgetEntries.value = []
  currentBalance.value = 0
  readingModalOpen.value = false
  budgetModalOpen.value = false
  financeModalOpen.value = false
  resetForm()
  resetBudgetForm()
  syncBalanceInput()
}

watch(
  latestBudgetDate,
  (value) => {
    if (!budgetEntries.value.length) return

    const nextYear = Number(value.slice(0, 4))
    const nextMonth = Number(value.slice(5, 7))

    if (!availableBudgetYears.value.includes(budgetReferenceYear.value)) {
      budgetReferenceYear.value = nextYear
    }

    if (budgetReferenceMonth.value < 1 || budgetReferenceMonth.value > 12) {
      budgetReferenceMonth.value = nextMonth
    }
  },
  { immediate: true }
)

const filteredBooks = computed(() => {
  const keyword = query.value.trim().toLowerCase()

  return readingHistory
    .value
    .filter((book) =>
      selectedStatus.value === 'all' ? true : book.status === selectedStatus.value
    )
    .filter((book) => {
      if (!keyword) return true
      return (
        book.title.toLowerCase().includes(keyword) ||
        book.author.toLowerCase().includes(keyword) ||
        book.genre.toLowerCase().includes(keyword)
      )
    })
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
})

const filteredBudgetEntries = computed(() => {
  const keyword = budgetQuery.value.trim().toLowerCase()

  return budgetEntries.value
    .filter((entry) =>
      budgetKindFilter.value === 'all' ? true : entry.kind === budgetKindFilter.value
    )
    .filter((entry) => {
      if (!keyword) return true
      return (
        entry.title.toLowerCase().includes(keyword) ||
        entry.category.toLowerCase().includes(keyword) ||
        (entry.memo ?? '').toLowerCase().includes(keyword)
      )
    })
    .sort((a, b) => b.spentAt.localeCompare(a.spentAt))
})

useSeoMeta({
  title: '아카이브 대시보드',
  description: '독서 기록과 가계부를 한 페이지에서 관리하는 개인 아카이브'
})

useHead({
  meta: [
    {
      name: 'viewport',
      content: 'width=device-width, initial-scale=1, viewport-fit=cover'
    }
  ]
})

const resetForm = () => {
  editingId.value = null
  Object.assign(form, emptyForm())
  readingValidationActive.value = false
  Object.assign(readingErrors, {
    title: '',
    startedAt: '',
    finishedAt: ''
  })
}

const openReadingModal = () => {
  resetForm()
  readingModalOpen.value = true
}

const closeReadingModal = () => {
  readingModalOpen.value = false
  resetForm()
}

const startEditing = (id: number) => {
  const target = readingHistory.value.find((book) => book.id === id)
  if (!target) return

  editingId.value = id
  Object.assign(form, {
    genre: target.genre,
    title: target.title,
    author: target.author ?? '',
    startedAt: target.startedAt,
    finishedAt: target.finishedAt ?? '',
    rating: target.rating ? String(target.rating) : '',
    memo: target.memo,
    status: target.status
  })
  readingModalOpen.value = true
}

const validateReadingForm = () => {
  readingErrors.title = form.title.trim() ? '' : '제목을 입력해주세요.'
  readingErrors.startedAt = ''
  readingErrors.finishedAt = form.status === 'finished' && !form.finishedAt
    ? '완독 기록은 완료일을 선택해주세요.'
    : ''

  return !readingErrors.title && !readingErrors.startedAt && !readingErrors.finishedAt
}

const persistReading = async () => {
  if (!isCloudConfigured.value || !isAuthenticated.value) return false
  const saved = await saveReadingSnapshot(readingHistory.value)
  if (saved) {
    openToast('독서 기록이 저장되었습니다.')
    return true
  } else if (readingSyncError.value) {
    openToast(`저장 실패: ${readingSyncError.value}`, 'error')
  }
  return false
}

const refreshReading = async (notify = true) => {
  if (!isCloudConfigured.value || !isAuthenticated.value) return

  const snapshot = await fetchReadingSnapshot('refreshing')

  if (snapshot) {
    readingHistory.value = snapshot.items
    if (notify) {
      openToast('독서 기록을 새로고침했습니다.')
    }
    return
  }

  if (!readingSyncError.value) {
    const saved = await saveReadingSnapshot(readingHistory.value)
    if (saved) {
      openToast('독서 기록이 저장되었습니다.')
    }
  }
}

const submitForm = async () => {
  readingValidationActive.value = true
  if (!validateReadingForm()) return
  const startedAt = form.startedAt || getTodayDate()

  const existingEntry = editingId.value
    ? readingHistory.value.find((book) => book.id === editingId.value)
    : null

  saveBook({
    id: editingId.value ?? undefined,
    createdAt: existingEntry?.createdAt ?? new Date().toISOString(),
    genre: form.genre,
    title: form.title,
    author: form.author || undefined,
    startedAt,
    finishedAt: form.finishedAt || undefined,
    rating: form.rating ? Number(form.rating) : undefined,
    memo: form.memo,
    status: form.status
  })

  resetForm()
  readingModalOpen.value = false
  await persistReading()
}

const handleStatusChange = async ({ id, status }: { id: number; status: BookEntry['status'] }) => {
  updateStatus(id, status)
  await persistReading()
}

const handleDeleteBook = async (id: number) => {
  const previousItems = [...readingHistory.value]
  deleteBook(id)

  if (!isCloudConfigured.value || !isAuthenticated.value) return

  readingSyncState.value = 'deleting'
  const didSave = await saveReadingSnapshot(readingHistory.value)

  if (!didSave) {
    readingHistory.value = previousItems
    if (readingSyncError.value) {
      openToast(`삭제 실패: ${readingSyncError.value}`, 'error')
    }
    return
  }

  await refreshReading()
  openToast('독서 기록이 삭제되었습니다.')
}

const resetBudgetForm = () => {
  budgetEditingId.value = null
  Object.assign(budgetForm, emptyBudgetForm())
  budgetValidationActive.value = false
  Object.assign(budgetErrors, {
    title: '',
    category: '',
    amount: '',
    spentAt: ''
  })
}

const openBudgetModal = () => {
  resetBudgetForm()
  budgetModalOpen.value = true
}

const closeBudgetModal = () => {
  budgetModalOpen.value = false
  resetBudgetForm()
}

const openFinanceModal = () => {
  syncBalanceInput()
  financeModalOpen.value = true
}

const startBudgetEditing = (id: number) => {
  const target = budgetEntries.value.find((entry) => entry.id === id)
  if (!target) return

  budgetEditingId.value = id
  Object.assign(budgetForm, {
    kind: target.kind,
    title: target.title,
    category: target.category,
    amount: String(target.amount),
    spentAt: target.spentAt,
    paymentMethod: target.paymentMethod ?? '',
    memo: target.memo ?? ''
  })
  budgetModalOpen.value = true
}

const persistBudget = async () => {
  if (!isCloudConfigured.value || !isAuthenticated.value) return false
  const saved = await saveBudgetSnapshot(budgetEntries.value)
  if (saved) {
    openToast('가계부 기록이 저장되었습니다.')
    return true
  } else if (budgetSyncError.value) {
    openToast(`저장 실패: ${budgetSyncError.value}`, 'error')
  }
  return false
}

const refreshBudget = async (notify = true) => {
  if (!isCloudConfigured.value || !isAuthenticated.value) return

  const snapshot = await fetchBudgetSnapshot('refreshing')

  if (snapshot) {
    budgetEntries.value = snapshot.items
    if (notify) {
      openToast('가계부 기록을 새로고침했습니다.')
    }
    return
  }

  if (!budgetSyncError.value) {
    const saved = await saveBudgetSnapshot(budgetEntries.value)
    if (saved) {
      openToast('가계부 기록이 저장되었습니다.')
    }
  }
}

const validateBudgetForm = () => {
  const amount = Number(budgetForm.amount)

  budgetErrors.title = budgetForm.title ? '' : '내역을 선택해주세요.'
  budgetErrors.category = budgetForm.category ? '' : '카테고리를 선택해주세요.'
  budgetErrors.amount = amount > 0 ? '' : '금액을 입력해주세요.'
  budgetErrors.spentAt = budgetForm.spentAt ? '' : '날짜를 선택해주세요.'

  return !budgetErrors.title && !budgetErrors.category && !budgetErrors.amount && !budgetErrors.spentAt
}

const submitBudgetForm = async () => {
  budgetValidationActive.value = true
  if (!validateBudgetForm()) return

  const previousItems = [...budgetEntries.value]
  const existingEntry = budgetEditingId.value
    ? budgetEntries.value.find((entry) => entry.id === budgetEditingId.value)
    : null

  saveEntry({
    id: budgetEditingId.value ?? undefined,
    createdAt: existingEntry?.createdAt ?? new Date().toISOString(),
    title: budgetForm.title,
    category: budgetForm.category,
    amount: Number(budgetForm.amount),
    spentAt: budgetForm.spentAt,
    paymentMethod: budgetForm.paymentMethod || undefined,
    memo: budgetForm.memo || undefined,
    kind: budgetForm.kind
  })

  const didSave = await persistBudget()

  if (!didSave && isCloudConfigured.value && isAuthenticated.value) {
    budgetEntries.value = previousItems
    return
  }

  resetBudgetForm()
  budgetModalOpen.value = false
}

const syncBalanceInput = () => {
  balanceInput.value = String(currentBalance.value)
}

const persistFinance = async () => {
  if (!isCloudConfigured.value || !isAuthenticated.value) return false
  const saved = await saveFinanceSummary(currentBalance.value)
  if (saved) {
    openToast('현재 잔고가 저장되었습니다.')
    return true
  } else if (financeSyncError.value) {
    openToast(`저장 실패: ${financeSyncError.value}`, 'error')
  }
  return false
}

const refreshFinance = async (notify = true) => {
  if (!isCloudConfigured.value || !isAuthenticated.value) return

  const snapshot = await fetchFinanceSummary('refreshing')

  if (snapshot) {
    currentBalance.value = snapshot.currentBalance
    syncBalanceInput()
    if (notify) {
      openToast('현재 잔고를 새로고침했습니다.')
    }
    return
  }

  if (!financeSyncError.value) {
    const saved = await saveFinanceSummary(currentBalance.value)
    if (saved) {
      openToast('현재 잔고가 저장되었습니다.')
    }
  }
}

const submitBalance = async () => {
  currentBalance.value = Number(balanceInput.value) || 0
  await persistFinance()
  financeModalOpen.value = false
}

onMounted(() => {
  syncBalanceInput()
})

watch(currentBalance, () => {
  syncBalanceInput()
})

watch(
  () => budgetForm.kind,
  (kind) => {
    budgetForm.title = kind === 'income' ? incomeTitleOptions[0] : expenseTitleOptions[0]
    budgetForm.category = kind === 'income' ? incomeCategoryOptions[0] : expenseCategoryOptions[0]
  }
)

watch(
  () => [form.title, form.startedAt, form.finishedAt, form.status],
  () => {
    if (!readingValidationActive.value) return
    validateReadingForm()
  }
)

watch(
  () => [budgetForm.title, budgetForm.category, budgetForm.amount, budgetForm.spentAt],
  () => {
    if (!budgetValidationActive.value) return
    validateBudgetForm()
  }
)

const handleDeleteBudgetEntry = async (id: number) => {
  const previousItems = [...budgetEntries.value]
  deleteEntry(id)

  if (!isCloudConfigured.value || !isAuthenticated.value) return

  budgetSyncState.value = 'deleting'
  const didSave = await saveBudgetSnapshot(budgetEntries.value)

  if (!didSave) {
    budgetEntries.value = previousItems
    if (budgetSyncError.value) {
      openToast(`삭제 실패: ${budgetSyncError.value}`, 'error')
    }
    return
  }

  await refreshBudget()
  openToast('가계부 기록이 삭제되었습니다.')
}

onMounted(async () => {
  if (!isCloudConfigured.value || !isAuthenticated.value) return

  const readingSnapshot = await fetchReadingSnapshot()
  if (readingSnapshot) {
    readingHistory.value = readingSnapshot.items
  } else if (!readingSyncError.value) {
    await saveReadingSnapshot(readingHistory.value)
  }

  const budgetSnapshot = await fetchBudgetSnapshot()
  if (budgetSnapshot) {
    budgetEntries.value = budgetSnapshot.items
  } else if (!budgetSyncError.value) {
    await saveBudgetSnapshot(budgetEntries.value)
  }

  const financeSnapshot = await fetchFinanceSummary()
  if (financeSnapshot) {
    currentBalance.value = financeSnapshot.currentBalance
  } else if (!financeSyncError.value) {
    await saveFinanceSummary(currentBalance.value)
  }

  syncBalanceInput()
})

watch(
  () => user.value?.uid,
  async (uid) => {
    if (!authReady.value) return

    resetAllData()

    if (!uid || !isCloudConfigured.value) {
      return
    }

    await refreshReading(false)
    await refreshBudget(false)
    await refreshFinance(false)
  },
  { immediate: true }
)
</script>

<template>
  <section class="archive-page" :data-mode="activeTab">
    <header class="archive-header">
      <button
        type="button"
        class="archive-brand"
        :data-mode="activeTab"
        :aria-label="activeTab === 'reading' ? '가계부로 전환' : '독서로 전환'"
        @click="toggleActiveTab"
      >
        <span class="archive-brand__mark" aria-hidden="true">A</span>
        <div>
          <strong>{{ user?.displayName ? `${user.displayName}의 Archive Hub` : 'Archive Hub' }}</strong>
          <span>{{ activeTab === 'reading' ? '독서 모드' : '가계부 모드' }}</span>
        </div>
      </button>

      <label v-if="user" class="archive-search">
        <input
          v-if="activeTab === 'reading'"
          v-model="query"
          type="search"
          placeholder="제목, 저자, 장르 검색"
          aria-label="책 검색"
        >
        <input
          v-else
          v-model="budgetQuery"
          type="search"
          placeholder="내역, 카테고리, 메모 검색"
          aria-label="가계부 검색"
        >
      </label>

      <div class="auth-bar">
        <template v-if="user">
          <button type="button" class="ghost-button" :disabled="authPending" @click="logout">
            로그아웃
          </button>
        </template>
        <template v-else>
          <p class="auth-bar__hint">구글 로그인 후 계정별로 독서/가계부 데이터가 분리됩니다.</p>
          <button type="button" class="primary-button" :disabled="authPending" @click="loginWithGoogle">
            Google 로그인
          </button>
        </template>
      </div>
      <p v-if="authError" class="entry-form__hint">인증 오류: {{ authError }}</p>
    </header>

    <section v-if="authReady && !user" class="budget-panel auth-empty">
      <h2>로그인이 필요합니다</h2>
      <p>구글 로그인 후 내 계정 기준으로 독서 기록, 가계부, 현재 잔고가 따로 저장됩니다.</p>
    </section>

    <div v-if="user && activeTab === 'reading'" class="archive-stats">
      <article class="stat-card">
        <p>전체 도서</p>
        <strong>{{ totalBooks }}</strong>
      </article>
      <article class="stat-card">
        <p>완독 도서</p>
        <strong>{{ completedBooks }}</strong>
      </article>
      <article class="stat-card">
        <p>평균 평점</p>
        <strong class="rating-stars">{{ averageRatingStars }}</strong>
        <small v-if="averageRating">{{ averageRating }}/5</small>
      </article>
      <article class="stat-card">
        <p>현재 읽는 도서</p>
        <strong class="stat-card__title">{{ currentReadingTitle }}</strong>
      </article>
    </div>

    <section v-if="user && activeTab === 'budget'" class="budget-dashboard">
      <div class="budget-dashboard__top">
        <div class="budget-dashboard__toolbar">
          <div class="budget-dashboard__filters">
            <label class="selector-card">
              <span>기준년도</span>
              <select v-model.number="budgetReferenceYear">
                <option v-for="year in availableBudgetYears" :key="year" :value="year">
                  {{ year }}
                </option>
              </select>
            </label>
            <label class="selector-card">
              <span>기준월</span>
              <select v-model.number="budgetReferenceMonth">
                <option v-for="month in 12" :key="month" :value="month">
                  {{ month }}
                </option>
              </select>
            </label>
            <label class="selector-card">
              <span>구분</span>
              <select v-model="budgetKindFilter" aria-label="가계부 구분 필터">
                <option value="all">전체</option>
                <option value="expense">지출</option>
                <option value="income">수입</option>
              </select>
            </label>
          </div>

          <div class="archive-controls__actions budget-dashboard__actions">
            <button type="button" class="ghost-button" @click="openFinanceModal">잔고 관리</button>
            <button type="button" class="ghost-button icon-button" aria-label="가계부 기록 새로고침" title="새로고침" @click="refreshBudget">
              <span class="refresh-icon" aria-hidden="true" />
            </button>
            <button type="button" class="primary-button" @click="openBudgetModal">가계부 추가</button>
          </div>
        </div>

        <div class="budget-dashboard__metrics">
          <article class="metric-card">
            <p>현재 잔고</p>
            <strong>{{ currency.format(currentBalance) }}원</strong>
          </article>
          <article class="metric-card">
            <p>{{ budgetReferenceMonth }}월 수입</p>
            <strong>{{ currency.format(monthIncome) }}원</strong>
            <small
              class="metric-card__delta"
              :data-trend="monthDelta(monthIncome, previousMonthIncome) >= 0 ? 'up' : 'down'"
            >
              {{ monthDelta(monthIncome, previousMonthIncome) >= 0 ? '▲' : '▼' }} {{ currency.format(Math.abs(monthDelta(monthIncome, previousMonthIncome))) }}
            </small>
          </article>
          <article class="metric-card">
            <p>{{ budgetReferenceMonth }}월 지출</p>
            <strong>{{ currency.format(monthExpense) }}원</strong>
            <small
              class="metric-card__delta"
              :data-trend="monthDelta(monthExpense, previousMonthExpense) >= 0 ? 'up' : 'down'"
            >
              {{ monthDelta(monthExpense, previousMonthExpense) >= 0 ? '▲' : '▼' }} {{ currency.format(Math.abs(monthDelta(monthExpense, previousMonthExpense))) }}
            </small>
          </article>
          <article class="metric-card">
            <p>{{ budgetReferenceMonth }}월 수입-지출</p>
            <strong>{{ currency.format(monthNet) }}원</strong>
            <small
              class="metric-card__delta"
              :data-trend="monthDelta(monthNet, previousMonthNet) >= 0 ? 'up' : 'down'"
            >
              {{ monthDelta(monthNet, previousMonthNet) >= 0 ? '▲' : '▼' }} {{ currency.format(Math.abs(monthDelta(monthNet, previousMonthNet))) }}
            </small>
          </article>
          <article class="metric-card">
            <p>{{ budgetReferenceMonth }}월 누적잔액</p>
            <strong>{{ currency.format(monthCumulativeBalance) }}원</strong>
            <small>{{ budgetReferenceYear }}년 누적 기준</small>
          </article>
        </div>
      </div>

      <div class="budget-dashboard__middle">
        <section class="budget-panel budget-panel--table">
          <h2>{{ budgetReferenceYear }}년도 월별 수입/지출 현황</h2>
          <div class="summary-table">
            <table>
              <thead>
                <tr>
                  <th>구분</th>
                  <th v-for="row in monthlyBudgetRows" :key="`head-${row.month}`">{{ row.month }}월</th>
                  <th>합계</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th>수입</th>
                  <td v-for="row in monthlyBudgetRows" :key="`income-${row.month}`">{{ currency.format(row.income) }}</td>
                  <td>{{ currency.format(monthlyBudgetRows.reduce((sum, row) => sum + row.income, 0)) }}</td>
                </tr>
                <tr>
                  <th>지출</th>
                  <td v-for="row in monthlyBudgetRows" :key="`expense-${row.month}`">{{ currency.format(row.expense) }}</td>
                  <td>{{ currency.format(monthlyBudgetRows.reduce((sum, row) => sum + row.expense, 0)) }}</td>
                </tr>
                <tr>
                  <th>누적잔액</th>
                  <td v-for="row in monthlyBudgetRows" :key="`balance-${row.month}`">{{ currency.format(row.cumulative) }}</td>
                  <td>{{ currency.format(monthlyBudgetRows.at(-1)?.cumulative ?? 0) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <div class="budget-dashboard__bottom">
        <section class="budget-panel budget-panel--chart">
          <h2>{{ budgetReferenceYear }}년도 월별 수입/지출 변화</h2>
          <div class="combo-chart">
            <div class="budget-chart__legend" aria-label="그래프 범례">
              <span><i data-kind="income" />수입</span>
              <span><i data-kind="expense" />지출</span>
              <span><i data-kind="cumulative" />누적잔액</span>
            </div>
            <div class="combo-chart__frame">
              <div class="combo-chart__axis combo-chart__axis--left">
                <span
                  v-for="tick in comboLeftAxisTicks"
                  :key="`left-${tick.label}`"
                  :style="{ top: tick.top }"
                >
                  {{ tick.label }}
                </span>
              </div>
              <div class="combo-chart__scroll">
                <div class="combo-chart__plot" :style="{ minWidth: `${comboChartInnerWidth}px` }">
                  <div class="combo-chart__gridlines" aria-hidden="true">
                    <span v-for="row in 6" :key="`row-${row}`" />
                  </div>
                  <div class="combo-chart__bars">
                    <article
                      v-for="item in budgetChartData"
                      :key="item.label"
                      class="combo-chart__month"
                    >
                      <div class="combo-chart__columns">
                        <div
                          class="combo-chart__column combo-chart__column--income"
                          :style="{ height: `${(item.income / budgetChartMax) * 100}%` }"
                        />
                        <div
                          class="combo-chart__column combo-chart__column--expense"
                          :style="{ height: `${(item.expense / budgetChartMax) * 100}%` }"
                        />
                      </div>
                      <span class="combo-chart__month-label">{{ item.label }}</span>
                    </article>
                  </div>
                  <svg
                    class="combo-chart__line-layer"
                    :viewBox="`0 0 ${comboChartInnerWidth} ${comboChartHeight}`"
                    preserveAspectRatio="none"
                    aria-hidden="true"
                  >
                    <polyline
                      class="combo-chart__line"
                      :points="cumulativePolylinePoints"
                    />
                    <circle
                      v-for="point in cumulativePointPositions"
                      :key="`point-${point.month}`"
                      class="combo-chart__point"
                      :cx="point.x"
                      :cy="point.y"
                      r="4"
                    />
                  </svg>
                </div>
              </div>
              <div class="combo-chart__axis combo-chart__axis--right">
                <span
                  v-for="tick in comboRightAxisTicks"
                  :key="`right-${tick.label}`"
                  :style="{ top: tick.top }"
                >
                  {{ tick.label }}
                </span>
              </div>
            </div>
          </div>
        </section>
      </div>

      <div class="budget-dashboard__aux">
        <section class="budget-panel budget-panel--donut">
          <h2>{{ budgetReferenceMonth }}월 수입금액</h2>
          <div class="donut-card">
            <div class="donut-card__chart" :style="incomeDonutStyle">
              <div class="donut-card__inner">{{ currency.format(monthIncome) }}</div>
            </div>
            <div class="donut-card__legend">
              <div
                v-for="segment in incomeDonutSegments"
                :key="`income-${segment.category}`"
                class="donut-card__legend-item"
              >
                <i :data-expense-color="segment.color" />
                <span>{{ segment.category }}</span>
                <strong>{{ currency.format(segment.amount) }}</strong>
              </div>
            </div>
          </div>
        </section>

        <section class="budget-panel budget-panel--treemap">
          <h2>{{ budgetReferenceMonth }}월 지출금액</h2>
          <div class="treemap">
            <div
              v-for="tile in expenseTreemap"
              :key="`tile-${tile.category}`"
              class="treemap__tile"
              :style="{ width: tile.width, background: tile.color }"
            >
              <span>{{ tile.category }}</span>
              <strong>{{ currency.format(tile.amount) }}</strong>
            </div>
          </div>
        </section>

        <section class="budget-panel budget-panel--categories">
          <h2>{{ budgetReferenceMonth }}월 많이 소비한 항목</h2>
          <div class="category-bars">
            <div
              v-for="item in topExpenseCategoriesLarge"
              :key="`large-${item.category}`"
              class="category-bars__item"
            >
              <span>{{ item.category }}</span>
              <div class="category-bars__track">
                <div
                  class="category-bars__fill"
                  :style="{ width: `${(item.amount / (topExpenseCategoriesLarge[0]?.amount || 1)) * 100}%` }"
                />
              </div>
              <strong>{{ currency.format(item.amount) }}</strong>
            </div>
          </div>
        </section>
      </div>
    </section>

    <div v-if="user && activeTab === 'reading'" class="archive-list">
      <section class="archive-list">
        <div class="archive-controls">
          <label class="field">
            <span>상태</span>
            <select v-model="selectedStatus" aria-label="독서 상태 필터">
              <option value="all">전체</option>
              <option value="finished">완독</option>
              <option value="reading">읽는 중</option>
              <option value="paused">잠시 멈춤</option>
            </select>
          </label>
          <div class="archive-controls__actions">
            <button type="button" class="ghost-button icon-button" aria-label="독서 기록 새로고침" title="새로고침" @click="refreshReading">
              <span class="refresh-icon" aria-hidden="true" />
            </button>
            <button type="button" class="primary-button" @click="openReadingModal">독서 기록 추가</button>
          </div>
        </div>

        <div class="book-grid">
          <BookCard
            v-for="book in filteredBooks"
            :key="book.id"
            :book="book"
            @edit="startEditing"
            @status-change="handleStatusChange"
            @delete="handleDeleteBook"
          />
        </div>
      </section>
    </div>

    <div v-else-if="user" class="archive-list">
      <section class="archive-list">
        <div class="book-grid">
          <BudgetCard
            v-for="entry in filteredBudgetEntries"
            :key="entry.id"
            :entry="entry"
            @edit="startBudgetEditing"
            @delete="handleDeleteBudgetEntry"
          />
        </div>
      </section>
    </div>

    <div v-if="readingModalOpen" class="modal-backdrop" role="presentation" @click.self="closeReadingModal">
      <section class="entry-panel modal-panel" role="dialog" aria-modal="true" aria-labelledby="reading-modal-title">
        <div class="entry-panel__head">
          <div>
            <p class="entry-panel__eyebrow">Archive Editor</p>
            <h2 id="reading-modal-title">{{ editingId ? '독서 기록 수정' : '새 독서 기록 추가' }}</h2>
          </div>
          <div class="entry-panel__actions">
            <button v-if="editingId" type="button" class="ghost-button" @click="resetForm">새로 입력</button>
            <button type="button" class="ghost-button" @click="closeReadingModal">닫기</button>
          </div>
        </div>

        <div v-if="readingBusy" class="sync-progress" aria-hidden="true">
          <span class="sync-progress__bar" />
        </div>

        <form class="entry-form" novalidate @submit.prevent="submitForm">
          <div class="entry-form__grid">
            <label class="field">
              <span>유형</span>
              <select v-model="form.genre">
                <option v-for="genre in readingGenres" :key="genre" :value="genre">
                  {{ genre }}
                </option>
              </select>
            </label>
            <label class="field">
              <span>제목</span>
              <input v-model="form.title" type="text" placeholder="책 제목">
              <small v-if="readingErrors.title" class="field__error">{{ readingErrors.title }}</small>
            </label>
            <label class="field">
              <span>저자</span>
              <input v-model="form.author" type="text" placeholder="선택 입력">
            </label>
            <label class="field">
              <span>상태</span>
              <select v-model="form.status">
                <option value="finished">완독</option>
                <option value="reading">읽는 중</option>
                <option value="paused">잠시 멈춤</option>
              </select>
            </label>
            <label class="field">
              <span>시작</span>
              <input v-model="form.startedAt" type="date">
              <small v-if="readingErrors.startedAt" class="field__error">{{ readingErrors.startedAt }}</small>
            </label>
            <label class="field">
              <span>완료</span>
              <input v-model="form.finishedAt" type="date">
              <small v-if="readingErrors.finishedAt" class="field__error">{{ readingErrors.finishedAt }}</small>
            </label>
            <label class="field">
              <span>평점</span>
              <select v-model="form.rating">
                <option value="">선택 안 함</option>
                <option value="1">★☆☆☆☆</option>
                <option value="2">★★☆☆☆</option>
                <option value="3">★★★☆☆</option>
                <option value="4">★★★★☆</option>
                <option value="5">★★★★★</option>
              </select>
            </label>
            <label class="field field--full">
              <span>한줄평</span>
              <textarea
                v-model="form.memo"
                rows="4"
                placeholder="책을 읽고 남기고 싶은 한 줄을 적어보세요"
              />
            </label>
          </div>

          <div class="entry-form__actions">
            <button type="submit" class="primary-button">
              {{ editingId ? '기록 저장' : '아카이브에 추가' }}
            </button>
            <p v-if="readingBusy" class="entry-form__hint">독서 기록 동기화 중...</p>
            <p v-else-if="readingSyncError" class="entry-form__hint">Firebase 오류: {{ readingSyncError }}</p>
          </div>
        </form>
      </section>
    </div>

    <div v-if="financeModalOpen" class="modal-backdrop" role="presentation" @click.self="financeModalOpen = false">
      <section class="entry-panel modal-panel modal-panel--small" role="dialog" aria-modal="true" aria-labelledby="finance-modal-title">
        <div class="entry-panel__head">
          <div>
            <p class="entry-panel__eyebrow">Balance</p>
            <h2 id="finance-modal-title">현재 잔고 관리</h2>
          </div>
          <div class="entry-panel__actions">
            <button type="button" class="ghost-button icon-button" aria-label="현재 잔고 새로고침" title="새로고침" @click="refreshFinance">
              <span class="refresh-icon" aria-hidden="true" />
            </button>
            <button type="button" class="ghost-button" @click="financeModalOpen = false">닫기</button>
          </div>
        </div>

        <div v-if="financeBusy" class="sync-progress" aria-hidden="true">
          <span class="sync-progress__bar" />
        </div>

        <form class="entry-form" novalidate @submit.prevent="submitBalance">
          <div class="entry-form__grid">
            <label class="field">
              <span>현재 잔고</span>
              <input v-model="balanceInput" type="number" step="1000" placeholder="0">
            </label>
          </div>

          <div class="entry-form__actions">
            <button type="submit" class="primary-button">잔고 저장</button>
            <p v-if="financeBusy" class="entry-form__hint">잔고 동기화 중...</p>
            <p v-else-if="financeSyncError" class="entry-form__hint">Firebase 오류: {{ financeSyncError }}</p>
          </div>
        </form>
      </section>
    </div>

    <div v-if="budgetModalOpen" class="modal-backdrop" role="presentation" @click.self="closeBudgetModal">
      <section class="entry-panel modal-panel" role="dialog" aria-modal="true" aria-labelledby="budget-modal-title">
        <div class="entry-panel__head">
          <div>
            <p class="entry-panel__eyebrow">Budget Editor</p>
            <h2 id="budget-modal-title">{{ budgetEditingId ? '가계부 항목 수정' : '새 가계부 기록 추가' }}</h2>
          </div>
          <div class="entry-panel__actions">
            <button v-if="budgetEditingId" type="button" class="ghost-button" @click="resetBudgetForm">새로 입력</button>
            <button type="button" class="ghost-button" @click="closeBudgetModal">닫기</button>
          </div>
        </div>

        <div v-if="budgetBusy" class="sync-progress" aria-hidden="true">
          <span class="sync-progress__bar" />
        </div>

        <form class="entry-form" novalidate @submit.prevent="submitBudgetForm">
          <div class="entry-form__grid">
            <label class="field">
              <span>구분</span>
              <select v-model="budgetForm.kind">
                <option value="expense">지출</option>
                <option value="income">수입</option>
              </select>
            </label>
            <label class="field">
              <span>내역</span>
              <select v-model="budgetForm.title">
                <option v-for="title in budgetTitleOptions" :key="title" :value="title">
                  {{ title }}
                </option>
              </select>
              <small v-if="budgetErrors.title" class="field__error">{{ budgetErrors.title }}</small>
            </label>
            <label class="field">
              <span>카테고리</span>
              <select v-model="budgetForm.category">
                <option v-for="category in budgetCategoryOptions" :key="category" :value="category">
                  {{ category }}
                </option>
              </select>
              <small v-if="budgetErrors.category" class="field__error">{{ budgetErrors.category }}</small>
            </label>
            <label class="field">
              <span>금액</span>
              <input v-model="budgetForm.amount" type="number" min="0" step="100" placeholder="0">
              <small v-if="budgetErrors.amount" class="field__error">{{ budgetErrors.amount }}</small>
            </label>
            <label class="field">
              <span>날짜</span>
              <input v-model="budgetForm.spentAt" type="date">
              <small v-if="budgetErrors.spentAt" class="field__error">{{ budgetErrors.spentAt }}</small>
            </label>
            <label class="field">
              <span>결제수단</span>
              <select v-model="budgetForm.paymentMethod">
                <option v-for="method in paymentMethodOptions" :key="method" :value="method">
                  {{ method }}
                </option>
              </select>
            </label>
            <label class="field field--full">
              <span>메모</span>
              <textarea
                v-model="budgetForm.memo"
                rows="4"
                placeholder="기록에 남기고 싶은 메모를 적어보세요"
              />
            </label>
          </div>

          <div class="entry-form__actions">
            <button type="submit" class="primary-button">
              {{ budgetEditingId ? '항목 저장' : '가계부에 추가' }}
            </button>
            <p v-if="budgetBusy" class="entry-form__hint">가계부 동기화 중...</p>
            <p v-else-if="budgetSyncError" class="entry-form__hint">Firebase 오류: {{ budgetSyncError }}</p>
          </div>
        </form>
      </section>
    </div>

    <div v-if="showToast" class="toast" :data-tone="toastTone" role="status" aria-live="polite">
      {{ toastMessage }}
    </div>
  </section>
</template>
