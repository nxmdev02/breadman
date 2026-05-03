<script setup lang="ts">
import { ChevronLeft, ChevronRight, RefreshCw } from 'lucide-vue-next'
import type { BookEntry, ReadingStatus } from '~/types/book'
import type { BudgetEntry, BudgetKind } from '~/types/finance'
import type { SyncPhase } from '~/types/firebase'

const { readingHistory, saveBook, updateStatus, deleteBook } = useReadingArchive()
const { budgetEntries, startBalance, saveEntry, deleteEntry } = useBudgetArchive()
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
const reviewModalOpen = ref(false)
const reviewBookId = ref<number | null>(null)
const reviewDraft = ref('')
const titleLookupPending = ref(false)
const titleLookupError = ref('')
const titleSuggestions = ref<Array<{ id: string; title: string; authors: string[]; image: string | null }>>([])
const coverLookupPending = ref(false)
const coverLookupError = ref('')
const budgetQuery = ref('')
const budgetKindFilter = ref<'all' | BudgetKind>('all')
const budgetEditingId = ref<number | null>(null)
const budgetModalOpen = ref(false)
const financeModalOpen = ref(false)
const currency = new Intl.NumberFormat('ko-KR')
const balanceInput = ref('0')
const formatWonAmount = (value: number) => currency.format(value)

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
  summary: '',
  coverImage: '',
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
const expenseTitleOptions = ['식비', '카페', '교통비', '주거비', '쇼핑', '생활용품', '의료비', '문화생활', '통신비', '구독료', '보험료', '주유비', '통행료', '차량 정비', '대출이자', '데이트비', '생일', '기념일', '생활비', '기타']
const incomeTitleOptions = ['월급', '상여', '수당', '용돈', '환급', '이자', '부수입', '기타']
const expenseCategoryOptions = ['생활비', '식비', '간식', '교통', '차량', '주거', '쇼핑', '건강', '문화', '경조사', '고정지출', '기타']
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
const initialArchiveLoading = ref(false)
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

const readFileAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '')
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })

const handleCoverPaste = async (event: ClipboardEvent) => {
  const clipboardItems = event.clipboardData?.items
  if (!clipboardItems?.length) return

  const imageItem = Array.from(clipboardItems).find((item) => item.type.startsWith('image/'))

  if (imageItem) {
    event.preventDefault()
    const file = imageItem.getAsFile()
    if (!file) return
    form.coverImage = await readFileAsDataUrl(file)
    return
  }

  const text = event.clipboardData?.getData('text/plain')?.trim()
  if (text) {
    event.preventDefault()
    form.coverImage = text
  }
}

const lookupBookCover = async () => {
  if (!form.title.trim()) {
    coverLookupError.value = '먼저 책 제목을 입력해주세요.'
    return
  }

  coverLookupPending.value = true
  coverLookupError.value = ''

  try {
    const result = await $fetch<{ image: string | null }>('/api/books/cover', {
      query: {
        title: form.title.trim(),
        author: form.author.trim() || undefined
      }
    })

    if (!result.image) {
      coverLookupError.value = '일치하는 표지를 찾지 못했습니다.'
      return
    }

    form.coverImage = result.image
  } catch {
    coverLookupError.value = '표지를 가져오지 못했습니다. 잠시 후 다시 시도해주세요.'
  } finally {
    coverLookupPending.value = false
  }
}

const searchBookTitles = async (keyword: string) => {
  const normalizedKeyword = keyword.trim()
  titleLookupError.value = ''

  if (normalizedKeyword.length < 2) {
    titleSuggestions.value = []
    titleLookupPending.value = false
    return
  }

  titleLookupPending.value = true

  try {
    const result = await $fetch<{
      items: Array<{ id: string; title: string; authors: string[]; image: string | null }>
    }>('/api/books/search', {
      query: { title: normalizedKeyword }
    })

    titleSuggestions.value = result.items
  } catch {
    titleSuggestions.value = []
    titleLookupError.value = '책 제목 목록을 불러오지 못했습니다.'
  } finally {
    titleLookupPending.value = false
  }
}

const applyBookSuggestion = (item: { title: string; authors: string[]; image: string | null }) => {
  form.title = item.title
  form.author = form.author || item.authors[0] || ''
  form.coverImage = form.coverImage || item.image || ''
  titleSuggestions.value = []
  titleLookupError.value = ''
}

const fetchBookMetadata = async () => {
  if (!form.title.trim()) return null

  try {
    return await $fetch<{
      authors: string[]
      image: string | null
      title: string | null
    }>('/api/books/cover', {
      query: {
        title: form.title.trim(),
        author: form.author.trim() || undefined
      }
    })
  } catch {
    return null
  }
}

const getTodayDate = () => new Date().toISOString().slice(0, 10)
const readingWeekdayLabels = ['일', '월', '화', '수', '목', '금', '토']
const readingMonthLabels = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월']
const readingCalendarPalette = [
  { bg: '#e7f6f1', fg: '#126b5f', border: '#7fc7b7' },
  { bg: '#fff0e7', fg: '#b44d1d', border: '#f0a37d' },
  { bg: '#edf3ff', fg: '#2f63b7', border: '#8eb0ef' },
  { bg: '#fff8df', fg: '#9a6a00', border: '#f1d36f' },
  { bg: '#f7ebff', fg: '#7f46a3', border: '#c79be4' },
  { bg: '#eef1f4', fg: '#495765', border: '#a8b5c2' }
]

const parseDateParts = (value: string) => {
  const [year, month, day] = value.split('-').map(Number)
  return { year, month, day }
}

const createDateKey = (year: number, month: number, day: number) =>
  `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`

const createDateFromKey = (value: string) => {
  const { year, month, day } = parseDateParts(value)
  return new Date(year, month - 1, day)
}

const createMonthKey = (year: number, month: number) => `${year}-${String(month).padStart(2, '0')}`

const shiftMonthKey = (monthKey: string, amount: number) => {
  const [year, month] = monthKey.split('-').map(Number)
  const shifted = new Date(year, month - 1 + amount, 1)
  return createMonthKey(shifted.getFullYear(), shifted.getMonth() + 1)
}

const readingCalendarBooks = computed(() =>
  readingHistory.value
    .filter((book) => book.startedAt && (book.status === 'finished' || book.status === 'reading'))
    .map((book, index) => {
      const rawEnd = book.status === 'reading' ? getTodayDate() : book.finishedAt || book.startedAt
      const startKey = book.startedAt <= rawEnd ? book.startedAt : rawEnd
      const endKey = book.startedAt <= rawEnd ? rawEnd : book.startedAt
      const color = readingCalendarPalette[index % readingCalendarPalette.length]

      return {
        ...book,
        color,
        endKey,
        startKey,
        displayEnd: rawEnd
      }
    })
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === 'reading' ? -1 : 1
      return a.startKey.localeCompare(b.startKey)
    })
)

const readingCalendarSummary = computed(() => {
  const readingCount = readingCalendarBooks.value.filter((book) => book.status === 'reading').length
  const finishedCount = readingCalendarBooks.value.filter((book) => book.status === 'finished').length
  return `읽는 중 ${readingCount}권 · 완독 ${finishedCount}권`
})

const readingCalendarBounds = computed(() => {
  const fallbackMonth = getTodayDate().slice(0, 7)
  if (!readingCalendarBooks.value.length) {
    return { min: fallbackMonth, max: fallbackMonth }
  }

  const sortedStarts = readingCalendarBooks.value.map((book) => book.startKey.slice(0, 7)).sort()
  const sortedEnds = readingCalendarBooks.value.map((book) => book.endKey.slice(0, 7)).sort()

  return {
    min: sortedStarts[0] ?? fallbackMonth,
    max: sortedEnds.at(-1) ?? fallbackMonth
  }
})

const readingCalendarMonthKey = ref(getTodayDate().slice(0, 7))

const readingCalendarMonth = computed(() => {
  const todayKey = getTodayDate()
  const [year, month] = readingCalendarMonthKey.value.split('-').map(Number)
  const firstDay = new Date(year, month - 1, 1)
  const daysInMonth = new Date(year, month, 0).getDate()
  const leadingBlankCount = firstDay.getDay()
  const trailingBlankCount = (7 - ((leadingBlankCount + daysInMonth) % 7 || 7)) % 7

  const dayCells = Array.from({ length: daysInMonth }, (_, dayIndex) => {
    const dateKey = createDateKey(year, month, dayIndex + 1)
    const activeBooks = readingCalendarBooks.value
      .filter((book) => book.startKey <= dateKey && book.endKey >= dateKey)
      .sort((a, b) => {
        if (a.status !== b.status) return a.status === 'reading' ? -1 : 1
        return a.startKey.localeCompare(b.startKey)
      })
    const tooltipBooks = activeBooks.map((book) => ({
      color: book.color,
      id: book.id,
      period: `${book.startKey} ~ ${book.displayEnd}`,
      status: book.status,
      title: book.title
    }))

    return {
      activeBooks,
      dateKey,
      day: dayIndex + 1,
      isToday: dateKey === todayKey,
      tooltipBooks,
      visibleBooks: activeBooks.slice(0, 2)
    }
  })

  return {
    canGoNext: readingCalendarMonthKey.value < readingCalendarBounds.value.max,
    canGoPrev: readingCalendarMonthKey.value > readingCalendarBounds.value.min,
    days: [
      ...Array.from({ length: leadingBlankCount }, (_, index) => ({ id: `blank-start-${index}` })),
      ...dayCells,
      ...Array.from({ length: trailingBlankCount }, (_, index) => ({ id: `blank-end-${index}` }))
    ],
    month,
    title: `${year}년 ${readingMonthLabels[month - 1]}`
  }
})

const moveReadingCalendarMonth = (direction: -1 | 1) => {
  const nextMonthKey = shiftMonthKey(readingCalendarMonthKey.value, direction)
  if (nextMonthKey < readingCalendarBounds.value.min || nextMonthKey > readingCalendarBounds.value.max) return
  readingCalendarMonthKey.value = nextMonthKey
}

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

const archiveAccessStartDate = computed(() => '2026-04-01')

const budgetCalendarSummary = computed(() => {
  const incomeCount = budgetEntriesForMonth.value.filter((entry) => entry.kind === 'income').length
  const expenseCount = budgetEntriesForMonth.value.filter((entry) => entry.kind === 'expense').length
  return `수입 ${incomeCount}건 · 지출 ${expenseCount}건`
})

const budgetCalendarMonth = computed(() => {
  const todayKey = getTodayDate()
  const archiveStartKey = archiveAccessStartDate.value
  const year = budgetReferenceYear.value
  const month = budgetReferenceMonth.value
  const firstDay = new Date(year, month - 1, 1)
  const daysInMonth = new Date(year, month, 0).getDate()
  const leadingBlankCount = firstDay.getDay()
  const trailingBlankCount = (7 - ((leadingBlankCount + daysInMonth) % 7 || 7)) % 7

  const dayCells = Array.from({ length: daysInMonth }, (_, dayIndex) => {
    const dateKey = createDateKey(year, month, dayIndex + 1)
    const entries = budgetEntriesForMonth.value
      .filter((entry) => entry.spentAt === dateKey)
      .sort((a, b) => {
        if (a.kind !== b.kind) return a.kind === 'income' ? -1 : 1
        return b.amount - a.amount
      })

    const incomeTotal = entries
      .filter((entry) => entry.kind === 'income')
      .reduce((sum, entry) => sum + entry.amount, 0)
    const expenseTotal = entries
      .filter((entry) => entry.kind === 'expense')
      .reduce((sum, entry) => sum + entry.amount, 0)
    const visibleEntries = entries.slice(0, 2).map((entry) => ({
      id: entry.id,
      kind: entry.kind,
      title: entry.title.trim() || entry.category.trim() || '기타',
      amount: entry.amount
    }))
    const detailedEntries = entries.map((entry) => ({
      id: entry.id,
      kind: entry.kind,
      title: entry.title.trim() || entry.category.trim() || '기타',
      memo: entry.memo?.trim() || '',
      amount: entry.amount
    }))
    const tooltipText = detailedEntries
      .map((entry) =>
        `${entry.kind === 'income' ? '수입' : '지출'} · ${entry.title}${entry.memo ? ` · ${entry.memo}` : ''} · ${currency.format(entry.amount)}원`
      )
      .join('\n')

    return {
      dateKey,
      day: dayIndex + 1,
      detailedEntries,
      entries,
      expenseTotal,
      incomeTotal,
      isToday: dateKey === todayKey,
      isNoExpenseDay: dateKey >= archiveStartKey && dateKey <= todayKey && expenseTotal === 0,
      tooltipText,
      visibleEntries
    }
  })

  return {
    days: [
      ...Array.from({ length: leadingBlankCount }, (_, index) => ({ id: `budget-blank-start-${index}` })),
      ...dayCells,
      ...Array.from({ length: trailingBlankCount }, (_, index) => ({ id: `budget-blank-end-${index}` }))
    ],
    title: `${year}년 ${readingMonthLabels[month - 1]}`
  }
})

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

const monthlyBudgetRows = computed(() => {
  let cumulative = startBalance.value

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
  () => monthlyBudgetRows.value.find((row) => row.month === budgetReferenceMonth.value)?.cumulative ?? startBalance.value
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

const topExpenseCategoriesLarge = computed(() => topExpenseCategories.value)
const topExpenseCategoriesSmall = computed(() => [...topExpenseCategories.value].reverse())

const incomeSources = computed(() => {
  const grouped = budgetEntriesForMonth.value
    .filter((entry) => entry.kind === 'income')
    .reduce<Record<string, number>>((acc, entry) => {
      const key = entry.memo?.trim() || entry.title.trim() || entry.category.trim() || '기타'
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

const budgetChartTooltip = (label: string, kind: 'income' | 'expense' | 'cumulative', amount: number) => {
  const kindLabel = kind === 'income' ? '수입' : kind === 'expense' ? '지출' : '누적잔고'
  return `${label} ${kindLabel}: ${currency.format(amount)}원`
}

const cumulativeChartBounds = computed(() => {
  const values = monthlyBudgetRows.value.map((row) => row.cumulative)

  if (!values.length) {
    return { min: 0, max: 1, range: 1 }
  }

  const rawMin = Math.min(...values)
  const rawMax = Math.max(...values)
  const midpoint = (rawMin + rawMax) / 2
  const halfSpread = Math.max((rawMax - rawMin) / 2, 0)
  const padding = halfSpread === 0
    ? Math.max(Math.abs(midpoint) * 0.08, 300_000)
    : Math.max(halfSpread * 0.9, 300_000)
  const min = midpoint - (halfSpread + padding)
  const max = midpoint + (halfSpread + padding)

  return {
    min,
    max,
    range: max - min || 1
  }
})

const comboChartInnerWidth = 708
const comboChartColumnGap = 7.2
const comboChartHeight = 280
const comboChartInnerHeight = 232
const comboChartBottom = 244
const getComboChartMonthX = (index: number) => {
  const monthCount = 12
  const monthWidth = (comboChartInnerWidth - comboChartColumnGap * (monthCount - 1)) / monthCount
  return monthWidth / 2 + index * (monthWidth + comboChartColumnGap)
}

const cumulativePolylinePoints = computed(() => {
  return monthlyBudgetRows.value
    .map((row, index) => {
      const x = getComboChartMonthX(index)
      const y = comboChartBottom - ((row.cumulative - cumulativeChartBounds.value.min) / cumulativeChartBounds.value.range) * comboChartInnerHeight
      return `${Number(x.toFixed(2))},${Number(y.toFixed(2))}`
    })
    .join(' ')
})

const cumulativePointPositions = computed(() =>
  monthlyBudgetRows.value.map((row, index) => ({
    month: row.month,
    x: getComboChartMonthX(index),
    y: comboChartBottom - ((row.cumulative - cumulativeChartBounds.value.min) / cumulativeChartBounds.value.range) * comboChartInnerHeight,
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
    const value = cumulativeChartBounds.value.max - (cumulativeChartBounds.value.range / 5) * index
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
  const maxAmount = topExpenseCategoriesLarge.value[0]?.amount || 1

  return topExpenseCategoriesLarge.value.map((item) => {
    const entries = budgetEntriesForMonth.value
      .filter((entry) => entry.kind === 'expense' && (entry.category.trim() || '기타') === item.category)
      .sort((a, b) => b.amount - a.amount || b.spentAt.localeCompare(a.spentAt))

    const details = entries.map((entry) => ({
      id: entry.id,
      title: entry.title.trim() || '기타',
      memo: entry.memo?.trim() || '',
      spentAt: entry.spentAt,
      amount: entry.amount
    }))

    const tooltipLines = details.map((detail) =>
      `${detail.title}${detail.memo ? ` · ${detail.memo}` : ''} · ${detail.spentAt} · ${currency.format(detail.amount)}원`
    )

    const ratio = item.amount / maxAmount
    const basis = 22 + ratio * 30
    const flexGrow = 1.4 + ratio * 5.6

    return {
      ...item,
      basis: `${basis.toFixed(2)}%`,
      flexGrow: Number(flexGrow.toFixed(2)),
      color: '#cc4b1f',
      details,
      tooltipText: tooltipLines.join('\n')
    }
  })
})

const isWorkingState = (state: SyncPhase) =>
  state === 'loading' || state === 'saving' || state === 'deleting' || state === 'refreshing'

const readingBusy = computed(() => isWorkingState(readingSyncState.value))
const budgetBusy = computed(() => isWorkingState(budgetSyncState.value))
const financeBusy = computed(() => isWorkingState(financeSyncState.value))
const showInitialLoader = computed(() => authReady.value && Boolean(user.value) && initialArchiveLoading.value)

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
  openToast(activeTab.value === 'reading' ? '독서 기록장으로 전환되었습니다.' : '가계부로 전환되었습니다.')
}

const resetAllData = () => {
  readingHistory.value = []
  budgetEntries.value = []
  startBalance.value = 0
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

  return budgetEntriesForMonth.value
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

const groupedBudgetEntries = computed(() => {
  const groups = filteredBudgetEntries.value.reduce<
    Array<{
      spentAt: string
      entries: typeof filteredBudgetEntries.value
      expenseTotal: number
      incomeTotal: number
    }>
  >((acc, entry) => {
    const existingGroup = acc.find((group) => group.spentAt === entry.spentAt)

    if (existingGroup) {
      existingGroup.entries.push(entry)
      if (entry.kind === 'expense') {
        existingGroup.expenseTotal += entry.amount
      } else {
        existingGroup.incomeTotal += entry.amount
      }
      return acc
    }

    acc.push({
      spentAt: entry.spentAt,
      entries: [entry],
      expenseTotal: entry.kind === 'expense' ? entry.amount : 0,
      incomeTotal: entry.kind === 'income' ? entry.amount : 0
    })

    return acc
  }, [])

  return groups
})

const readingEmptyMessage = computed(() => {
  if (query.value.trim()) {
    return '검색 결과와 일치하는 도서가 없습니다.'
  }

  if (selectedStatus.value !== 'all') {
    return '선택한 상태에 해당하는 도서가 없습니다.'
  }

  return '도서 목록이 없습니다.'
})

const budgetEmptyMessage = computed(() => {
  if (budgetQuery.value.trim()) {
    return '검색 결과와 일치하는 가계부 내역이 없습니다.'
  }

  if (budgetKindFilter.value !== 'all') {
    return '선택한 구분에 해당하는 가계부 내역이 없습니다.'
  }

  return '선택한 월의 가계부 내역이 없습니다.'
})

useSeoMeta({
  title: '아카이브 허브',
  description: '독서 기록과 가계부를 한 페이지에서 관리하는 개인 아카이브'
})

useHead({
  meta: [
    {
      name: 'viewport',
      content: 'width=device-width, initial-scale=1, viewport-fit=cover'
    }
  ],
  link: [
    {
      rel: 'icon',
      type: 'image/png',
      href: '/favicon.png'
    },
    {
      rel: 'apple-touch-icon',
      href: '/favicon.png'
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
  titleLookupPending.value = false
  titleLookupError.value = ''
  titleSuggestions.value = []
  coverLookupPending.value = false
  coverLookupError.value = ''
  resetForm()
}

const selectedReviewBook = computed(() =>
  reviewBookId.value ? readingHistory.value.find((book) => book.id === reviewBookId.value) ?? null : null
)

const openReviewModal = (id: number) => {
  const target = readingHistory.value.find((book) => book.id === id)
  if (!target) return
  reviewBookId.value = id
  reviewDraft.value = target.memo ?? ''
  reviewModalOpen.value = true
}

const closeReviewModal = () => {
  reviewModalOpen.value = false
  reviewBookId.value = null
  reviewDraft.value = ''
}

const startEditing = (id: number) => {
  const target = readingHistory.value.find((book) => book.id === id)
  if (!target) return

  editingId.value = id
  Object.assign(form, {
    genre: target.genre,
    title: target.title,
    author: target.author ?? '',
    summary: target.summary ?? '',
    coverImage: target.coverImage ?? '',
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
  const matchedBook = await fetchBookMetadata()

  const existingEntry = editingId.value
    ? readingHistory.value.find((book) => book.id === editingId.value)
    : null

  saveBook({
    id: editingId.value ?? undefined,
    createdAt: existingEntry?.createdAt ?? new Date().toISOString(),
    genre: form.genre,
    title: matchedBook?.title || form.title,
    author: form.author || matchedBook?.authors?.[0] || undefined,
    summary: form.summary.trim() || undefined,
    coverImage: form.coverImage.trim() || matchedBook?.image || undefined,
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
  if (reviewBookId.value === id) {
    closeReviewModal()
  }
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

const saveReview = async () => {
  const target = selectedReviewBook.value
  if (!target) return

  saveBook({
    ...target,
    memo: reviewDraft.value.trim()
  })

  closeReviewModal()
  await persistReading()
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
  balanceInput.value = String(startBalance.value)
}

const persistFinance = async () => {
  if (!isCloudConfigured.value || !isAuthenticated.value) return false
  const saved = await saveFinanceSummary(startBalance.value)
  if (saved) {
    openToast('시작잔고가 저장되었습니다.')
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
    startBalance.value = snapshot.startBalance
    syncBalanceInput()
    if (notify) {
      openToast('시작잔고를 새로고침했습니다.')
    }
    return
  }

  if (!financeSyncError.value) {
    const saved = await saveFinanceSummary(startBalance.value)
    if (saved) {
      openToast('시작잔고가 저장되었습니다.')
    }
  }
}

const submitBalance = async () => {
  startBalance.value = Number(balanceInput.value) || 0
  await persistFinance()
  financeModalOpen.value = false
}

onMounted(() => {
  syncBalanceInput()
})

watch(startBalance, () => {
  syncBalanceInput()
})

watch(
  readingCalendarBounds,
  (bounds) => {
    if (readingCalendarMonthKey.value < bounds.min || readingCalendarMonthKey.value > bounds.max) {
      readingCalendarMonthKey.value = bounds.max
    }
  },
  { immediate: true }
)

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
    startBalance.value = financeSnapshot.startBalance
  } else if (!financeSyncError.value) {
    await saveFinanceSummary(startBalance.value)
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

    initialArchiveLoading.value = true

    try {
      await Promise.all([
        refreshReading(false),
        refreshBudget(false),
        refreshFinance(false)
      ])
    } finally {
      initialArchiveLoading.value = false
    }
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
        <span class="archive-brand__mark" aria-hidden="true">
          {{ activeTab === 'reading' ? '📚' : '💵' }}
        </span>
        <div>
          <strong>{{ user?.displayName ? `${user.displayName}의 Archive Hub` : 'Archive Hub' }}</strong>
          <span>{{ activeTab === 'reading' ? '독서 기록장' : '가계부' }}</span>
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
      <p>구글 로그인 후 내 계정 기준으로 독서 기록, 가계부, 시작잔고가 따로 저장됩니다.</p>
    </section>

    <section v-else-if="showInitialLoader" class="center-loader" aria-live="polite" aria-busy="true">
      <span class="center-loader__spinner" aria-hidden="true" />
      <p>아카이브를 불러오는 중...</p>
    </section>

    <div v-else-if="user && activeTab === 'reading'" class="archive-stats">
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
          </div>

          <div class="archive-controls__actions budget-dashboard__actions">
            <button type="button" class="ghost-button icon-button" aria-label="가계부 기록 새로고침" title="새로고침" @click="refreshBudget">
              <RefreshCw aria-hidden="true" />
            </button>
            <button type="button" class="primary-button" @click="openBudgetModal">가계부 추가</button>
          </div>
        </div>

        <BudgetMetricsGrid
          :budget-reference-month="budgetReferenceMonth"
          :start-balance="startBalance"
          :month-income="monthIncome"
          :previous-month-income="previousMonthIncome"
          :month-expense="monthExpense"
          :previous-month-expense="previousMonthExpense"
          :month-net="monthNet"
          :previous-month-net="previousMonthNet"
          :month-cumulative-balance="monthCumulativeBalance"
          @manage-start-balance="openFinanceModal"
        />
      </div>

      <div class="budget-dashboard__middle">
        <section class="budget-panel budget-panel--table">
          <h2>{{ budgetReferenceYear }}년도 월별 수입/지출 현황</h2>
          <div class="budget-panel__scroll">
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
                    <th>누적</th>
                    <td v-for="row in monthlyBudgetRows" :key="`balance-${row.month}`">{{ currency.format(row.cumulative) }}</td>
                    <td>{{ currency.format(monthlyBudgetRows.at(-1)?.cumulative ?? 0) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
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
              <span><i data-kind="cumulative" />누적잔고</span>
            </div>
            <div class="budget-panel__scroll">
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
                            :title="budgetChartTooltip(item.label, 'income', item.income)"
                            aria-label="월별 수입"
                          />
                          <div
                            class="combo-chart__column combo-chart__column--expense"
                            :style="{ height: `${(item.expense / budgetChartMax) * 100}%` }"
                            :title="budgetChartTooltip(item.label, 'expense', item.expense)"
                            aria-label="월별 지출"
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
                      <g
                        v-for="point in cumulativePointPositions"
                        :key="`point-${point.month}`"
                        class="combo-chart__point-wrap"
                      >
                        <title>{{ budgetChartTooltip(`${point.month}월`, 'cumulative', point.value) }}</title>
                        <circle
                          class="combo-chart__point"
                          :cx="point.x"
                          :cy="point.y"
                          r="4"
                        />
                      </g>
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
            <div v-if="incomeDonutSegments.length" class="donut-card__legend">
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
            <p v-else class="budget-panel__empty">항목이 없습니다.</p>
          </div>
        </section>

        <section class="budget-panel budget-panel--treemap">
          <h2>{{ budgetReferenceMonth }}월 지출금액</h2>
          <div v-if="expenseTreemap.length" class="treemap">
            <div
              v-for="tile in expenseTreemap"
              :key="`tile-${tile.category}`"
              class="treemap__tile"
              :style="{ flex: `${tile.flexGrow} 1 ${tile.basis}`, background: tile.color }"
              :title="tile.tooltipText || `${tile.category}: ${currency.format(tile.amount)}원`"
            >
              <span>{{ tile.category }}</span>
              <strong>{{ currency.format(tile.amount) }}</strong>
                <div v-if="tile.details.length" class="treemap__tooltip">
                  <p class="treemap__tooltip-title">{{ tile.category }} 세부내역</p>
                  <ul class="treemap__tooltip-list">
                    <li v-for="detail in tile.details" :key="detail.id">
                      <span>{{ detail.memo || detail.title }}</span>
                      <span>{{ detail.spentAt }}</span>
                      <strong>{{ currency.format(detail.amount) }}원</strong>
                    </li>
                  </ul>
              </div>
            </div>
          </div>
          <p v-else class="budget-panel__empty">항목이 없습니다.</p>
        </section>

        <section class="budget-panel budget-panel--categories">
          <h2>{{ budgetReferenceMonth }}월 많이 소비한 항목</h2>
          <div v-if="topExpenseCategoriesLarge.length" class="category-bars">
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
          <p v-else class="budget-panel__empty">항목이 없습니다.</p>
        </section>
      </div>

      <section class="budget-calendar">
        <div class="budget-calendar__head">
          <div>
            <p class="budget-calendar__eyebrow">Budget Calendar</p>
            <h2>{{ budgetCalendarMonth.title }} 수입/지출 달력</h2>
            <p class="budget-calendar__description">
              날짜별 수입과 지출 흐름을 한눈에 보면서 아래 항목 카드와 함께 확인할 수 있습니다.
            </p>
          </div>
          <p class="budget-calendar__summary">{{ budgetCalendarSummary }}</p>
        </div>

        <div class="budget-calendar__legend">
          <span><i data-kind="income" />수입</span>
          <span><i data-kind="expense" />지출</span>
        </div>

        <article class="budget-month">
          <header class="budget-month__header">
            <h3>{{ budgetCalendarMonth.title }}</h3>
          </header>
          <div class="budget-month__weekdays">
            <span v-for="weekday in readingWeekdayLabels" :key="`budget-${weekday}`">{{ weekday }}</span>
          </div>
          <div class="budget-month__grid">
            <div
              v-for="day in budgetCalendarMonth.days"
              :key="day.id ?? day.dateKey"
              class="budget-day"
              :class="{
                'budget-day--blank': !day.dateKey,
                'budget-day--today': day.isToday,
                'budget-day--active': day.entries?.length
              }"
              :title="day.tooltipText || undefined"
            >
              <template v-if="day.dateKey">
                <span class="budget-day__date">
                  {{ day.day }}
                  <em v-if="day.isNoExpenseDay" class="budget-day__marker" title="무지출">*</em>
                </span>
                <div v-if="day.incomeTotal || day.expenseTotal" class="budget-day__totals">
                  <span v-if="day.incomeTotal" class="budget-day__total" data-kind="income">
                    +{{ currency.format(day.incomeTotal) }}
                  </span>
                  <span v-if="day.expenseTotal" class="budget-day__total" data-kind="expense">
                    -{{ currency.format(day.expenseTotal) }}
                  </span>
                </div>
                <div v-if="day.visibleEntries?.length" class="budget-day__entries">
                  <span
                    v-for="entry in day.visibleEntries"
                    :key="entry.id"
                    class="budget-day__entry"
                    :data-kind="entry.kind"
                    :title="`${entry.title} · ${currency.format(entry.amount)}원`"
                  >
                    {{ entry.title }}
                  </span>
                  <span v-if="day.entries.length > day.visibleEntries.length" class="budget-day__more">
                    +{{ day.entries.length - day.visibleEntries.length }}
                  </span>
                </div>
                <div v-if="day.detailedEntries?.length" class="budget-day__tooltip">
                  <p class="budget-day__tooltip-title">{{ day.day }}일 세부내역</p>
                  <ul class="budget-day__tooltip-list">
                    <li v-for="entry in day.detailedEntries" :key="`budget-day-detail-${entry.id}`">
                      <span class="budget-day__tooltip-kind" :data-kind="entry.kind">
                        {{ entry.kind === 'income' ? '수입' : '지출' }}
                      </span>
                      <span class="budget-day__tooltip-text">{{ entry.memo || entry.title }}</span>
                      <strong>{{ currency.format(entry.amount) }}원</strong>
                    </li>
                  </ul>
                </div>
              </template>
            </div>
          </div>
        </article>
      </section>
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
              <RefreshCw aria-hidden="true" />
            </button>
            <button type="button" class="primary-button" @click="openReadingModal">독서 기록 추가</button>
          </div>
        </div>

        <div v-if="filteredBooks.length" class="book-grid">
          <BookCard
            v-for="book in filteredBooks"
            :key="book.id"
            :book="book"
            @edit="startEditing"
            @review="openReviewModal"
            @status-change="handleStatusChange"
            @delete="handleDeleteBook"
          />
        </div>
        <p v-else class="archive-list__empty">{{ readingEmptyMessage }}</p>

        <section class="reading-calendar">
          <div class="reading-calendar__head">
            <div>
              <p class="reading-calendar__eyebrow">Reading Calendar</p>
              <h2>읽은 기간 캘린더 (26. 03. 21~)</h2>
              <p class="reading-calendar__description">
                일반 달력처럼 한 달씩 넘기면서 시작일부터 완료일 또는 오늘까지의 독서 기간을 볼 수 있습니다.
              </p>
            </div>
            <p class="reading-calendar__summary">{{ readingCalendarSummary }}</p>
          </div>

          <div v-if="readingCalendarBooks.length" class="reading-calendar__legend">
            <span><i data-status="reading" />읽는 중은 오늘까지 표시</span>
            <span><i data-status="finished" />완독은 완료일까지 표시</span>
          </div>

          <article v-if="readingCalendarBooks.length" class="reading-month">
            <header class="reading-month__header">
              <button
                type="button"
                class="ghost-button icon-button"
                aria-label="이전 달"
                :disabled="!readingCalendarMonth.canGoPrev"
                @click="moveReadingCalendarMonth(-1)"
              >
                <ChevronLeft aria-hidden="true" />
              </button>
              <h3>{{ readingCalendarMonth.title }}</h3>
              <button
                type="button"
                class="ghost-button icon-button"
                aria-label="다음 달"
                :disabled="!readingCalendarMonth.canGoNext"
                @click="moveReadingCalendarMonth(1)"
              >
                <ChevronRight aria-hidden="true" />
              </button>
            </header>
            <div class="reading-month__weekdays">
              <span v-for="weekday in readingWeekdayLabels" :key="weekday">{{ weekday }}</span>
            </div>
            <div class="reading-month__grid">
              <div
                v-for="day in readingCalendarMonth.days"
                :key="day.id ?? day.dateKey"
                class="reading-day"
                :class="{
                  'reading-day--blank': !day.dateKey,
                  'reading-day--today': day.isToday,
                  'reading-day--active': day.activeBooks?.length
                }"
              >
                <template v-if="day.dateKey">
                  <span class="reading-day__date">
                    {{ day.day }}
                    <em v-if="day.activeBooks?.length" class="reading-day__count">{{ day.activeBooks.length }}권</em>
                  </span>
                  <div v-if="day.visibleBooks?.length" class="reading-day__books">
                    <span
                      v-for="book in day.visibleBooks"
                      :key="`${day.dateKey}-${book.id}`"
                      class="reading-day__book"
                      :data-status="book.status"
                      :style="{
                        backgroundColor: book.color.bg,
                        borderColor: book.color.border,
                        color: book.color.fg
                      }"
                      :title="`${book.title} · ${book.startKey} ~ ${book.displayEnd}`"
                    >
                      <i
                        class="reading-day__book-dot"
                        aria-hidden="true"
                        :style="{ backgroundColor: book.color.fg }"
                      />
                      {{ book.title }}
                    </span>
                    <span v-if="day.activeBooks.length > day.visibleBooks.length" class="reading-day__more">
                      +{{ day.activeBooks.length - day.visibleBooks.length }}권
                    </span>
                  </div>
                  <div v-if="day.tooltipBooks?.length" class="reading-day__tooltip">
                    <p class="reading-day__tooltip-title">{{ day.day }}일 독서 내역</p>
                    <ul class="reading-day__tooltip-list">
                      <li v-for="book in day.tooltipBooks" :key="`reading-day-${day.dateKey}-${book.id}`">
                        <span
                          class="reading-day__tooltip-chip"
                          :style="{
                            backgroundColor: book.color.bg,
                            borderColor: book.color.border,
                            color: book.color.fg
                          }"
                        >
                          {{ book.status === 'reading' ? '읽는 중' : '완독' }}
                        </span>
                        <span class="reading-day__tooltip-text">{{ book.title }}</span>
                        <small>{{ book.period }}</small>
                      </li>
                    </ul>
                  </div>
                </template>
              </div>
            </div>
          </article>
          <p v-else class="archive-list__empty reading-calendar__empty">읽는 중이거나 완독한 책이 아직 없습니다.</p>
        </section>
      </section>
    </div>

    <div v-else-if="user" class="archive-list">
      <section class="archive-list">
        <div class="budget-list__toolbar">
          <label class="field budget-list__filter">
            <select v-model="budgetKindFilter" aria-label="가계부 구분 필터">
              <option value="all">전체</option>
              <option value="expense">지출</option>
              <option value="income">수입</option>
            </select>
          </label>
        </div>
        <div v-if="groupedBudgetEntries.length" class="budget-entry-groups">
          <section
            v-for="group in groupedBudgetEntries"
            :key="`budget-group-${group.spentAt}`"
            class="budget-entry-group"
          >
            <header class="budget-entry-group__head">
              <div>
                <p class="budget-entry-group__eyebrow">Entry Date</p>
                <h3>{{ group.spentAt }}</h3>
              </div>
              <div class="budget-entry-group__totals">
                <span v-if="group.incomeTotal" data-kind="income">+{{ currency.format(group.incomeTotal) }}원</span>
                <span v-if="group.expenseTotal" data-kind="expense">-{{ currency.format(group.expenseTotal) }}원</span>
              </div>
            </header>

            <div class="book-grid budget-entry-group__grid">
              <BudgetCard
                v-for="entry in group.entries"
                :key="entry.id"
                :entry="entry"
                @edit="startBudgetEditing"
                @delete="handleDeleteBudgetEntry"
              />
            </div>
          </section>
        </div>
        <p v-else class="archive-list__empty">{{ budgetEmptyMessage }}</p>
      </section>
    </div>

    <div v-if="readingModalOpen" class="modal-backdrop" role="presentation" @click.self="closeReadingModal">
      <section class="entry-panel modal-panel" role="dialog" aria-modal="true" aria-labelledby="reading-modal-title">
        <div v-if="readingBusy" class="modal-loader" aria-live="polite" aria-busy="true">
          <span class="modal-loader__spinner" aria-hidden="true" />
          <p>독서 기록 동기화 중...</p>
        </div>

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
              <input v-model="form.title" type="text" placeholder="책 제목" @input="searchBookTitles(form.title)">
              <small v-if="readingErrors.title" class="field__error">{{ readingErrors.title }}</small>
              <small v-else-if="titleLookupPending" class="field__hint">책 제목을 찾는 중...</small>
              <div v-if="titleSuggestions.length" class="book-suggestions">
                <button
                  v-for="item in titleSuggestions"
                  :key="item.id"
                  type="button"
                  class="book-suggestions__item"
                  @click="applyBookSuggestion(item)"
                >
                  <img v-if="item.image" :src="item.image" :alt="`${item.title} 표지`">
                  <span v-else class="book-suggestions__thumb">책</span>
                  <span class="book-suggestions__text">
                    <strong>{{ item.title }}</strong>
                    <small>{{ item.authors.join(', ') || '저자 정보 없음' }}</small>
                  </span>
                </button>
              </div>
              <small v-if="titleLookupError" class="field__error">{{ titleLookupError }}</small>
            </label>
            <label class="field">
              <span>저자</span>
              <input v-model="form.author" type="text" placeholder="선택 입력">
            </label>
            <label class="field field--full">
              <span>한줄 요약</span>
              <input v-model="form.summary" type="text" maxlength="120" placeholder="저자 아래에 보여줄 짧은 요약">
            </label>
            <label class="field field--full">
              <span>표지 이미지</span>
              <div class="field__inline">
                <input
                  v-model="form.coverImage"
                  type="text"
                  inputmode="url"
                  placeholder="이미지 주소 또는 이미지 자체를 붙여넣어주세요"
                  @paste="handleCoverPaste"
                >
                <button type="button" class="ghost-button" :disabled="coverLookupPending" @click="lookupBookCover">
                  {{ coverLookupPending ? '찾는 중...' : '표지 자동 가져오기' }}
                </button>
              </div>
              <small class="field__hint">어떤 사이트 이미지든 주소를 붙여넣거나, 캡처한 이미지를 그대로 붙여넣으면 바로 반영됩니다.</small>
              <small v-if="coverLookupError" class="field__error">{{ coverLookupError }}</small>
            </label>
            <div v-if="form.coverImage.trim()" class="book-cover-preview field--full" @paste="handleCoverPaste">
              <img :src="form.coverImage.trim()" alt="책 표지 미리보기">
              <div>
                <strong>표지 미리보기</strong>
                <p>새 이미지를 다시 붙여넣으면 즉시 교체되고, 저장 후 카드에도 같은 표지가 보입니다.</p>
              </div>
            </div>
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
            <p v-if="readingSyncError" class="entry-form__hint">Firebase 오류: {{ readingSyncError }}</p>
          </div>
        </form>
      </section>
    </div>

    <div v-if="reviewModalOpen" class="modal-backdrop" role="presentation" @click.self="closeReviewModal">
      <section class="entry-panel modal-panel" role="dialog" aria-modal="true" aria-labelledby="review-modal-title">
        <div class="entry-panel__head">
          <div>
            <p class="entry-panel__eyebrow">Reading Review</p>
            <h2 id="review-modal-title">{{ selectedReviewBook?.title }} 독후감</h2>
          </div>
          <div class="entry-panel__actions">
            <button type="button" class="ghost-button" @click="closeReviewModal">닫기</button>
          </div>
        </div>

        <div v-if="selectedReviewBook" class="review-modal">
          <div class="review-modal__book">
            <button class="book-card__cover book-card__cover--large" type="button" :aria-label="`${selectedReviewBook.title} 표지`">
              <img v-if="selectedReviewBook.coverImage" :src="selectedReviewBook.coverImage" :alt="`${selectedReviewBook.title} 표지`">
              <span v-else>독후감</span>
            </button>
            <div>
              <strong>{{ selectedReviewBook.title }}</strong>
              <p>{{ selectedReviewBook.author || '저자 미입력' }}</p>
              <small>{{ selectedReviewBook.startedAt }} ~ {{ selectedReviewBook.finishedAt || '읽는 중' }}</small>
            </div>
          </div>

          <label class="field">
            <span>독후감</span>
            <textarea
              v-model="reviewDraft"
              rows="10"
              placeholder="이 책을 읽고 느낀 점을 자유롭게 남겨보세요"
            />
          </label>

          <div class="entry-form__actions">
            <button type="button" class="primary-button" @click="saveReview">독후감 저장</button>
          </div>
        </div>
      </section>
    </div>

    <div v-if="financeModalOpen" class="modal-backdrop" role="presentation" @click.self="financeModalOpen = false">
      <section class="entry-panel modal-panel modal-panel--small" role="dialog" aria-modal="true" aria-labelledby="finance-modal-title">
        <div v-if="financeBusy" class="modal-loader" aria-live="polite" aria-busy="true">
          <span class="modal-loader__spinner" aria-hidden="true" />
          <p>잔고 동기화 중...</p>
        </div>

        <div class="entry-panel__head">
          <div>
            <p class="entry-panel__eyebrow">Balance</p>
            <h2 id="finance-modal-title">시작잔고 관리</h2>
          </div>
          <div class="entry-panel__actions">
            <button type="button" class="ghost-button icon-button" aria-label="시작잔고 새로고침" title="새로고침" @click="refreshFinance">
              <RefreshCw aria-hidden="true" />
            </button>
            <button type="button" class="ghost-button" @click="financeModalOpen = false">닫기</button>
          </div>
        </div>

        <form class="entry-form" novalidate @submit.prevent="submitBalance">
          <div class="entry-form__grid">
            <label class="field">
              <span>시작잔고</span>
              <input v-model="balanceInput" type="number" step="1000" placeholder="0">
            </label>
          </div>

          <div class="entry-form__actions">
            <button type="submit" class="primary-button">시작잔고 저장</button>
            <p v-if="financeSyncError" class="entry-form__hint">Firebase 오류: {{ financeSyncError }}</p>
          </div>
        </form>
      </section>
    </div>

    <div v-if="budgetModalOpen" class="modal-backdrop" role="presentation" @click.self="closeBudgetModal">
      <section class="entry-panel modal-panel" role="dialog" aria-modal="true" aria-labelledby="budget-modal-title">
        <div v-if="budgetBusy" class="modal-loader" aria-live="polite" aria-busy="true">
          <span class="modal-loader__spinner" aria-hidden="true" />
          <p>가계부 동기화 중...</p>
        </div>

        <div class="entry-panel__head">
          <div>
            <p class="entry-panel__eyebrow">Budget Editor</p>
            <h2 id="budget-modal-title">{{ budgetEditingId ? '가계부 항목 수정' : '가계부 기록 추가' }}</h2>
          </div>
          <div class="entry-panel__actions">
            <button v-if="budgetEditingId" type="button" class="ghost-button" @click="resetBudgetForm">새로 입력</button>
            <button type="button" class="ghost-button" @click="closeBudgetModal">닫기</button>
          </div>
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
              <span>카테고리</span>
              <select v-model="budgetForm.category">
                <option v-for="category in budgetCategoryOptions" :key="category" :value="category">
                  {{ category }}
                </option>
              </select>
              <small v-if="budgetErrors.category" class="field__error">{{ budgetErrors.category }}</small>
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
            <p v-if="budgetSyncError" class="entry-form__hint">Firebase 오류: {{ budgetSyncError }}</p>
          </div>
        </form>
      </section>
    </div>

    <div v-if="showToast" class="toast" :data-tone="toastTone" role="status" aria-live="polite">
      {{ toastMessage }}
    </div>
  </section>
</template>
