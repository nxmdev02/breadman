<script setup lang="ts">
import type { BudgetEntry } from '~/types/finance'

const props = defineProps<{
  entry: BudgetEntry
}>()

const emit = defineEmits<{
  edit: [id: number]
}>()

const currency = new Intl.NumberFormat('ko-KR')
</script>

<template>
  <article class="budget-card" :data-kind="props.entry.kind">
    <header class="budget-card__header">
      <div>
        <p class="budget-card__category">{{ props.entry.category }}</p>
        <h3 class="budget-card__title">{{ props.entry.title }}</h3>
      </div>
      <div class="budget-card__side">
        <span class="budget-card__kind" :data-kind="props.entry.kind">
          {{ props.entry.kind === 'expense' ? '지출' : '수입' }}
        </span>
        <button class="book-card__edit" type="button" @click="emit('edit', props.entry.id)">
          수정
        </button>
      </div>
    </header>

    <p class="budget-card__amount" :data-kind="props.entry.kind">
      {{ props.entry.kind === 'expense' ? '-' : '+' }}{{ currency.format(props.entry.amount) }}원
    </p>

    <dl class="book-card__meta">
      <div>
        <dt>날짜</dt>
        <dd>{{ props.entry.spentAt }}</dd>
      </div>
      <div>
        <dt>수단</dt>
        <dd>{{ props.entry.paymentMethod ?? '-' }}</dd>
      </div>
    </dl>

    <p v-if="props.entry.memo" class="book-card__memo">{{ props.entry.memo }}</p>
  </article>
</template>
