import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { format } from 'date-fns'
import { tr, enUS } from 'date-fns/locale'
import { CheckCircle, XCircle, Clock, RefreshCw, ChevronLeft, ChevronRight, Mail } from 'lucide-react'
import { useEmailLogs } from '@/api/email'

const STATUS_ICON_BG = {
  sent:    'bg-green-100 dark:bg-green-900/30',
  failed:  'bg-red-100 dark:bg-red-900/30',
  pending: 'bg-amber-100 dark:bg-amber-900/30',
}
const STATUS_ICON_CLS = {
  sent:    'text-green-600 dark:text-green-400',
  failed:  'text-red-600 dark:text-red-400',
  pending: 'text-amber-600 dark:text-amber-400',
}
const STATUS_BADGE_CLS = {
  sent:    'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  failed:  'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  pending: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
}
const STATUS_ICONS = { sent: CheckCircle, failed: XCircle, pending: Clock }

const LIMIT = 50

export default function EmailLogsPage() {
  const { t, i18n } = useTranslation()
  const locale = i18n.language === 'tr' ? tr : enUS
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined)
  const [skip, setSkip] = useState(0)

  const { data, isLoading, refetch, isFetching } = useEmailLogs({
    status: statusFilter,
    skip,
    limit: LIMIT,
  })

  const totalPages = data ? Math.ceil(data.total / LIMIT) : 0
  const currentPage = Math.floor(skip / LIMIT) + 1

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Mail className="h-5 w-5 text-gray-600 dark:text-gray-400" />
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('email.logs_title')}</h1>
          {data && (
            <span className="ml-2 text-sm text-gray-500 dark:text-gray-400">
              {t('email.total_records', { count: data.total })}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <select
            value={statusFilter ?? ''}
            onChange={(e) => { setStatusFilter(e.target.value || undefined); setSkip(0) }}
            className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="">{t('email.all_statuses')}</option>
            <option value="sent">{t('email.status_sent')}</option>
            <option value="failed">{t('email.status_failed')}</option>
            <option value="pending">{t('email.status_pending')}</option>
          </select>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="p-1.5 rounded-lg border border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Timeline feed */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
        {isLoading ? (
          <div className="px-4 py-8 text-center text-gray-400">{t('common.loading')}</div>
        ) : !data?.items.length ? (
          <div className="px-4 py-8 text-center text-gray-400">{t('email.no_logs')}</div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {data.items.map((log) => {
              const status = log.status as keyof typeof STATUS_ICONS
              const Icon = STATUS_ICONS[status] ?? Clock
              const iconBg  = STATUS_ICON_BG[status]  ?? 'bg-gray-100 dark:bg-gray-800'
              const iconCls = STATUS_ICON_CLS[status] ?? 'text-gray-500'
              const badgeCls = STATUS_BADGE_CLS[status] ?? 'bg-gray-100 text-gray-600'
              const statusLabel = t(`email.status_${status}` as Parameters<typeof t>[0])

              return (
                <div key={log.id} className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors">
                  {/* Status icon */}
                  <div className={`mt-0.5 flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center ${iconBg}`}>
                    <Icon className={`h-3.5 w-3.5 ${iconCls}`} />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-800 dark:text-gray-200 flex flex-wrap items-center gap-1.5">
                      <span className={`inline-flex px-1.5 py-0.5 rounded text-xs font-medium ${badgeCls}`}>{statusLabel}</span>
                      <span className="font-medium text-gray-700 dark:text-gray-300 truncate max-w-xs">{log.subject}</span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        → <span className="font-mono">{log.to_email}</span>
                      </span>
                    </p>
                    {log.error_message && (
                      <p className="text-xs text-red-500 dark:text-red-400 mt-0.5 truncate" title={log.error_message}>
                        {log.error_message}
                      </p>
                    )}
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                      {log.sent_at
                        ? format(new Date(log.sent_at), 'dd MMM yyyy HH:mm:ss', { locale })
                        : format(new Date(log.created_at), 'dd MMM yyyy HH:mm:ss', { locale })}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Pagination */}
        {data && data.total > LIMIT && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 dark:border-gray-800">
            <span className="text-sm text-gray-500 dark:text-gray-400">
              {t('audit.page_of', { current: currentPage, total: totalPages })}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setSkip(Math.max(0, skip - LIMIT))}
                disabled={skip === 0}
                className="p-1.5 rounded-lg border border-gray-300 dark:border-gray-700 disabled:opacity-40 hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                onClick={() => setSkip(skip + LIMIT)}
                disabled={skip + LIMIT >= data.total}
                className="p-1.5 rounded-lg border border-gray-300 dark:border-gray-700 disabled:opacity-40 hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
