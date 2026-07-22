import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { format, parseISO } from 'date-fns'
import { tr, enUS } from 'date-fns/locale'
import { Shield, ChevronLeft, ChevronRight, Plus, Pencil, Trash2, LogIn, LogOut, ChevronDown, ChevronUp, Copy } from 'lucide-react'
import { useAuditLogs, type AuditLog } from '@/api/admin'
import DatePicker from '@/components/ui/DatePicker'

const ACTION_COLORS: Record<string, string> = {
  create: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  update: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  delete: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  login:  'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  logout: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
}

const ACTION_ICON_BG: Record<string, string> = {
  create: 'bg-green-100 dark:bg-green-900/30',
  update: 'bg-blue-100 dark:bg-blue-900/30',
  delete: 'bg-red-100 dark:bg-red-900/30',
  login:  'bg-purple-100 dark:bg-purple-900/30',
  logout: 'bg-gray-100 dark:bg-gray-800',
}

const ACTION_ICON_CLS: Record<string, string> = {
  create: 'text-green-600 dark:text-green-400',
  update: 'text-blue-600 dark:text-blue-400',
  delete: 'text-red-600 dark:text-red-400',
  login:  'text-purple-600 dark:text-purple-400',
  logout: 'text-gray-500 dark:text-gray-400',
}

const ACTION_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  create: Plus,
  update: Pencil,
  delete: Trash2,
  login:  LogIn,
  logout: LogOut,
}

const LIMIT = 50

/* ── JSON diff panel ─────────────────────────────────────────────────────── */

function JsonDiff({ oldData, newData, action }: {
  oldData: Record<string, unknown> | null
  newData: Record<string, unknown> | null
  action: string
}) {
  const { t } = useTranslation()
  const serialize = (v: unknown) => {
    if (v === null || v === undefined) return '—'
    if (typeof v === 'object') return JSON.stringify(v)
    return String(v)
  }

  if (action === 'create' && newData) {
    return (
      <table className="w-full text-xs border-collapse">
        <tbody>
          {Object.entries(newData).map(([k, v]) => (
            <tr key={k} className="border-b border-gray-100 dark:border-gray-700 last:border-0">
              <td className="py-0.5 pr-3 font-mono text-gray-500 dark:text-gray-400 w-36 align-top whitespace-nowrap">{k}</td>
              <td className="py-0.5 font-mono text-green-700 dark:text-green-400 break-all">{serialize(v)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    )
  }

  if (action === 'delete' && oldData) {
    return (
      <table className="w-full text-xs border-collapse">
        <tbody>
          {Object.entries(oldData).map(([k, v]) => (
            <tr key={k} className="border-b border-gray-100 dark:border-gray-700 last:border-0">
              <td className="py-0.5 pr-3 font-mono text-gray-500 dark:text-gray-400 w-36 align-top whitespace-nowrap">{k}</td>
              <td className="py-0.5 font-mono text-red-600 dark:text-red-400 break-all line-through">{serialize(v)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    )
  }

  const allKeys = Array.from(new Set([
    ...Object.keys(oldData ?? {}),
    ...Object.keys(newData ?? {}),
  ])).sort()

  const changedKeys = allKeys.filter(
    k => serialize((oldData ?? {})[k]) !== serialize((newData ?? {})[k])
  )

  if (changedKeys.length === 0) {
    return <span className="text-xs text-gray-400">{t('audit.no_changed_fields')}</span>
  }

  return (
    <table className="w-full text-xs border-collapse">
      <thead>
        <tr className="text-gray-400 dark:text-gray-500 border-b border-gray-200 dark:border-gray-700">
          <th className="text-left pb-1 pr-3 font-medium w-36">{t('audit.field')}</th>
          <th className="text-left pb-1 pr-3 font-medium">{t('audit.before')}</th>
          <th className="text-left pb-1 font-medium">{t('audit.after')}</th>
        </tr>
      </thead>
      <tbody>
        {changedKeys.map(k => (
          <tr key={k} className="border-b border-gray-100 dark:border-gray-700 last:border-0">
            <td className="py-0.5 pr-3 font-mono text-gray-500 dark:text-gray-400 align-top whitespace-nowrap">{k}</td>
            <td className="py-0.5 pr-3 font-mono text-red-600 dark:text-red-400 break-all align-top">
              {serialize((oldData ?? {})[k])}
            </td>
            <td className="py-0.5 font-mono text-green-700 dark:text-green-400 break-all align-top">
              {serialize((newData ?? {})[k])}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function DetailPanel({ log }: { log: AuditLog }) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  const hasData = !!(log.old_data || log.new_data)

  function copyId() {
    navigator.clipboard.writeText(log.record_id).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <div className="ml-10 mr-4 mb-3 space-y-2.5">
      {/* Full record ID */}
      {log.record_id && (
        <div className="flex items-center gap-2 flex-wrap text-xs">
          <span className="text-gray-400 dark:text-gray-500 flex-shrink-0">{t('audit.record_id')}</span>
          <code className="font-mono text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">
            {log.record_id}
          </code>
          <button
            onClick={copyId}
            className="flex-shrink-0 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
            title={t('audit.copy')}
          >
            <Copy className="h-3 w-3" />
          </button>
          {copied && <span className="text-green-600 dark:text-green-400 text-xs">{t('audit.copied')}</span>}
        </div>
      )}

      {/* User agent */}
      {log.user_agent && (
        <div className="text-xs text-gray-500 dark:text-gray-400">
          <span className="text-gray-400 dark:text-gray-500">User-Agent: </span>
          <span className="font-mono break-all">{log.user_agent}</span>
        </div>
      )}

      {/* Data diff */}
      {hasData && (
        <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
          <div className="px-3 py-1.5 bg-gray-50 dark:bg-gray-800/60 text-gray-500 dark:text-gray-400 font-medium text-xs border-b border-gray-200 dark:border-gray-700">
            {log.action === 'create'
              ? t('audit.created_data')
              : log.action === 'delete'
              ? t('audit.deleted_data')
              : t('audit.changes')}
          </div>
          <div className="px-3 py-2.5 overflow-x-auto">
            <JsonDiff oldData={log.old_data} newData={log.new_data} action={log.action} />
          </div>
        </div>
      )}
    </div>
  )
}

/* ── Main page ───────────────────────────────────────────────────────────── */

export default function AuditLogsPage() {
  const { t, i18n } = useTranslation()
  const locale = i18n.language === 'tr' ? tr : enUS
  const [skip, setSkip] = useState(0)
  const [actionFilter, setActionFilter] = useState('')
  const [tableFilter, setTableFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)

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
    login:  t('audit.action_login'),
    logout: t('audit.action_logout'),
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
              <option value="login">{t('audit.action_login')}</option>
              <option value="logout">{t('audit.action_logout')}</option>
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
            <DatePicker
              value={dateFrom}
              onChange={(v) => { setDateFrom(v); handleFilterChange() }}
              className="w-full px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t('worklog.date_to')}</label>
            <DatePicker
              value={dateTo}
              onChange={(v) => { setDateTo(v); handleFilterChange() }}
              className="w-full px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
        </div>
      </div>

      {/* Timeline feed */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
        {isLoading ? (
          <div className="px-4 py-8 text-center text-gray-400">{t('common.loading')}</div>
        ) : !data?.items.length ? (
          <div className="px-4 py-8 text-center text-gray-400">{t('audit.no_records')}</div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {data.items.map((log) => {
              const iconBg   = ACTION_ICON_BG[log.action]  ?? 'bg-gray-100 dark:bg-gray-800'
              const iconCls  = ACTION_ICON_CLS[log.action] ?? 'text-gray-500'
              const badgeCls = ACTION_COLORS[log.action]   ?? 'bg-gray-100 text-gray-600'
              const label    = ACTION_LABELS[log.action]   ?? log.action
              const Icon     = ACTION_ICONS[log.action]    ?? Shield
              const isExpanded = expandedId === log.id
              const hasDetail = !!(log.record_id || log.user_agent || log.old_data || log.new_data)

              return (
                <div key={log.id}>
                  {/* Summary row — click to expand */}
                  <div
                    className={`flex items-start gap-3 px-4 py-3 transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/40 ${hasDetail ? 'cursor-pointer' : ''}`}
                    onClick={() => hasDetail && setExpandedId(isExpanded ? null : log.id)}
                  >
                    <div className={`mt-0.5 flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center ${iconBg}`}>
                      <Icon className={`h-3.5 w-3.5 ${iconCls}`} />
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-800 dark:text-gray-200 flex flex-wrap items-center gap-1.5">
                        <span className={`inline-flex px-1.5 py-0.5 rounded text-xs font-medium ${badgeCls}`}>{label}</span>
                        <code className="text-xs bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded text-gray-600 dark:text-gray-400 font-mono">{log.table_name}</code>
                        {log.username && (
                          <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                            {t('audit.by_user', { name: log.username })}
                          </span>
                        )}
                        {(log.old_data || log.new_data) && (
                          <span className="text-xs text-primary-500 dark:text-primary-400">· {t('audit.detail_available')}</span>
                        )}
                      </p>
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 flex flex-wrap items-center gap-2">
                        <span>{format(parseISO(log.created_at), 'dd MMM yyyy HH:mm:ss', { locale })}</span>
                        {log.ip_address && <span>· {log.ip_address}</span>}
                        {log.record_id && (
                          <span className="font-mono">· {log.record_id.slice(0, 8)}…</span>
                        )}
                      </p>
                    </div>

                    {hasDetail && (
                      <div className="flex-shrink-0 text-gray-400 dark:text-gray-500 mt-1.5">
                        {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                      </div>
                    )}
                  </div>

                  {/* Expandable detail panel */}
                  {isExpanded && <DetailPanel log={log} />}
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
