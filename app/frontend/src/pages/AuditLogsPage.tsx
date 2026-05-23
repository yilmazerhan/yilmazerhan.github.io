import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { format, parseISO } from 'date-fns'
import { tr, enUS } from 'date-fns/locale'
import { Shield, ChevronLeft, ChevronRight } from 'lucide-react'
import { useAuditLogs } from '@/api/admin'

const ACTION_COLORS: Record<string, string> = {
  create: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  update: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  delete: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
}

const LIMIT = 50

export default function AuditLogsPage() {
  const { t, i18n } = useTranslation()
  const locale = i18n.language === 'tr' ? tr : enUS
  const [skip, setSkip] = useState(0)
  const [actionFilter, setActionFilter] = useState('')
  const [tableFilter, setTableFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const { data, isLoading } = useAuditLogs({
    action: actionFilter || undefined,
    table_name: tableFilter || undefined,
    date_from: dateFrom || undefined,
    date_to: dateTo || undefined,
    skip,
    limit: LIMIT,
  })

  const totalPages = data ? Math.ceil(data.total / LIMIT) : 0
  const currentPage = Math.floor(skip / LIMIT) + 1

  function handleFilterChange() {
    setSkip(0)
  }

  const ACTION_LABELS: Record<string, string> = {
    create: t('audit.action_create'),
    update: t('audit.action_update'),
    delete: t('audit.action_delete'),
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <Shield className="h-5 w-5 text-gray-600 dark:text-gray-400" />
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('nav.auditLogs')}</h1>
        {data && (
          <span className="ml-2 text-sm text-gray-500 dark:text-gray-400">
            {t('audit.record_count', { count: data.total })}
          </span>
        )}
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t('audit.action_type')}</label>
            <select
              value={actionFilter}
              onChange={(e) => { setActionFilter(e.target.value); handleFilterChange() }}
              className="w-full px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="">{t('common.all')}</option>
              <option value="create">{t('audit.action_create')}</option>
              <option value="update">{t('audit.action_update')}</option>
              <option value="delete">{t('audit.action_delete')}</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t('audit.table')}</label>
            <input
              type="text"
              value={tableFilter}
              onChange={(e) => { setTableFilter(e.target.value); handleFilterChange() }}
              placeholder={t('audit.table_placeholder')}
              className="w-full px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t('worklog.date_from')}</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => { setDateFrom(e.target.value); handleFilterChange() }}
              className="w-full px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t('worklog.date_to')}</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => { setDateTo(e.target.value); handleFilterChange() }}
              className="w-full px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
                <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">{t('worklog.date')}</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">{t('audit.action_label')}</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">{t('audit.table')}</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">{t('audit.record_id')}</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">{t('audit.user_id')}</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">{t('audit.ip')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-400">{t('common.loading')}</td>
                </tr>
              ) : !data?.items.length ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-400">{t('audit.no_records')}</td>
                </tr>
              ) : (
                data.items.map((log) => {
                  const color = ACTION_COLORS[log.action] ?? 'bg-gray-100 text-gray-600'
                  const label = ACTION_LABELS[log.action] ?? log.action
                  return (
                    <tr key={log.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/40">
                      <td className="px-4 py-2.5 whitespace-nowrap text-gray-600 dark:text-gray-400">
                        {format(parseISO(log.created_at), 'dd MMM yyyy HH:mm:ss', { locale })}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${color}`}>
                          {label}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs text-gray-700 dark:text-gray-300">
                        {log.table_name}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs text-gray-500 dark:text-gray-400 max-w-[140px] truncate">
                        {log.record_id || '—'}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs text-gray-500 dark:text-gray-400 max-w-[140px] truncate">
                        {log.user_id || '—'}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-gray-500 dark:text-gray-400">
                        {log.ip_address || '—'}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

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
