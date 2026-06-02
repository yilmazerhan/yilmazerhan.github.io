import { useState } from 'react'
import { X } from 'lucide-react'
import { format } from 'date-fns'
import { useTranslation } from 'react-i18next'
import { useCreatePatch, useUpdatePatch, type CustomerPatch, type PatchCreate, type PatchUpdate } from '@/api/patches'

interface Props {
  patch?: CustomerPatch
  onClose: () => void
}

const STATUS_OPTIONS = ['planned', 'applied', 'failed', 'rolled_back'] as const
const ENV_SUGGESTIONS = ['production', 'staging', 'test', 'dev']

export default function PatchModal({ patch, onClose }: Props) {
  const { t } = useTranslation()
  const isEdit = !!patch

  const today = format(new Date(), 'yyyy-MM-dd')

  const [customer, setCustomer] = useState(patch?.customer || '')
  const [appVersion, setAppVersion] = useState(patch?.app_version || '')
  const [jiraTicket, setJiraTicket] = useState(patch?.jira_ticket || '')
  const [applyDate, setApplyDate] = useState(patch?.apply_date || today)
  const [environment, setEnvironment] = useState(patch?.environment || '')
  const [status, setStatus] = useState(patch?.status || 'planned')
  const [description, setDescription] = useState(patch?.description || '')
  const [error, setError] = useState('')

  const createPatch = useCreatePatch()
  const updatePatch = useUpdatePatch(patch?.id || '')
  const loading = createPatch.isPending || updatePatch.isPending

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    try {
      if (isEdit) {
        const data: PatchUpdate = {
          customer: customer.trim(),
          app_version: appVersion.trim(),
          jira_ticket: jiraTicket.trim() || null,
          apply_date: applyDate,
          environment: environment.trim() || null,
          status,
          description: description.trim() || null,
        }
        await updatePatch.mutateAsync(data)
      } else {
        const data: PatchCreate = {
          customer: customer.trim(),
          app_version: appVersion.trim(),
          apply_date: applyDate,
          status,
        }
        if (jiraTicket.trim()) data.jira_ticket = jiraTicket.trim()
        if (environment.trim()) data.environment = environment.trim()
        if (description.trim()) data.description = description.trim()
        await createPatch.mutateAsync(data)
      }
      onClose()
    } catch (err: any) {
      setError(err.response?.data?.detail || t('common.error'))
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-lg shadow-xl">
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-800">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            {isEdit ? t('patches.edit') : t('patches.add')}
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

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t('patches.customer')} <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={customer}
              onChange={(e) => setCustomer(e.target.value)}
              required
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {t('patches.app_version')} <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={appVersion}
                onChange={(e) => setAppVersion(e.target.value)}
                required
                placeholder={t('patches.version_placeholder')}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {t('patches.jira_ticket')}
              </label>
              <input
                type="text"
                value={jiraTicket}
                onChange={(e) => setJiraTicket(e.target.value)}
                placeholder={t('patches.ticket_placeholder')}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {t('patches.apply_date')} <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={applyDate}
                onChange={(e) => setApplyDate(e.target.value)}
                required
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {t('patches.status')} <span className="text-red-500">*</span>
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                required
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>{t(`patches.status_${s}`)}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t('patches.environment')}
            </label>
            <input
              type="text"
              value={environment}
              onChange={(e) => setEnvironment(e.target.value)}
              placeholder={t('patches.env_placeholder')}
              list="env-suggestions"
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
            <datalist id="env-suggestions">
              {ENV_SUGGESTIONS.map((e) => (
                <option key={e} value={e} />
              ))}
            </datalist>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t('patches.description')}
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
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
