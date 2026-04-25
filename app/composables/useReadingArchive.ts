import type { BookEntry } from '~/types/book'

const STORAGE_KEY = 'reading-archive-items'

const defaultReadingHistory: BookEntry[] = [
  {
    id: 1,
    title: '파친코',
    author: '이민진',
    genre: '소설',
    startedAt: '2026-01-06',
    finishedAt: '2026-01-20',
    rating: 5,
    memo: '세대와 선택의 무게를 정교하게 따라가는 서사.',
    status: 'finished'
  },
  {
    id: 2,
    title: '사피엔스',
    author: '유발 하라리',
    genre: '인문',
    startedAt: '2026-02-05',
    finishedAt: '2026-02-19',
    rating: 4,
    memo: '인류사를 큰 축으로 바라볼 때의 통찰이 좋았음.',
    status: 'finished'
  },
  {
    id: 3,
    title: '도둑맞은 집중력',
    author: '요한 하리',
    genre: '자기계발',
    startedAt: '2026-03-02',
    memo: '집중력이 환경과 구조에 의해 얼마나 좌우되는지 정리 중.',
    status: 'reading'
  },
  {
    id: 4,
    title: '데미안',
    author: '헤르만 헤세',
    genre: '고전',
    startedAt: '2025-11-11',
    finishedAt: '2025-11-25',
    rating: 4,
    memo: '불안과 성장의 균형을 다시 생각하게 된 작품.',
    status: 'finished'
  },
  {
    id: 5,
    title: '원씽',
    author: '게리 켈러',
    genre: '생산성',
    startedAt: '2026-03-18',
    memo: '핵심 하나를 선택하는 연습 중. 5장까지 읽음.',
    status: 'paused'
  },
  {
    id: 6,
    title: '스토너',
    author: '존 윌리엄스',
    genre: '소설',
    startedAt: '2026-04-03',
    finishedAt: '2026-04-15',
    rating: 5,
    memo: '담담한 문장 안에 감정이 깊게 쌓이는 느낌.',
    status: 'finished'
  }
]

export const useReadingArchive = () => {
  const readingHistory = useState<BookEntry[]>('reading-history', () => defaultReadingHistory)

  const persist = () => {
    if (!import.meta.client) return
    localStorage.setItem(STORAGE_KEY, JSON.stringify(readingHistory.value))
  }

  const hydrate = () => {
    if (!import.meta.client) return

    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return

    try {
      const parsed = JSON.parse(stored) as BookEntry[]
      if (Array.isArray(parsed) && parsed.length) {
        readingHistory.value = parsed
      }
    } catch {
      readingHistory.value = defaultReadingHistory
    }
  }

  const saveBook = (book: Omit<BookEntry, 'id'> & { id?: number }) => {
    const normalizedBook: BookEntry = {
      ...book,
      id: book.id ?? Date.now()
    }

    const existingIndex = readingHistory.value.findIndex((entry) => entry.id === normalizedBook.id)

    if (existingIndex >= 0) {
      readingHistory.value[existingIndex] = normalizedBook
    } else {
      readingHistory.value.unshift(normalizedBook)
    }
  }

  const updateStatus = (id: number, status: BookEntry['status']) => {
    const target = readingHistory.value.find((book) => book.id === id)
    if (!target) return
    target.status = status
  }

  onMounted(() => {
    hydrate()
  })

  watch(
    readingHistory,
    () => {
      persist()
    },
    { deep: true }
  )

  return {
    readingHistory,
    saveBook,
    updateStatus
  }
}
