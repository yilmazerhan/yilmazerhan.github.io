import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { format, differenceInCalendarDays, parseISO } from 'date-fns'
import { CalendarDays, Plus, X, Trash2 } from 'lucide-react'
import { useLeaves, useCreateLeave, useUpdateLeave, useDeleteLeave, type LeaveRequest } from '@/api/leaves'
import { useAuthStore } from '@/store/authStore'
import { useUsers } from '@/api/users'

const STATUS_COLORS: Record<string, string> = {
  pending:   'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  approved:  'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  rejected:  'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  cancelled: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400',
}

function dayCount(start: string, end: string) {
  return differenceInCalendarDays(parseISO(end), parseISO(start)) + 1
}

interface NewLeaveForm {
  start_date: string
  end_date: string
  reason: string
}

export default function LeavePage() {
  const { t } = useTranslation()
  const user = useAuthStore((s) => s.user)
  const isManager = user?.role === 'superadmin' || user?.role === 'team_manager'

  const [filterUserId, setFilterUserId] = useState('')
  const [showCancelled, setShowCancelled] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<NewLeaveForm>({ start_date: '', end_date: '', reason: '' })
  const [formError, setFormError] = useState('')

  const params = {
    ...(isManager && filterUserId ? { user_id: filterUserId } : {}),
    ...(showCancelled ? {} : { status: 'approved' }),
  }
  const { data: leaves = [], isLoading } = useLeaves(params)
  const createLeave = useCreateLeave()
  const updateLeave = useUpdateLeave()
  const deleteLeave = useDeleteLeave()

  const { data: usersData } = useUsers(isManager ? { limit: 200 } : undefined)

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setFormError('')
    if (!form.start_date || !form.end_date) { setFormError(t('leave.date_required')); return }
    if (form.start_date > form.end_date) { setFormError(t('leave.date_range_invalid')); return }
    try {
      await createLeave.mutateAsync({
        start_date: form.start_date,
        end_date: form.end_date,
        reason: form.reason.trim() || undefined,
      })
      setShowForm(false)
      setForm({ start_date: '', end_date: '', reason: '' })
    } catch (err: any) {
      const detail = err.response?.data?.detail
      setFormError(Array.isArray(detail) ? detail.map((d: any) => d.msg).join(', ') : detail || t('common.error'))
    }
  }

  async function handleCancel(leave: LeaveRequest) {
    if (!confirm(t('leave.cancel_confirm'))) return
    await updateLeave.mutateAsync({ id: leave.id, status: 'cancelled' })
  }

  async function handleDelete(id: string) {
    if (!confirm(t('leave.delete_confirm'))) return
    await deleteLeave.mutateAsync(id)
  }

  // Show all leaves when showCancelled, otherwise just non-cancelled
  const displayed = showCancelled ? leaves : leaves.filter((l) => l.status !== 'cancelled')

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-6 w-6 text-gray-600 dark:text-gray-400" />
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('leave.title')}</h1>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-primary-500 hover:bg-primary-600 text-white rounded-lg"
        >
          <Plus className="h-4 w-4" />
          {t('leave.request_leave')}
        </button>
      </div>

      {/* Filters (managers/admins) */}
      {isManager && (
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">{t('leave.filter_user')}</label>
            <select
              value={filterUserId}
              onChange={(e) => setFilterUserId(e.target.value)}
              className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white"
            >
              <option value="">{t('leave.all_users')}</option>
              {usersData?.items.map((u) => (
                <option key={u.id} value={u.id}>{u.full_name}</option>
              ))}
            </select>
          </div>
          {filterUserId && (
            <button
              onClick={() => setFilterUserId('')}
              className="px-3 py-2 text-sm text-gray-500 underline"
            >
              {t('common.clear_filters')}
            </button>
          )}
        </div>
      )}

      {/* Show cancelled toggle */}
      <div className="flex gap-2">
        <button
          onClick={() => setShowCancelled(false)}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            !showCancelled
              ? 'bg-primary-500 text-white'
              : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
          }`}
        >
          {t('leave.active_leaves')}
        </button>
        <button
          onClick={() => setShowCancelled(true)}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            showCancelled
              ? 'bg-primary-500 text-white'
              : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
          }`}
        >
          {t('leave.all_statuses')}
        </button>
      </div>

      {/* Leave request form */}
      {showForm && (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200">{t('leave.new_request')}</h2>
            <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600">
              <X className="h-4 w-4" />
            </button>
          </div>
          <form onSubmit={handleCreate} className="space-y-3">
            {formError && <p className="text-sm text-red-600">{formError}</p>}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('leave.start_date')} *</label>
                <input
                  type="date"
                  value={form.start_date}
                  onChange={(e) => setForm(f => ({ ...f, start_date: e.target.value }))}
                  required
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('leave.end_date')} *</label>
                <input
                  type="date"
                  value={form.end_date}
                  min={form.start_date || undefined}
                  onChange={(e) => setForm(f => ({ ...f, end_date: e.target.value }))}
                  required
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('leave.reason')} <span className="text-gray-400">({t('common.optional')})</span></label>
              <textarea
                value={form.reason}
                onChange={(e) => setForm(f => ({ ...f, reason: e.target.value }))}
                rows={2}
                placeholder={t('leave.reason_placeholder')}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
              />
            </div>
            <div className="flex gap-3 pt-1">
              <button type="button" onClick={() => setShowForm(false)} className="flex-1 py-2 px-4 rounded-lg border border-gray-300 dark:border-gray-700 text-sm text-gray-600 dark:text-gray-400">
                {t('common.cancel')}
              </button>
              <button type="submit" disabled={createLeave.isPending} className="flex-1 py-2 px-4 rounded-lg bg-primary-500 hover:bg-primary-600 text-white text-sm font-medium disabled:opacity-50">
                {createLeave.isPending ? t('common.loading') : t('leave.submit')}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Leave list */}
      {isLoading ? (
        <div className="text-center py-12 text-gray-400">{t('common.loading')}</div>
      ) : displayed.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <CalendarDays className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p>{t('leave.no_requests')}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {displayed.map((leave) => (
            <div
              key={leave.id}
              className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-4 flex items-start gap-4"
            >
              {/* Date block */}
              <div className="text-center bg-gray-50 dark:bg-gray-800 rounded-lg p-3 min-w-[80px] flex-shrink-0">
                <p className="text-xs text-gray-400 dark:text-gray-500 font-medium">{format(parseISO(leave.start_date), 'MMM')}</p>
                <p className="text-2xl font-bold text-gray-800 dark:text-gray-200 leading-tight">{format(parseISO(leave.start_date), 'dd')}</p>
                {leave.start_date !== leave.end_date && (
                  <>
                    <p className="text-xs text-gray-400">—</p>
                    <p className="text-xs text-gray-400 font-medium">{format(parseISO(leave.end_date), 'dd MMM')}</p>
                  </>
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                {isManager && (
                  <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">{leave.user.full_name}</p>
                )}
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {dayCount(leave.start_date, leave.end_date)} {t('leave.days')}
                  {leave.reason && <span className="ml-2 text-gray-400">· {leave.reason}</span>}
                </p>
                {leave.review_note && (
                  <p className="text-xs text-gray-400 mt-0.5 italic">{t('leave.review_note')}: {leave.review_note}</p>
                )}
                <p className="text-xs text-gray-400 mt-0.5">
                  {t('leave.requested_on')} {format(new Date(leave.created_at), 'dd MMM yyyy')}
                </p>
              </div>

              {/* Status + actions */}
              <div className="flex items-center gap-2 flex-shrink-0">
                {showCancelled && (
                  <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${STATUS_COLORS[leave.status] ?? STATUS_COLORS.approved}`}>
                    {t(`leave.status_${leave.status}`)}
                  </span>
                )}

                {/* Cancel: owner or manager can cancel any non-cancelled leave */}
                {leave.status !== 'cancelled' && (
                  (leave.user_id === user?.id || isManager) && (
                    <button
                      onClick={() => handleCancel(leave)}
                      className="p-1.5 rounded text-gray-400 hover:text-orange-500"
                      title={t('leave.cancel')}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )
                )}

                {/* SuperAdmin: delete */}
                {user?.role === 'superadmin' && (
                  <button
                    onClick={() => handleDelete(leave.id)}
                    className="p-1.5 rounded text-gray-400 hover:text-red-500"
                    title={t('leave.delete')}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
