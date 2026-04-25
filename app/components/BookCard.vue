<script setup lang="ts">
import type { BookEntry } from '~/types/book'

const props = defineProps<{
  book: BookEntry
}>()

const emit = defineEmits<{
  edit: [id: number]
  statusChange: [payload: { id: number; status: BookEntry['status'] }]
}>()

const statusText: Record<BookEntry['status'], string> = {
  finished: '완독',
  reading: '읽는 중',
  paused: '잠시 멈춤'
}
</script>

<template>
  <article class="book-card">
    <header class="book-card__header">
      <p class="book-card__genre">{{ props.book.genre }}</p>
      <div class="book-card__actions">
        <span class="book-card__status" :data-status="props.book.status">
          {{ statusText[props.book.status] }}
        </span>
        <button class="book-card__edit" type="button" @click="emit('edit', props.book.id)">
          수정
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
        <dd>{{ props.book.rating ? `${props.book.rating}/5` : '-' }}</dd>
      </div>
    </dl>

    <p class="book-card__memo">{{ props.book.memo }}</p>

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
