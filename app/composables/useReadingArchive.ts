import type { BookEntry } from '~/types/book'

export const useReadingArchive = () => {
  const readingHistory = useState<BookEntry[]>('reading-history', () => [])

  const saveBook = (book: Omit<BookEntry, 'id'> & { id?: number }) => {
    const existingEntry = typeof book.id === 'number'
      ? readingHistory.value.find((entry) => entry.id === book.id)
      : null

    const normalizedBook: BookEntry = {
      ...book,
      id: book.id ?? Date.now(),
      createdAt: existingEntry?.createdAt ?? book.createdAt ?? new Date().toISOString()
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

  const deleteBook = (id: number) => {
    readingHistory.value = readingHistory.value.filter((book) => book.id !== id)
  }

  return {
    readingHistory,
    saveBook,
    updateStatus,
    deleteBook
  }
}
