export type ReadingStatus = 'finished' | 'reading' | 'paused'

export interface BookEntry {
  id: number
  createdAt: string
  title: string
  author?: string
  genre: string
  startedAt: string
  finishedAt?: string
  rating?: number
  memo: string
  status: ReadingStatus
}
