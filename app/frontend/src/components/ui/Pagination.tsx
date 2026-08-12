import { useTranslation } from 'react-i18next'

interface PaginationProps {
  page: number
  limit: number
  total: number
  onPageChange: (page: number) => void
}

export function Pagination({ page, limit, total, onPageChange }: PaginationProps) {
  const { t } = useTranslation()
  if (total <= limit) return null
  const totalPages = Math.ceil(total / limit)
  return (
    <div className="flex items-center justify-between">
      <p className="text-sm text-gray-500 dark:text-gray-400">
        {page * limit + 1}–{Math.min((page + 1) * limit, total)} / {total}
      </p>
      <div className="flex gap-2">
        <button
          onClick={() => onPageChange(Math.max(0, page - 1))}
          disabled={page === 0}
          className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-700 text-sm text-gray-600 dark:text-gray-300 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:hover:bg-transparent dark:disabled:hover:bg-transparent"
        >
          ← {t('common.previous')}
        </button>
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages - 1}
          className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-700 text-sm text-gray-600 dark:text-gray-300 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:hover:bg-transparent dark:disabled:hover:bg-transparent"
        >
          {t('common.next')} →
        </button>
      </div>
    </div>
  )
}
