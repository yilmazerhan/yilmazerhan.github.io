import { useState } from 'react'
import { format } from 'date-fns'
import { tr } from 'date-fns/locale'
import { CheckCircle, XCircle, Clock, RefreshCw } from 'lucide-react'
import { useEmailLogs } from '@/api/email'

const STATUS_CONFIG = {
  sent: { icon: CheckCircle, cls: 'text-green-600 dark:text-green-400', label: 'Gönderildi' },
  failed: { icon: XCircle, cls: 'text-red-600 dark:text-red-400', label: 'Hata' },
  pending: { icon: Clock, cls: 'text-amber-600 dark:text-amber-400', label: 'Bekliyor' },
}

export default function EmailLogsPage() {
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
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">E-posta Kayıtları</h1>
        <div className="flex items-center gap-3">
          <select
            value={statusFilter ?? ''}
            onChange={(e) => { setStatusFilter(e.target.value || undefined); setPage(0) }}
            className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="">Tüm Durumlar</option>
            <option value="sent">Gönderildi</option>
            <option value="failed">Hata</option>
            <option value="pending">Bekliyor</option>
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
          Toplam {data.total} kayıt
        </p>
      )}

      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
              <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Durum</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Alıcı</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Konu</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Gönderim Zamanı</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={4} className="text-center py-8 text-gray-400">Yükleniyor...</td></tr>
            ) : data?.items.length === 0 ? (
              <tr><td colSpan={4} className="text-center py-8 text-gray-400">Kayıt bulunamadı.</td></tr>
            ) : data?.items.map((log) => {
              const cfg = STATUS_CONFIG[log.status] ?? STATUS_CONFIG.pending
              const Icon = cfg.icon
              return (
                <tr key={log.id} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/30">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <Icon className={`h-4 w-4 ${cfg.cls}`} />
                      <span className={`text-xs font-medium ${cfg.cls}`}>{cfg.label}</span>
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
                      ? format(new Date(log.sent_at), 'dd MMM yyyy HH:mm', { locale: tr })
                      : format(new Date(log.created_at), 'dd MMM yyyy HH:mm', { locale: tr })}
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
              ← Önceki
            </button>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={(page + 1) * limit >= data.total}
              className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-700 text-sm text-gray-600 dark:text-gray-300 disabled:opacity-40"
            >
              Sonraki →
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
