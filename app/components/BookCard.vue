<script setup lang="ts">
import { Pencil, Trash2 } from 'lucide-vue-next'
import type { BookEntry } from '~/types/book'

const props = defineProps<{
  book: BookEntry
}>()

const emit = defineEmits<{
  edit: [id: number]
  delete: [id: number]
  statusChange: [payload: { id: number; status: BookEntry['status'] }]
}>()

const statusText: Record<BookEntry['status'], string> = {
  finished: '완독',
  reading: '읽는 중',
  paused: '잠시 멈춤'
}

const ratingStars = computed(() => {
  if (!props.book.rating) return '-'
  return `${'★'.repeat(props.book.rating)}${'☆'.repeat(5 - props.book.rating)}`
})
</script>

<template>
  <article class="book-card">
    <header class="book-card__header">
      <div class="book-card__main">
        <div class="book-card__eyebrow">
          <span class="book-card__status" :data-status="props.book.status">
            {{ statusText[props.book.status] }}
          </span>
          <p class="book-card__genre">{{ props.book.genre }}</p>
        </div>
      </div>
      <div class="book-card__actions">
        <button class="book-card__edit" type="button" aria-label="독서 기록 수정" @click="emit('edit', props.book.id)">
          <Pencil class="action-icon" aria-hidden="true" />
        </button>
        <button class="book-card__delete" type="button" aria-label="독서 기록 삭제" @click="emit('delete', props.book.id)">
          <Trash2 class="action-icon" aria-hidden="true" />
        </button>
      </div>
    </header>
    <h3 class="book-card__title">{{ props.book.title }}</h3>
    <p v-if="props.book.author" class="book-card__author">{{ props.book.author }}</p>

    <dl class="book-card__meta">
      <div>
        <dt>시작</dt>
        <dd>{{ props.book.startedAt }}</dd>
      </div>
      <div>
        <dt>완료</dt>
        <dd>{{ props.book.finishedAt ?? '-' }}</dd>
      </div>
      <div>
        <dt>평점</dt>
        <dd class="rating-stars">{{ ratingStars }}</dd>
      </div>
    </dl>

    <p v-if="props.book.memo" class="book-card__memo">{{ props.book.memo }}</p>

    <label class="book-card__status-field">
      <span>상태</span>
      <select
        :value="props.book.status"
        @change="emit('statusChange', { id: props.book.id, status: ($event.target as HTMLSelectElement).value as BookEntry['status'] })"
      >
        <option value="finished">완독</option>
        <option value="reading">읽는 중</option>
        <option value="paused">잠시 멈춤</option>
      </select>
    </label>
  </article>
</template>
