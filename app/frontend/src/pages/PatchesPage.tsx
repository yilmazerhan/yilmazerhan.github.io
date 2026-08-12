import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { format } from 'date-fns'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { usePatches, useDeletePatch, type CustomerPatch } from '@/api/patches'
import { useAuthStore } from '@/store/authStore'
import PatchModal from '@/components/patches/PatchModal'
import { JiraTicketLink } from '@/components/JiraTicketLink'
import { Pagination } from '@/components/ui/Pagination'
import DatePicker from '@/components/ui/DatePicker'

const LIMIT = 50

const STATUS_OPTIONS = ['planned', 'applied', 'failed', 'rolled_back'] as const
const ENV_OPTIONS = ['production', 'staging', 'test', 'dev'] as const

function statusBadgeClass(status: string): string {
  switch (status) {
    case 'planned':
      return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400'
    case 'applied':
      return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
    case 'failed':
      return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
    case 'rolled_back':
      return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400'
    default:
      return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400'
  }
}

function canModifyPatch(patch: CustomerPatch, userId: string, role: string): boolean {
  if (role === 'superadmin' || role === 'team_manager') return true
  return patch.created_by === userId
}

export default function PatchesPage() {
  const { t } = useTranslation()
  const user = useAuthStore((s) => s.user)

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [envFilter, setEnvFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [editPatch, setEditPatch] = useState<CustomerPatch | null>(null)
  const [page, setPage] = useState(0)

  const { data, isLoading } = usePatches({
    search: search || undefined,
    status: statusFilter || undefined,
    environment: envFilter || undefined,
    date_from: dateFrom || undefined,
    date_to: dateTo || undefined,
    skip: page * LIMIT,
    limit: LIMIT,
  })

  function resetPage() { setPage(0) }

  const deletePatch = useDeletePatch()

  async function handleDelete(patch: CustomerPatch) {
    if (!confirm(t('patches.confirm_delete'))) return
    try {
      await deletePatch.mutateAsync(patch.id)
    } catch (err: any) {
      alert(err.response?.data?.detail || t('common.error'))
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('patches.title')}</h1>
        <button
          onClick={() => setCreateOpen(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-lg text-sm font-medium"
        >
          <Plus className="h-4 w-4" />
          {t('patches.add')}
        </button>
      </div>

      <div className="flex gap-3 flex-wrap items-end">
        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">{t('common.search')}</label>
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); resetPage() }}
            placeholder={t('patches.search_placeholder')}
            className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 w-64"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">{t('patches.status')}</label>
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); resetPage() }}
            className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="">{t('patches.filter_all_status')}</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>{t(`patches.status_${s}`)}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">{t('patches.environment')}</label>
          <select
            value={envFilter}
            onChange={(e) => { setEnvFilter(e.target.value); resetPage() }}
            className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="">{t('patches.filter_all_env')}</option>
            {ENV_OPTIONS.map((e) => (
              <option key={e} value={e}>{t(`patches.env_${e}`)}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">{t('patches.date_from')}</label>
          <DatePicker
            value={dateFrom}
            onChange={(v) => { setDateFrom(v); resetPage() }}
            className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">{t('patches.date_to')}</label>
          <DatePicker
            value={dateTo}
            onChange={(v) => { setDateTo(v); resetPage() }}
            className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
        {data && (
          <div className="flex items-end">
            <span className="text-sm text-gray-500 dark:text-gray-400 pb-2">
              {t('patches.record_count', { count: data.total })}
            </span>
          </div>
        )}
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[1000px]">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
                <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">{t('patches.apply_date')}</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">{t('patches.customers')}</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">{t('patches.patch_files')}</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">{t('patches.jira_ticket')}</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">{t('patches.app_version')}</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">{t('patches.environment')}</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">{t('patches.status')}</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">{t('patches.description')}</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">{t('patches.created_by')}</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600 dark:text-gray-400">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={10} className="text-center py-8 text-gray-400">{t('common.loading')}</td>
                </tr>
              ) : data?.items.length === 0 ? (
                <tr>
                  <td colSpan={10} className="text-center py-8 text-gray-400">{t('patches.no_records')}</td>
                </tr>
              ) : data?.items.map((patch) => {
                const canModify = canModifyPatch(patch, user?.id || '', user?.role || '')
                const files = patch.patch_files ?? []

                return (
                  <tr key={patch.id} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/30">
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400 whitespace-nowrap">
                      {format(new Date(patch.apply_date + 'T12:00:00'), 'dd MMM yyyy')}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {(patch.customers ?? []).map((c) => (
                          <span key={c} className="px-1.5 py-0.5 rounded text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
                            {c}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 max-w-[220px]">
                      {files.length === 0 ? (
                        <span className="text-gray-300 dark:text-gray-700">—</span>
                      ) : (
                        <div className="space-y-1">
                          {files.map((f, i) => (
                            <div key={i} className="flex flex-col gap-0.5">
                              {f.patch_name && (
                                <span className="text-xs text-gray-700 dark:text-gray-300 truncate" title={f.patch_name}>
                                  {f.patch_name}
                                </span>
                              )}
                              {f.md5sum && (
                                <code className="text-xs font-mono text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded w-fit" title={f.md5sum}>
                                  {f.md5sum.length > 12 ? `${f.md5sum.slice(0, 12)}…` : f.md5sum}
                                </code>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <JiraTicketLink ticket={patch.jira_ticket} />
                    </td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300 font-mono text-xs">
                      {patch.app_version}
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                      {patch.environment || <span className="text-gray-300 dark:text-gray-700">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${statusBadgeClass(patch.status)}`}>
                        {t(`patches.status_${patch.status}`)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400 max-w-xs truncate" title={patch.description || ''}>
                      {patch.description || <span className="text-gray-300 dark:text-gray-700">—</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                      {patch.created_by_user?.full_name || <span className="text-gray-300 dark:text-gray-700">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {canModify && (
                          <>
                            <button
                              onClick={() => setEditPatch(patch)}
                              className="p-1.5 rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                              title={t('common.edit')}
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => handleDelete(patch)}
                              className="p-1.5 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                              title={t('common.delete')}
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {data && <Pagination page={page} limit={LIMIT} total={data.total} onPageChange={setPage} />}

      {createOpen && <PatchModal onClose={() => setCreateOpen(false)} />}
      {editPatch && <PatchModal patch={editPatch} onClose={() => setEditPatch(null)} />}
    </div>
  )
}
