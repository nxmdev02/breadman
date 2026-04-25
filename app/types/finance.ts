export type BudgetKind = 'expense' | 'income'

export interface BudgetEntry {
  id: number
  title: string
  category: string
  amount: number
  spentAt: string
  paymentMethod?: string
  memo?: string
  kind: BudgetKind
}
