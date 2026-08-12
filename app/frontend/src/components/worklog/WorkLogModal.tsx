import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import { format } from 'date-fns'
import { useWorkTypes, useCreateWorkLog, useUpdateWorkLog, type WorkLog } from '@/api/worklog'
import { useUsers } from '@/api/users'
import { useAuthStore } from '@/store/authStore'
import { useTranslation } from 'react-i18next'
import { resolveName } from '@/utils/i18nName'
import DatePicker from '@/components/ui/DatePicker'

interface Props {
  log?: WorkLog
  duplicate?: WorkLog
  onClose: () => void
}

const DURATION_OPTIONS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3, 3.5, 4, 4.5, 5, 6, 7, 8]

export default function WorkLogModal({ log, duplicate, onClose }: Props) {
  const { t } = useTranslation()
  const currentUser = useAuthStore((s) => s.user)
  const isEdit = !!log
  const { data: workTypes } = useWorkTypes()

  const canSelectUser = !isEdit && (currentUser?.role === 'superadmin' || currentUser?.role === 'team_manager')
  const usersParams = currentUser?.role === 'team_manager' && currentUser.team_id
    ? { team_id: currentUser.team_id, is_active: true, limit: 200 }
    : { is_active: true, limit: 200 }
  const { data: usersData } = useUsers(canSelectUser ? usersParams : undefined)

  const today = format(new Date(), 'yyyy-MM-dd')
  const [workTypeId, setWorkTypeId] = useState(log?.work_type_id || duplicate?.work_type_id || '')
  const [logDate, setLogDate] = useState(log?.log_date || today)
  const [duration, setDuration] = useState(log?.duration_hours ?? duplicate?.duration_hours ?? 1)
  const [description, setDescription] = useState(log?.description || duplicate?.description || '')
  const [targetUserId, setTargetUserId] = useState('')
  const [error, setError] = useState('')

  const createLog = useCreateWorkLog()
  const updateLog = useUpdateWorkLog(log?.id || '')
  const loading = createLog.isPending || updateLog.isPending

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!workTypeId) { setError(t('worklog.work_type_required')); return }
    if (description.trim().length < 5) { setError(t('worklog.description_min_length')); return }

    try {
      if (isEdit) {
        await updateLog.mutateAsync({
          work_type_id: workTypeId,
          log_date: logDate,
          duration_hours: duration,
          description: description.trim(),
        })
      } else {
        await createLog.mutateAsync({
          work_type_id: workTypeId,
          log_date: logDate,
          duration_hours: duration,
          description: description.trim(),
          target_user_id: targetUserId || undefined,
        })
      }
      onClose()
    } catch (err: any) {
      setError(err.response?.data?.detail || t('common.error'))
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-lg shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-800">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            {isEdit ? t('worklog.edit') : duplicate ? t('worklog.duplicate') : t('worklog.add')}
          </h2>
          <button onClick={onClose} className="p-1 rounded text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 p-3 rounded-lg">
              {error}
            </p>
          )}

          {canSelectUser && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {t('worklog.for_user')}
              </label>
              <select
                value={targetUserId}
                onChange={(e) => setTargetUserId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="">{t('worklog.myself')}</option>
                {usersData?.items.filter((u) => u.id !== currentUser?.id).map((u) => (
                  <option key={u.id} value={u.id}>{u.full_name}</option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {t('worklog.date')}
              </label>
              <DatePicker
                value={logDate}
                max={today}
                onChange={setLogDate}
                required
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {t('worklog.duration')}
              </label>
              <select
                value={duration}
                onChange={(e) => setDuration(parseFloat(e.target.value))}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                {DURATION_OPTIONS.map((d) => (
                  <option key={d} value={d}>{d} {t('worklog.hours_unit')}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t('worklog.work_type')}
            </label>
            <div className="grid grid-cols-2 gap-2">
              {workTypes?.map((wt) => (
                <button
                  key={wt.id}
                  type="button"
                  onClick={() => setWorkTypeId(wt.id)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm text-left transition-all ${
                    workTypeId === wt.id
                      ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                      : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                  }`}
                >
                  <span
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: wt.color }}
                  />
                  <span className="truncate text-gray-700 dark:text-gray-300">{resolveName(t, wt.name, wt.name_key)}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t('worklog.description')}
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              required
              placeholder={t('worklog.description_placeholder')}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 px-4 rounded-lg border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 text-sm font-medium"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-2 px-4 rounded-lg bg-primary-500 hover:bg-primary-600 text-white text-sm font-medium disabled:opacity-50"
            >
              {loading ? t('common.loading') : t('common.save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
