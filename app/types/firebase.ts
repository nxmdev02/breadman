import type { BookEntry } from '~/types/book'
import type { BudgetEntry } from '~/types/finance'

export type SyncPhase = 'idle' | 'loading' | 'saving' | 'deleting' | 'refreshing' | 'error'

export interface FinanceSummary {
  currentBalance: number
  updatedAt?: string
}

export interface ReadingSnapshot {
  items: BookEntry[]
  updatedAt?: string
}

export interface BudgetSnapshot {
  items: BudgetEntry[]
  updatedAt?: string
}

export interface ArchiveSnapshot {
  reading: ReadingSnapshot
  budget: BudgetSnapshot
  finance: FinanceSummary
  updatedAt?: string
}
