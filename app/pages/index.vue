<script setup lang="ts">
import type { BookEntry, ReadingStatus } from '~/types/book'
import type { BudgetEntry, BudgetKind } from '~/types/finance'

const { readingHistory, saveBook, updateStatus } = useReadingArchive()
const { budgetEntries, saveEntry } = useBudgetArchive()

const activeTab = ref<'reading' | 'budget'>('reading')
const query = ref('')
const selectedStatus = ref<'all' | 'finished' | 'reading' | 'paused'>('all')
const editingId = ref<number | null>(null)
const budgetQuery = ref('')
const budgetKindFilter = ref<'all' | BudgetKind>('all')
const budgetEditingId = ref<number | null>(null)
const currency = new Intl.NumberFormat('ko-KR')

const latestBudgetDate = computed(() => {
  const sorted = [...budgetEntries.value].sort((a, b) => b.spentAt.localeCompare(a.spentAt))
  return sorted[0]?.spentAt ?? '2026-04-01'
})

const budgetReferenceYear = ref(Number(latestBudgetDate.value.slice(0, 4)))
const budgetReferenceMonth = ref(Number(latestBudgetDate.value.slice(5, 7)))

const emptyForm = () => ({
  genre: '',
  title: '',
  author: '',
  startedAt: '',
  finishedAt: '',
  rating: '',
  memo: '',
  status: 'reading' as ReadingStatus
})

const form = reactive(emptyForm())

const emptyBudgetForm = () => ({
  title: '',
  category: '',
  amount: '',
  spentAt: '',
  paymentMethod: '',
  memo: '',
  kind: 'expense' as BudgetKind
})

const budgetForm = reactive(emptyBudgetForm())

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

const balance = computed(() => totalIncome.value - totalExpense.value)
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
  let cumulative = 0

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
  () => monthlyBudgetRows.value.find((row) => row.month === budgetReferenceMonth.value)?.cumulative ?? 0
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
        mint: '#2eb8a3',
        coral: '#ff7a45',
        sky: '#5a9df2',
        gold: '#f0ad2c',
        rose: '#f06a92',
        slate: '#70849d'
      }

      return `${colorMap[segment.color]} ${segment.start}deg ${segment.end}deg`
    })
    .join(', ')

  return { background: `conic-gradient(${gradient})` }
})

const expenseTreemap = computed(() => {
  const total = topExpenseCategoriesLarge.value.reduce((sum, item) => sum + item.amount, 0) || 1
  const palette = ['#bc4c3d', '#da5a47', '#ef6b5a', '#f58f84', '#f7b0a8']

  return topExpenseCategoriesLarge.value.map((item, index) => ({
    ...item,
    width: `${Math.max(18, (item.amount / total) * 100)}%`,
    color: palette[index % palette.length]
  }))
})

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
}

const submitForm = () => {
  if (!form.genre || !form.title || !form.startedAt || !form.memo) return

  saveBook({
    id: editingId.value ?? undefined,
    genre: form.genre,
    title: form.title,
    author: form.author || undefined,
    startedAt: form.startedAt,
    finishedAt: form.finishedAt || undefined,
    rating: form.rating ? Number(form.rating) : undefined,
    memo: form.memo,
    status: form.status
  })

  resetForm()
}

const handleStatusChange = ({ id, status }: { id: number; status: BookEntry['status'] }) => {
  updateStatus(id, status)
}

const resetBudgetForm = () => {
  budgetEditingId.value = null
  Object.assign(budgetForm, emptyBudgetForm())
}

const startBudgetEditing = (id: number) => {
  const target = budgetEntries.value.find((entry) => entry.id === id)
  if (!target) return

  budgetEditingId.value = id
  Object.assign(budgetForm, {
    title: target.title,
    category: target.category,
    amount: String(target.amount),
    spentAt: target.spentAt,
    paymentMethod: target.paymentMethod ?? '',
    memo: target.memo ?? '',
    kind: target.kind
  })
}

const submitBudgetForm = () => {
  if (!budgetForm.title || !budgetForm.category || !budgetForm.amount || !budgetForm.spentAt) {
    return
  }

  saveEntry({
    id: budgetEditingId.value ?? undefined,
    title: budgetForm.title,
    category: budgetForm.category,
    amount: Number(budgetForm.amount),
    spentAt: budgetForm.spentAt,
    paymentMethod: budgetForm.paymentMethod || undefined,
    memo: budgetForm.memo || undefined,
    kind: budgetForm.kind
  })

  resetBudgetForm()
}
</script>

<template>
  <section class="archive-page">
    <div class="archive-page__hero">
      <p class="archive-page__eyebrow">Personal Archive Hub</p>
      <h1>{{ activeTab === 'reading' ? '독서 아카이브' : '가계부 아카이브' }}</h1>
      <p class="archive-page__desc">
        {{ activeTab === 'reading'
          ? '읽었던 책을 모아보고, 현재 읽는 흐름까지 한 화면에서 정리하는 개인 독서 대시보드'
          : '수입과 지출을 가볍게 기록하고, 흐름을 한 화면에서 살펴보는 개인 가계부 대시보드' }}
      </p>
    </div>

    <div class="tab-bar" role="tablist" aria-label="아카이브 탭">
      <button
        type="button"
        class="tab-button"
        :data-active="activeTab === 'reading'"
        @click="activeTab = 'reading'"
      >
       독서
      </button>
      <button
        type="button"
        class="tab-button"
        :data-active="activeTab === 'budget'"
        @click="activeTab = 'budget'"
      >
        가계부
      </button>
    </div>

    <div v-if="activeTab === 'reading'" class="archive-stats">
      <article class="stat-card">
        <p>전체 도서</p>
        <strong>{{ totalBooks }}</strong>
      </article>
      <article class="stat-card">
        <p>완독 수</p>
        <strong>{{ completedBooks }}</strong>
      </article>
      <article class="stat-card">
        <p>평균 평점</p>
        <strong>{{ averageRating }}</strong>
      </article>
    </div>

    <section v-if="activeTab === 'budget'" class="budget-dashboard">
      <div class="budget-dashboard__top">
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

        <div class="budget-dashboard__metrics">
          <article class="metric-card">
            <p>{{ budgetReferenceMonth }}월 수입</p>
            <strong>{{ currency.format(monthIncome) }}원</strong>
            <small>{{ monthDelta(monthIncome, previousMonthIncome) >= 0 ? '▲' : '▼' }} {{ currency.format(Math.abs(monthDelta(monthIncome, previousMonthIncome))) }}</small>
          </article>
          <article class="metric-card">
            <p>{{ budgetReferenceMonth }}월 지출</p>
            <strong>{{ currency.format(monthExpense) }}원</strong>
            <small>{{ monthDelta(monthExpense, previousMonthExpense) >= 0 ? '▲' : '▼' }} {{ currency.format(Math.abs(monthDelta(monthExpense, previousMonthExpense))) }}</small>
          </article>
          <article class="metric-card">
            <p>{{ budgetReferenceMonth }}월 수입-지출</p>
            <strong>{{ currency.format(monthNet) }}원</strong>
            <small>{{ monthDelta(monthNet, previousMonthNet) >= 0 ? '▲' : '▼' }} {{ currency.format(Math.abs(monthDelta(monthNet, previousMonthNet))) }}</small>
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

        <section class="budget-panel">
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

    <div v-if="activeTab === 'reading'" class="archive-layout">
      <section class="entry-panel">
        <div class="entry-panel__head">
          <div>
            <p class="entry-panel__eyebrow">Archive Editor</p>
            <h2>{{ editingId ? '독서 기록 수정' : '새 독서 기록 추가' }}</h2>
          </div>
          <button v-if="editingId" type="button" class="ghost-button" @click="resetForm">
            새로 입력
          </button>
        </div>

        <form class="entry-form" @submit.prevent="submitForm">
          <div class="entry-form__grid">
            <label class="field">
              <span>유형</span>
              <input v-model="form.genre" type="text" placeholder="소설, 인문, 에세이">
            </label>
            <label class="field">
              <span>제목</span>
              <input v-model="form.title" type="text" placeholder="책 제목">
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
            </label>
            <label class="field">
              <span>완료</span>
              <input v-model="form.finishedAt" type="date">
            </label>
            <label class="field">
              <span>평점</span>
              <select v-model="form.rating">
                <option value="">선택 안 함</option>
                <option value="1">1점</option>
                <option value="2">2점</option>
                <option value="3">3점</option>
                <option value="4">4점</option>
                <option value="5">5점</option>
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
            <p class="entry-form__hint">입력한 내용은 이 브라우저에 저장됩니다.</p>
          </div>
        </form>
      </section>

      <section class="archive-list">
        <div class="archive-controls">
          <label class="field">
            <span>검색</span>
            <input v-model="query" type="search" placeholder="제목, 저자, 장르 검색" aria-label="책 검색">
          </label>
          <label class="field">
            <span>상태</span>
            <select v-model="selectedStatus" aria-label="독서 상태 필터">
              <option value="all">전체</option>
              <option value="finished">완독</option>
              <option value="reading">읽는 중</option>
              <option value="paused">잠시 멈춤</option>
            </select>
          </label>
        </div>

        <div class="book-grid">
          <BookCard
            v-for="book in filteredBooks"
            :key="book.id"
            :book="book"
            @edit="startEditing"
            @status-change="handleStatusChange"
          />
        </div>
      </section>
    </div>

    <div v-else class="archive-layout">
      <section class="entry-panel">
        <div class="entry-panel__head">
          <div>
            <p class="entry-panel__eyebrow">Budget Editor</p>
            <h2>{{ budgetEditingId ? '가계부 항목 수정' : '새 가계부 기록 추가' }}</h2>
          </div>
          <button v-if="budgetEditingId" type="button" class="ghost-button" @click="resetBudgetForm">
            새로 입력
          </button>
        </div>

        <form class="entry-form" @submit.prevent="submitBudgetForm">
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
              <input v-model="budgetForm.title" type="text" placeholder="식비, 월급, 교통비">
            </label>
            <label class="field">
              <span>카테고리</span>
              <input v-model="budgetForm.category" type="text" placeholder="식비, 생활, 수입">
            </label>
            <label class="field">
              <span>금액</span>
              <input v-model="budgetForm.amount" type="number" min="0" step="100" placeholder="0">
            </label>
            <label class="field">
              <span>날짜</span>
              <input v-model="budgetForm.spentAt" type="date">
            </label>
            <label class="field">
              <span>결제수단</span>
              <input v-model="budgetForm.paymentMethod" type="text" placeholder="카드, 현금, 이체">
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
            <p class="entry-form__hint">가계부 기록도 이 브라우저에 저장됩니다.</p>
          </div>
        </form>
      </section>

      <section class="archive-list">
        <div class="archive-controls">
          <label class="field">
            <span>검색</span>
            <input v-model="budgetQuery" type="search" placeholder="내역, 카테고리, 메모 검색" aria-label="가계부 검색">
          </label>
          <label class="field">
            <span>구분</span>
            <select v-model="budgetKindFilter" aria-label="가계부 구분 필터">
              <option value="all">전체</option>
              <option value="expense">지출</option>
              <option value="income">수입</option>
            </select>
          </label>
        </div>

        <div class="book-grid">
          <BudgetCard
            v-for="entry in filteredBudgetEntries"
            :key="entry.id"
            :entry="entry"
            @edit="startBudgetEditing"
          />
        </div>
      </section>
    </div>
  </section>
</template>
