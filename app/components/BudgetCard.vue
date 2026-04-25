<script setup lang="ts">
import type { BudgetEntry } from '~/types/finance'

const props = defineProps<{
  entry: BudgetEntry
}>()

const emit = defineEmits<{
  edit: [id: number]
  delete: [id: number]
}>()

const currency = new Intl.NumberFormat('ko-KR')
</script>

<template>
  <article class="budget-card" :data-kind="props.entry.kind">
    <header class="budget-card__header">
      <div class="budget-card__main">
        <div class="budget-card__eyebrow">
          <span class="budget-card__kind" :data-kind="props.entry.kind">
            {{ props.entry.kind === 'expense' ? '지출' : '수입' }}
          </span>
          <p class="budget-card__category">{{ props.entry.category }}</p>
        </div>
        <h3 class="budget-card__title">{{ props.entry.title }}</h3>
      </div>
      <div class="book-card__actions">
        <button class="book-card__edit" type="button" aria-label="가계부 항목 수정" @click="emit('edit', props.entry.id)">
          <span class="action-icon action-icon--edit" aria-hidden="true" />
        </button>
        <button class="book-card__delete" type="button" aria-label="가계부 항목 삭제" @click="emit('delete', props.entry.id)">
          <span class="action-icon action-icon--delete" aria-hidden="true" />
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

    <div v-if="props.entry.memo" class="budget-card__memo">
      <span>메모</span>
      <p>{{ props.entry.memo }}</p>
    </div>
  </article>
</template>
