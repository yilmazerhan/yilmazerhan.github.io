import { useState, useRef, useEffect } from 'react'
import { X, Plus, ChevronDown, Trash2 } from 'lucide-react'
import { format } from 'date-fns'
import { useTranslation } from 'react-i18next'
import {
  useCreatePatch, useUpdatePatch, useCustomers, useCreateCustomer,
  type CustomerPatch, type PatchFile, type PatchCreate, type PatchUpdate,
} from '@/api/patches'
import DatePicker from '@/components/ui/DatePicker'

interface Props {
  patch?: CustomerPatch
  onClose: () => void
}

const STATUS_OPTIONS = ['planned', 'applied', 'failed', 'rolled_back'] as const
const ENV_SUGGESTIONS = ['production', 'staging', 'test', 'dev']

// ─── Customer multi-select combobox ──────────────────────────────────────────

interface CustomerPickerProps {
  selected: string[]
  onChange: (v: string[]) => void
}

function CustomerPicker({ selected, onChange }: CustomerPickerProps) {
  const { t } = useTranslation()
  const { data: customers = [] } = useCustomers()
  const createCustomer = useCreateCustomer()

  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [addingError, setAddingError] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const filtered = customers.filter(
    (c) =>
      c.name.toLowerCase().includes(query.toLowerCase()) &&
      !selected.includes(c.name),
  )

  const exactMatch = customers.some(
    (c) => c.name.toLowerCase() === query.toLowerCase(),
  )
  const showAddNew = query.trim().length > 0 && !exactMatch

  function toggle(name: string) {
    if (selected.includes(name)) {
      onChange(selected.filter((n) => n !== name))
    } else {
      onChange([...selected, name])
    }
    setQuery('')
  }

  async function handleAddNew() {
    const name = query.trim()
    if (!name) return
    setAddingError('')
    try {
      const created = await createCustomer.mutateAsync(name)
      onChange([...selected, created.name])
      setQuery('')
    } catch {
      setAddingError(t('patches.customer_add_error'))
    }
  }

  return (
    <div ref={containerRef} className="relative">
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {selected.map((name) => (
            <span
              key={name}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-primary-100 text-primary-800 dark:bg-primary-900/40 dark:text-primary-300"
            >
              {name}
              <button
                type="button"
                onClick={() => onChange(selected.filter((n) => n !== name))}
                className="hover:text-primary-600 dark:hover:text-primary-200"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      <div
        className="flex items-center gap-1 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 cursor-text"
        onClick={() => { setOpen(true); inputRef.current?.focus() }}
      >
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          placeholder={selected.length === 0 ? t('patches.customers_placeholder') : t('patches.customers_add_more')}
          className="flex-1 text-sm bg-transparent text-gray-900 dark:text-white outline-none placeholder-gray-400"
        />
        <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </div>

      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg max-h-52 overflow-y-auto">
          {filtered.length === 0 && !showAddNew && (
            <p className="px-3 py-2 text-xs text-gray-400 dark:text-gray-500">
              {query ? t('patches.customer_not_found') : t('patches.customer_list_empty')}
            </p>
          )}

          {filtered.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => toggle(c.name)}
              className="w-full text-left px-3 py-2 text-sm text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/60 transition-colors"
            >
              {c.name}
            </button>
          ))}

          {showAddNew && (
            <button
              type="button"
              onClick={handleAddNew}
              disabled={createCustomer.isPending}
              className="w-full text-left px-3 py-2 text-sm text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 flex items-center gap-1.5 border-t border-gray-100 dark:border-gray-700 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              {t('patches.customer_add_new')}: <strong className="ml-1">{query.trim()}</strong>
            </button>
          )}
        </div>
      )}

      {addingError && (
        <p className="text-xs text-red-600 dark:text-red-400 mt-1">{addingError}</p>
      )}
    </div>
  )
}

// ─── Patch Files dynamic list ─────────────────────────────────────────────────

interface PatchFilesEditorProps {
  value: PatchFile[]
  onChange: (v: PatchFile[]) => void
}

function PatchFilesEditor({ value, onChange }: PatchFilesEditorProps) {
  const { t } = useTranslation()

  function addRow() {
    onChange([...value, { patch_name: '', md5sum: '' }])
  }

  function removeRow(idx: number) {
    onChange(value.filter((_, i) => i !== idx))
  }

  function updateRow(idx: number, field: keyof PatchFile, v: string) {
    onChange(value.map((row, i) => i === idx ? { ...row, [field]: v } : row))
  }

  return (
    <div className="space-y-2">
      {value.map((row, idx) => (
        <div key={idx} className="flex gap-2 items-start">
          <div className="flex-1">
            <input
              type="text"
              value={row.patch_name}
              onChange={(e) => updateRow(idx, 'patch_name', e.target.value)}
              placeholder={t('patches.patch_name_placeholder')}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <div className="flex-1">
            <input
              type="text"
              value={row.md5sum}
              onChange={(e) => updateRow(idx, 'md5sum', e.target.value)}
              placeholder={t('patches.md5sum_placeholder')}
              maxLength={64}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white font-mono focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <button
            type="button"
            onClick={() => removeRow(idx)}
            className="mt-1 p-1.5 text-gray-400 hover:text-red-600 dark:hover:text-red-400 rounded"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={addRow}
        className="flex items-center gap-1.5 text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300"
      >
        <Plus className="h-4 w-4" />
        {t('patches.patch_file_add')}
      </button>
    </div>
  )
}

// ─── Patch modal ──────────────────────────────────────────────────────────────

export default function PatchModal({ patch, onClose }: Props) {
  const { t } = useTranslation()
  const isEdit = !!patch

  const today = format(new Date(), 'yyyy-MM-dd')

  const [customers, setCustomers] = useState<string[]>(patch?.customers ?? [])
  const [patchFiles, setPatchFiles] = useState<PatchFile[]>(patch?.patch_files ?? [])
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

    if (customers.length === 0) {
      setError(t('patches.customer_required'))
      return
    }

    const cleanedFiles = patchFiles.filter((f) => f.patch_name.trim() || f.md5sum.trim())

    try {
      if (isEdit) {
        const data: PatchUpdate = {
          customers,
          patch_files: cleanedFiles,
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
          customers,
          patch_files: cleanedFiles,
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
    } catch (err: unknown) {
      setError((err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || t('common.error'))
    }
  }

  const inputCls =
    'w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500'
  const labelCls = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1'

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-2xl shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-800 sticky top-0 bg-white dark:bg-gray-900 z-10">
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

          {/* Customer multi-select */}
          <div>
            <label className={labelCls}>
              {t('patches.customers')} <span className="text-red-500">*</span>
            </label>
            <CustomerPicker selected={customers} onChange={setCustomers} />
          </div>

          {/* Patch files — dynamic list of {patch_name, md5sum} */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className={labelCls + ' mb-0'}>{t('patches.patch_files')}</label>
              <div className="grid grid-cols-2 gap-2 flex-1 ml-4">
                <span className="text-xs text-gray-400 dark:text-gray-500">{t('patches.patch_name')}</span>
                <span className="text-xs text-gray-400 dark:text-gray-500">{t('patches.md5sum')}</span>
              </div>
              <div className="w-8" />
            </div>
            <PatchFilesEditor value={patchFiles} onChange={setPatchFiles} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>
                {t('patches.app_version')} <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={appVersion}
                onChange={(e) => setAppVersion(e.target.value)}
                required
                placeholder={t('patches.version_placeholder')}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>{t('patches.jira_ticket')}</label>
              <input
                type="text"
                value={jiraTicket}
                onChange={(e) => setJiraTicket(e.target.value)}
                placeholder={t('patches.ticket_placeholder')}
                className={inputCls}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>
                {t('patches.apply_date')} <span className="text-red-500">*</span>
              </label>
              <DatePicker
                value={applyDate}
                onChange={setApplyDate}
                required
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>
                {t('patches.status')} <span className="text-red-500">*</span>
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                required
                className={inputCls}
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>{t(`patches.status_${s}`)}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className={labelCls}>{t('patches.environment')}</label>
            <input
              type="text"
              value={environment}
              onChange={(e) => setEnvironment(e.target.value)}
              placeholder={t('patches.env_placeholder')}
              list="env-suggestions"
              className={inputCls}
            />
            <datalist id="env-suggestions">
              {ENV_SUGGESTIONS.map((e) => (
                <option key={e} value={e} />
              ))}
            </datalist>
          </div>

          <div>
            <label className={labelCls}>{t('patches.description')}</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className={`${inputCls} resize-none`}
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
