import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { format } from 'date-fns'
import { tr, enUS } from 'date-fns/locale'
import { CheckCircle, XCircle, Clock, RefreshCw } from 'lucide-react'
import { useEmailLogs } from '@/api/email'

const STATUS_ICONS = {
  sent: CheckCircle,
  failed: XCircle,
  pending: Clock,
}
const STATUS_COLORS = {
  sent: 'text-green-600 dark:text-green-400',
  failed: 'text-red-600 dark:text-red-400',
  pending: 'text-amber-600 dark:text-amber-400',
}

export default function EmailLogsPage() {
  const { t, i18n } = useTranslation()
  const locale = i18n.language === 'tr' ? tr : enUS
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined)
  const [page, setPage] = useState(0)
  const limit = 50

  const { data, isLoading, refetch, isFetching } = useEmailLogs({
    status: statusFilter,
    skip: page * limit,
    limit,
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('email.logs_title')}</h1>
        <div className="flex items-center gap-3">
          <select
            value={statusFilter ?? ''}
            onChange={(e) => { setStatusFilter(e.target.value || undefined); setPage(0) }}
            className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="">{t('email.all_statuses')}</option>
            <option value="sent">{t('email.status_sent')}</option>
            <option value="failed">{t('email.status_failed')}</option>
            <option value="pending">{t('email.status_pending')}</option>
          </select>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="p-2 rounded-lg border border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {data && (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {t('email.total_records', { count: data.total })}
        </p>
      )}

      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
              <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">{t('common.status')}</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">{t('email.recipient')}</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">{t('email.subject_label')}</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">{t('email.sent_at')}</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={4} className="text-center py-8 text-gray-400">{t('common.loading')}</td></tr>
            ) : data?.items.length === 0 ? (
              <tr><td colSpan={4} className="text-center py-8 text-gray-400">{t('email.no_logs')}</td></tr>
            ) : data?.items.map((log) => {
              const status = log.status as keyof typeof STATUS_ICONS
              const Icon = STATUS_ICONS[status] ?? Clock
              const cls = STATUS_COLORS[status] ?? STATUS_COLORS.pending
              const statusLabel = t(`email.status_${status}` as any)
              return (
                <tr key={log.id} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/30">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <Icon className={`h-4 w-4 ${cls}`} />
                      <span className={`text-xs font-medium ${cls}`}>{statusLabel}</span>
                    </div>
                    {log.error_message && (
                      <p className="text-xs text-red-500 mt-0.5 max-w-xs truncate" title={log.error_message}>
                        {log.error_message}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{log.to_email}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400 max-w-sm truncate">{log.subject}</td>
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400 whitespace-nowrap">
                    {log.sent_at
                      ? format(new Date(log.sent_at), 'dd MMM yyyy HH:mm', { locale })
                      : format(new Date(log.created_at), 'dd MMM yyyy HH:mm', { locale })}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {data && data.total > limit && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {page * limit + 1}–{Math.min((page + 1) * limit, data.total)} / {data.total}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-700 text-sm text-gray-600 dark:text-gray-300 disabled:opacity-40"
            >
              ← {t('common.previous')}
            </button>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={(page + 1) * limit >= data.total}
              className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-700 text-sm text-gray-600 dark:text-gray-300 disabled:opacity-40"
            >
              {t('common.next')} →
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
