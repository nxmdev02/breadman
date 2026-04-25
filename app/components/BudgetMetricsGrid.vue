<script setup lang="ts">
import { Settings } from 'lucide-vue-next'

const props = defineProps<{
  budgetReferenceMonth: number
  startBalance: number
  monthIncome: number
  previousMonthIncome: number
  monthExpense: number
  previousMonthExpense: number
  monthNet: number
  previousMonthNet: number
  monthCumulativeBalance: number
}>()

const emit = defineEmits<{
  manageStartBalance: []
}>()

const currency = new Intl.NumberFormat('ko-KR')

const formatWonAmount = (value: number) => currency.format(value)

const monthDelta = (current: number, previous: number) => current - previous

const deltaTrend = (current: number, previous: number) => {
  const delta = monthDelta(current, previous)
  if (delta === 0) return 'flat'
  return delta > 0 ? 'up' : 'down'
}

const formatDelta = (current: number, previous: number) => {
  const delta = monthDelta(current, previous)
  if (delta === 0) return '-'
  return `${delta > 0 ? '+' : '-'} ${currency.format(Math.abs(delta))}`
}
</script>

<template>
  <div class="budget-dashboard__metrics">
    <article class="metric-card">
      <div class="metric-card__head metric-card__head--inline">
        <p>시작잔고</p>
        <button
          type="button"
          class="metric-card__action"
          aria-label="시작잔고 관리"
          title="시작잔고 관리"
          @click="emit('manageStartBalance')"
        >
          <Settings class="gear-icon" aria-hidden="true" />
        </button>
      </div>
      <div class="metric-card__value-line metric-card__value-line--single">
        <strong class="metric-card__amount">
          <span class="metric-card__amount-value">{{ formatWonAmount(props.startBalance) }}</span>
          <span class="metric-card__amount-unit">원</span>
        </strong>
      </div>
    </article>

    <article class="metric-card">
      <div class="metric-card__head metric-card__head--title">
        <p>{{ props.budgetReferenceMonth }}월 수입</p>
      </div>
      <div class="metric-card__value-line">
        <strong class="metric-card__amount">
          <span class="metric-card__amount-value">{{ formatWonAmount(props.monthIncome) }}</span>
          <span class="metric-card__amount-unit">원</span>
        </strong>
        <small
          class="metric-card__delta"
          :data-trend="deltaTrend(props.monthIncome, props.previousMonthIncome)"
        >
          {{ formatDelta(props.monthIncome, props.previousMonthIncome) }}
        </small>
      </div>
    </article>

    <article class="metric-card">
      <div class="metric-card__head metric-card__head--title">
        <p>{{ props.budgetReferenceMonth }}월 지출</p>
      </div>
      <div class="metric-card__value-line">
        <strong class="metric-card__amount">
          <span class="metric-card__amount-value">{{ formatWonAmount(props.monthExpense) }}</span>
          <span class="metric-card__amount-unit">원</span>
        </strong>
        <small
          class="metric-card__delta"
          :data-trend="deltaTrend(props.monthExpense, props.previousMonthExpense)"
        >
          {{ formatDelta(props.monthExpense, props.previousMonthExpense) }}
        </small>
      </div>
    </article>

    <article class="metric-card">
      <div class="metric-card__head metric-card__head--title">
        <p>{{ props.budgetReferenceMonth }}월 수입-지출</p>
      </div>
      <div class="metric-card__value-line">
        <strong class="metric-card__amount">
          <span class="metric-card__amount-value">{{ formatWonAmount(props.monthNet) }}</span>
          <span class="metric-card__amount-unit">원</span>
        </strong>
        <small
          class="metric-card__delta"
          :data-trend="deltaTrend(props.monthNet, props.previousMonthNet)"
        >
          {{ formatDelta(props.monthNet, props.previousMonthNet) }}
        </small>
      </div>
    </article>

    <article class="metric-card">
      <div class="metric-card__head metric-card__head--title">
        <p>{{ props.budgetReferenceMonth }}월 누적잔고</p>
      </div>
      <div class="metric-card__value-line metric-card__value-line--single">
        <strong class="metric-card__amount">
          <span class="metric-card__amount-value">{{ formatWonAmount(props.monthCumulativeBalance) }}</span>
          <span class="metric-card__amount-unit">원</span>
        </strong>
      </div>
    </article>
  </div>
</template>
