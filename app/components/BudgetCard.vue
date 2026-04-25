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
          <svg class="action-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M4 20l4.2-1 8.9-8.9a2 2 0 0 0 0-2.8l-.4-.4a2 2 0 0 0-2.8 0L5 15.8 4 20z"
              fill="none"
              stroke="currentColor"
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="1.8"
            />
            <path
              d="M13 7l4 4"
              fill="none"
              stroke="currentColor"
              stroke-linecap="round"
              stroke-width="1.8"
            />
          </svg>
        </button>
        <button class="book-card__delete" type="button" aria-label="가계부 항목 삭제" @click="emit('delete', props.entry.id)">
          <svg class="action-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M5 7h14"
              fill="none"
              stroke="currentColor"
              stroke-linecap="round"
              stroke-width="1.8"
            />
            <path
              d="M9 7V5.8c0-.9.7-1.8 1.7-1.8h2.6c1 0 1.7.9 1.7 1.8V7"
              fill="none"
              stroke="currentColor"
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="1.8"
            />
            <path
              d="M7.5 7l.8 11c.1 1 .9 2 2 2h3.4c1.1 0 1.9-1 2-2l.8-11"
              fill="none"
              stroke="currentColor"
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="1.8"
            />
            <path
              d="M10 11v5M14 11v5"
              fill="none"
              stroke="currentColor"
              stroke-linecap="round"
              stroke-width="1.8"
            />
          </svg>
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
