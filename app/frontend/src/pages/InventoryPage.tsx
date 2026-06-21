import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Plus, Search, Pencil, Trash2, Eye, EyeOff, Download, Server, Database, Mail,
  Cloud, Package, Copy, Check, ChevronDown, ChevronRight, Send, X, Calendar, Layers, AlertTriangle,
} from 'lucide-react'
import {
  useInventoryItems,
  useCreateInventoryItem,
  useUpdateInventoryItem,
  useDeleteInventoryItem,
  useRevealField,
  exportInventory,
  useInventorySchedules,
  useCreateInventorySchedule,
  useUpdateInventorySchedule,
  useDeleteInventorySchedule,
  useSendInventoryScheduleNow,
  useInventoryGroups,
  useCreateInventoryGroup,
  useUpdateInventoryGroup,
  useDeleteInventoryGroup,
  type InventoryItem,
  type InventoryItemCreate,
  type InventorySchedule,
  type InventoryScheduleCreate,
  type InventoryGroup,
  type InventoryGroupCreate,
  type ItemType,
  type GroupType,
} from '@/api/inventory'
import { useAuthStore } from '@/store/authStore'
import { useMyEffectivePermissions } from '@/api/users'
import { useTeamsWebhooks } from '@/api/email'

// ─── Type badge helpers ────────────────────────────────────────────────────────

const TYPE_ICONS: Record<string, React.ReactNode> = {
  server: <Server className="h-3.5 w-3.5" />,
  database: <Database className="h-3.5 w-3.5" />,
  email_account: <Mail className="h-3.5 w-3.5" />,
  cloud_account: <Cloud className="h-3.5 w-3.5" />,
  generic: <Package className="h-3.5 w-3.5" />,
}

const TYPE_COLORS: Record<string, string> = {
  server: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  database: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
  email_account: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  cloud_account: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
  generic: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
}

const ALL_ITEM_TYPES: ItemType[] = ['server', 'database', 'email_account', 'cloud_account', 'generic']
const DB_TYPES = ['PostgreSQL', 'MySQL', 'MSSQL', 'Oracle', 'Redis', 'MongoDB', 'Other']
const CLOUD_PROVIDERS = ['AWS', 'Azure', 'GCP', 'DigitalOcean', 'Other']
const ALL_GROUP_TYPES: GroupType[] = ['replication', 'cluster', 'ha', 'load_balanced', 'related', 'other']
const GROUP_COLORS = ['#6366f1', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4']

// ─── Reveal field component ────────────────────────────────────────────────────

function RevealField({ itemId, field }: { itemId: string; field: string }) {
  const { t } = useTranslation()
  const [value, setValue] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const reveal = useRevealField()

  async function handleReveal() {
    if (value !== null) {
      setValue(null)
      return
    }
    if (!confirm(t('inventory.reveal_confirm'))) return
    const res = await reveal.mutateAsync({ id: itemId, field })
    setValue(res.value)
  }

  async function handleCopy() {
    if (!value) return
    await navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (value !== null) {
    return (
      <span className="flex items-center gap-1">
        <code className="text-xs bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded font-mono max-w-[200px] overflow-hidden text-ellipsis whitespace-nowrap">
          {value}
        </code>
        <button onClick={handleCopy} className="text-gray-400 hover:text-green-600 transition-colors" title={t('inventory.copy_to_clipboard')}>
          {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
        <button onClick={handleReveal} className="text-gray-400 hover:text-red-600 transition-colors" title={t('inventory.hide')}>
          <EyeOff className="h-3.5 w-3.5" />
        </button>
      </span>
    )
  }

  return (
    <button
      onClick={handleReveal}
      disabled={reveal.isPending}
      className="flex items-center gap-1 text-xs text-primary-600 hover:text-primary-800 dark:text-primary-400"
    >
      <Eye className="h-3.5 w-3.5" />
      {t('inventory.reveal')}
    </button>
  )
}

// ─── Item Form Modal ──────────────────────────────────────────────────────────

interface ItemFormModalProps {
  item: InventoryItem | null
  onClose: () => void
  groups?: InventoryGroup[]
}

function ItemFormModal({ item, onClose, groups = [] }: ItemFormModalProps) {
  const { t } = useTranslation()
  const create = useCreateInventoryItem()
  const update = useUpdateInventoryItem()

  const isEdit = !!item
  const [form, setForm] = useState<Partial<InventoryItemCreate> & { group_id?: string | null }>({
    item_type: item?.item_type ?? 'server',
    display_name: item?.display_name ?? '',
    description: item?.description ?? '',
    notes: item?.notes ?? '',
    owner: item?.owner ?? '',
    tags: item?.tags ?? [],
    is_active: item?.is_active ?? true,
    hostname: item?.hostname ?? '',
    ip_address: item?.ip_address ?? '',
    port: item?.port ?? undefined,
    username: item?.username ?? '',
    operating_system: item?.operating_system ?? '',
    database_name: item?.database_name ?? '',
    database_type: item?.database_type ?? '',
    email_address: item?.email_address ?? '',
    smtp_host: item?.smtp_host ?? '',
    smtp_port: item?.smtp_port ?? undefined,
    imap_host: item?.imap_host ?? '',
    imap_port: item?.imap_port ?? undefined,
    provider: item?.provider ?? '',
    account_id: item?.account_id ?? '',
    region: item?.region ?? '',
    url: item?.url ?? '',
    group_id: item?.group_id ?? null,
  })
  const [tagsInput, setTagsInput] = useState((item?.tags ?? []).join(', '))
  const [error, setError] = useState('')

  function set(key: keyof InventoryItemCreate, value: unknown) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    const payload: Record<string, unknown> = {
      ...form,
      tags: tagsInput.split(',').map((s) => s.trim()).filter(Boolean),
    }
    // Remove empty strings (but keep explicit null for group_id)
    Object.keys(payload).forEach((k) => {
      if (k !== 'group_id' && payload[k] === '') {
        delete payload[k]
      }
    })

    try {
      if (isEdit) {
        await update.mutateAsync({ id: item.id, data: payload as Parameters<typeof update.mutateAsync>[0]['data'] })
      } else {
        await create.mutateAsync(payload as unknown as InventoryItemCreate)
      }
      onClose()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(msg || 'Bir hata oluştu.')
    }
  }

  const inputCls =
    'w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500'
  const labelCls = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1'

  const itype = form.item_type!

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between z-10">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            {isEdit ? t('inventory.edit') : t('inventory.add')}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Item type */}
          {!isEdit && (
            <div>
              <label className={labelCls}>{t('inventory.item_type')}</label>
              <select
                value={form.item_type}
                onChange={(e) => set('item_type', e.target.value as ItemType)}
                className={inputCls}
              >
                {ALL_ITEM_TYPES.map((tp) => (
                  <option key={tp} value={tp}>{t(`inventory.types.${tp}`)}</option>
                ))}
              </select>
            </div>
          )}

          {/* Common fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className={labelCls}>{t('inventory.fields.display_name')} *</label>
              <input
                required
                type="text"
                value={form.display_name}
                onChange={(e) => set('display_name', e.target.value)}
                className={inputCls}
              />
            </div>

            <div className="sm:col-span-2">
              <label className={labelCls}>{t('inventory.fields.description')}</label>
              <textarea
                rows={2}
                value={form.description}
                onChange={(e) => set('description', e.target.value)}
                className={inputCls}
              />
            </div>
          </div>

          {/* Server fields */}
          {(itype === 'server' || itype === 'database') && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t pt-4 dark:border-gray-700">
              <div>
                <label className={labelCls}>{t('inventory.fields.hostname')}</label>
                <input type="text" value={form.hostname} onChange={(e) => set('hostname', e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>{t('inventory.fields.ip_address')}</label>
                <input type="text" placeholder="192.168.1.1" value={form.ip_address} onChange={(e) => set('ip_address', e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>{t('inventory.fields.port')}</label>
                <input type="number" min={1} max={65535} value={form.port ?? ''} onChange={(e) => set('port', e.target.value ? parseInt(e.target.value) : undefined)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>{t('inventory.fields.username')}</label>
                <input type="text" value={form.username} onChange={(e) => set('username', e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>{t('inventory.fields.password')}</label>
                <input type="password" placeholder={isEdit ? '(değiştirmek için yeni değer girin)' : ''} onChange={(e) => set('password', e.target.value)} className={inputCls} autoComplete="new-password" />
              </div>
              {itype === 'server' && (
                <>
                  <div>
                    <label className={labelCls}>{t('inventory.fields.operating_system')}</label>
                    <input type="text" placeholder="Ubuntu 22.04" value={form.operating_system} onChange={(e) => set('operating_system', e.target.value)} className={inputCls} />
                  </div>
                  <div className="sm:col-span-2">
                    <label className={labelCls}>{t('inventory.fields.ssh_key')}</label>
                    <textarea
                      rows={3}
                      placeholder={isEdit ? '(değiştirmek için yeni değer girin)' : '-----BEGIN RSA PRIVATE KEY-----...'}
                      onChange={(e) => set('ssh_key', e.target.value)}
                      className={inputCls + ' font-mono text-xs'}
                    />
                  </div>
                </>
              )}
            </div>
          )}

          {/* Database-specific fields */}
          {itype === 'database' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t pt-4 dark:border-gray-700">
              <div>
                <label className={labelCls}>{t('inventory.fields.database_name')}</label>
                <input type="text" value={form.database_name} onChange={(e) => set('database_name', e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>{t('inventory.fields.database_type')}</label>
                <select value={form.database_type} onChange={(e) => set('database_type', e.target.value)} className={inputCls}>
                  <option value="">— Seçin —</option>
                  {DB_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>
          )}

          {/* Email account fields */}
          {itype === 'email_account' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t pt-4 dark:border-gray-700">
              <div className="sm:col-span-2">
                <label className={labelCls}>{t('inventory.fields.email_address')}</label>
                <input type="email" value={form.email_address} onChange={(e) => set('email_address', e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>{t('inventory.fields.username')}</label>
                <input type="text" value={form.username} onChange={(e) => set('username', e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>{t('inventory.fields.password')}</label>
                <input type="password" placeholder={isEdit ? '(değiştirmek için yeni değer girin)' : ''} onChange={(e) => set('password', e.target.value)} className={inputCls} autoComplete="new-password" />
              </div>
              <div>
                <label className={labelCls}>{t('inventory.fields.smtp_host')}</label>
                <input type="text" value={form.smtp_host} onChange={(e) => set('smtp_host', e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>{t('inventory.fields.smtp_port')}</label>
                <input type="number" min={1} max={65535} value={form.smtp_port ?? ''} onChange={(e) => set('smtp_port', e.target.value ? parseInt(e.target.value) : undefined)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>{t('inventory.fields.imap_host')}</label>
                <input type="text" value={form.imap_host} onChange={(e) => set('imap_host', e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>{t('inventory.fields.imap_port')}</label>
                <input type="number" min={1} max={65535} value={form.imap_port ?? ''} onChange={(e) => set('imap_port', e.target.value ? parseInt(e.target.value) : undefined)} className={inputCls} />
              </div>
            </div>
          )}

          {/* Cloud account fields */}
          {itype === 'cloud_account' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t pt-4 dark:border-gray-700">
              <div>
                <label className={labelCls}>{t('inventory.fields.provider')}</label>
                <select value={form.provider} onChange={(e) => set('provider', e.target.value)} className={inputCls}>
                  <option value="">— Seçin —</option>
                  {CLOUD_PROVIDERS.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>{t('inventory.fields.account_id')}</label>
                <input type="text" value={form.account_id} onChange={(e) => set('account_id', e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>{t('inventory.fields.access_key_id')}</label>
                <input type="text" value={form.access_key_id ?? ''} onChange={(e) => set('access_key_id', e.target.value)} className={inputCls} autoComplete="off" />
              </div>
              <div>
                <label className={labelCls}>{t('inventory.fields.secret_access_key')}</label>
                <input type="password" placeholder={isEdit ? '(değiştirmek için yeni değer girin)' : ''} onChange={(e) => set('secret_access_key', e.target.value)} className={inputCls} autoComplete="new-password" />
              </div>
              <div>
                <label className={labelCls}>{t('inventory.fields.region')}</label>
                <input type="text" placeholder="eu-west-1" value={form.region} onChange={(e) => set('region', e.target.value)} className={inputCls} />
              </div>
            </div>
          )}

          {/* Generic fields */}
          {itype === 'generic' && (
            <div className="border-t pt-4 dark:border-gray-700">
              <label className={labelCls}>{t('inventory.fields.url')}</label>
              <input type="text" placeholder="https://..." value={form.url} onChange={(e) => set('url', e.target.value)} className={inputCls} />
            </div>
          )}

          {/* Group */}
          {groups.length > 0 && (
            <div className="border-t pt-4 dark:border-gray-700">
              <label className={labelCls}>{t('inventory.group')}</label>
              <select
                value={form.group_id ?? ''}
                onChange={(e) => setForm((p) => ({ ...p, group_id: e.target.value || null }))}
                className={inputCls}
              >
                <option value="">{t('inventory.groups.no_group')}</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name} ({t(`inventory.groups.types.${g.group_type}`)})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Tags + owner + notes (all types) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t pt-4 dark:border-gray-700">
            <div>
              <label className={labelCls}>{t('inventory.fields.owner')}</label>
              <input
                type="text"
                value={form.owner}
                onChange={(e) => set('owner', e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>{t('inventory.fields.tags')}</label>
              <input
                type="text"
                placeholder="prod, linux, k8s"
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>{t('inventory.fields.is_active')}</label>
              <label className="flex items-center gap-2 mt-2">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(e) => set('is_active', e.target.checked)}
                  className="rounded"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">{t('inventory.fields.is_active')}</span>
              </label>
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls}>{t('inventory.fields.notes')}</label>
              <textarea
                rows={2}
                value={form.notes}
                onChange={(e) => set('notes', e.target.value)}
                className={inputCls}
              />
            </div>
          </div>

          {error && (
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={create.isPending || update.isPending}
              className="px-4 py-2 rounded-lg bg-primary-500 hover:bg-primary-600 text-white text-sm font-medium transition-colors disabled:opacity-60"
            >
              {t('common.save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Schedule Modal ───────────────────────────────────────────────────────────

interface ScheduleModalProps {
  schedule: InventorySchedule | null
  onClose: () => void
}

function ScheduleModal({ schedule, onClose }: ScheduleModalProps) {
  const { t } = useTranslation()
  const isEdit = !!schedule
  const create = useCreateInventorySchedule()
  const update = useUpdateInventorySchedule()
  const { data: teamsWebhooks = [] } = useTeamsWebhooks()

  const [form, setForm] = useState<Partial<InventoryScheduleCreate>>({
    name: schedule?.name ?? '',
    frequency: schedule?.frequency ?? 'weekly',
    day_of_week: schedule?.day_of_week ?? 0,
    day_of_month: schedule?.day_of_month ?? 1,
    hour: schedule?.hour ?? 8,
    recipient_emails: schedule?.recipient_emails ?? [],
    is_active: schedule?.is_active ?? true,
    teams_webhook_id: schedule?.teams_webhook_id ?? null,
  })
  const [emailsInput, setEmailsInput] = useState((schedule?.recipient_emails ?? []).join('\n'))
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    const emails = emailsInput.split('\n').map((s) => s.trim()).filter(Boolean)
    const payload: InventoryScheduleCreate = {
      name: form.name!,
      frequency: form.frequency!,
      day_of_week: form.frequency === 'weekly' ? form.day_of_week : undefined,
      day_of_month: form.frequency === 'monthly' ? form.day_of_month : undefined,
      hour: form.hour ?? 8,
      recipient_emails: emails,
      is_active: form.is_active ?? true,
      teams_webhook_id: form.teams_webhook_id ?? null,
    }

    try {
      if (isEdit) {
        await update.mutateAsync({ id: schedule.id, data: payload })
      } else {
        await create.mutateAsync(payload)
      }
      onClose()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(msg || 'Bir hata oluştu.')
    }
  }

  const inputCls =
    'w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500'
  const labelCls = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1'

  const DAYS: Record<number, string> = {
    0: 'Pazartesi', 1: 'Salı', 2: 'Çarşamba', 3: 'Perşembe',
    4: 'Cuma', 5: 'Cumartesi', 6: 'Pazar',
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-lg">
        <div className="border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            {isEdit ? t('inventory.schedule_edit') : t('inventory.schedule_add')}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className={labelCls}>{t('inventory.schedule_name')} *</label>
            <input required type="text" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} className={inputCls} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>{t('inventory.schedule_frequency')}</label>
              <select value={form.frequency} onChange={(e) => setForm((p) => ({ ...p, frequency: e.target.value as 'daily' | 'weekly' | 'monthly' }))} className={inputCls}>
                <option value="daily">{t('inventory.frequency_daily')}</option>
                <option value="weekly">{t('inventory.frequency_weekly')}</option>
                <option value="monthly">{t('inventory.frequency_monthly')}</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>{t('inventory.schedule_hour')}</label>
              <input type="number" min={0} max={23} value={form.hour ?? 8} onChange={(e) => setForm((p) => ({ ...p, hour: parseInt(e.target.value) }))} className={inputCls} />
            </div>
          </div>

          {form.frequency === 'weekly' && (
            <div>
              <label className={labelCls}>{t('inventory.schedule_day_of_week')}</label>
              <select value={form.day_of_week ?? 0} onChange={(e) => setForm((p) => ({ ...p, day_of_week: parseInt(e.target.value) }))} className={inputCls}>
                {Object.entries(DAYS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
          )}

          {form.frequency === 'monthly' && (
            <div>
              <label className={labelCls}>{t('inventory.schedule_day_of_month')}</label>
              <input type="number" min={1} max={31} value={form.day_of_month ?? 1} onChange={(e) => setForm((p) => ({ ...p, day_of_month: parseInt(e.target.value) }))} className={inputCls} />
            </div>
          )}

          <div>
            <label className={labelCls}>{t('inventory.recipient_emails')} *</label>
            <textarea
              required
              rows={4}
              placeholder={t('inventory.recipient_emails_hint')}
              value={emailsInput}
              onChange={(e) => setEmailsInput(e.target.value)}
              className={inputCls}
            />
          </div>

          {teamsWebhooks.length > 0 && (
            <div>
              <label className={labelCls}>{t('inventory.schedule_teams_webhook')}</label>
              <select
                value={form.teams_webhook_id ?? ''}
                onChange={(e) => setForm((p) => ({ ...p, teams_webhook_id: e.target.value || null }))}
                className={inputCls}
              >
                <option value="">{t('inventory.schedule_teams_webhook_none')}</option>
                {teamsWebhooks.filter((wh) => wh.is_active).map((wh) => (
                  <option key={wh.id} value={wh.id}>{wh.name}</option>
                ))}
              </select>
            </div>
          )}

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => setForm((p) => ({ ...p, is_active: e.target.checked }))}
              className="rounded"
            />
            <span className="text-sm text-gray-700 dark:text-gray-300">{t('inventory.fields.is_active')}</span>
          </label>

          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">
              {t('common.cancel')}
            </button>
            <button type="submit" disabled={create.isPending || update.isPending} className="px-4 py-2 rounded-lg bg-primary-500 hover:bg-primary-600 text-white text-sm font-medium transition-colors disabled:opacity-60">
              {t('common.save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Group Modal ──────────────────────────────────────────────────────────────

interface GroupModalProps {
  group: InventoryGroup | null
  onClose: () => void
}

function GroupModal({ group, onClose }: GroupModalProps) {
  const { t } = useTranslation()
  const isEdit = !!group
  const create = useCreateInventoryGroup()
  const update = useUpdateInventoryGroup()

  const [form, setForm] = useState<InventoryGroupCreate>({
    name: group?.name ?? '',
    description: group?.description ?? '',
    group_type: group?.group_type ?? 'related',
    color: group?.color ?? '#6366f1',
  })
  const [error, setError] = useState('')

  const inputCls =
    'w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500'
  const labelCls = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    try {
      if (isEdit) {
        await update.mutateAsync({ id: group.id, data: form })
      } else {
        await create.mutateAsync(form)
      }
      onClose()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(msg || 'Bir hata oluştu.')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-md">
        <div className="border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            {isEdit ? t('inventory.groups.edit') : t('inventory.groups.add')}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className={labelCls}>{t('inventory.groups.name')} *</label>
            <input
              required
              type="text"
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              className={inputCls}
            />
          </div>

          <div>
            <label className={labelCls}>{t('inventory.groups.description')}</label>
            <textarea
              rows={2}
              value={form.description ?? ''}
              onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
              className={inputCls}
            />
          </div>

          <div>
            <label className={labelCls}>{t('inventory.groups.type')}</label>
            <select
              value={form.group_type}
              onChange={(e) => setForm((p) => ({ ...p, group_type: e.target.value as GroupType }))}
              className={inputCls}
            >
              {ALL_GROUP_TYPES.map((gt) => (
                <option key={gt} value={gt}>{t(`inventory.groups.types.${gt}`)}</option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelCls}>{t('inventory.groups.color')}</label>
            <div className="flex flex-wrap gap-2 mt-1">
              {GROUP_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setForm((p) => ({ ...p, color: c }))}
                  className="w-7 h-7 rounded-full border-2 transition-all"
                  style={{
                    backgroundColor: c,
                    borderColor: form.color === c ? '#1f2937' : 'transparent',
                    transform: form.color === c ? 'scale(1.2)' : 'scale(1)',
                  }}
                />
              ))}
              <input
                type="color"
                value={form.color}
                onChange={(e) => setForm((p) => ({ ...p, color: e.target.value }))}
                className="w-7 h-7 rounded cursor-pointer border border-gray-300 dark:border-gray-600"
                title="Özel renk"
              />
            </div>
          </div>

          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={create.isPending || update.isPending}
              className="px-4 py-2 rounded-lg bg-primary-500 hover:bg-primary-600 text-white text-sm font-medium transition-colors disabled:opacity-60"
            >
              {t('common.save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Delete Confirm Modal ─────────────────────────────────────────────────────

function DeleteConfirmModal({ name, onConfirm, onCancel }: {
  name: string
  onConfirm: () => void
  onCancel: () => void
}) {
  const { t } = useTranslation()
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-sm p-6 space-y-4">
        <div className="flex items-center gap-3">
          <span className="flex-shrink-0 w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
            <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
          </span>
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">
            {t('inventory.delete_confirm_title')}
          </h2>
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          {t('inventory.delete_confirm_body', { name })}
        </p>
        <div className="flex justify-end gap-3 pt-1">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium transition-colors"
          >
            {t('inventory.delete')}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Masked Notes ─────────────────────────────────────────────────────────────

function NotesModal({ name, notes, onClose }: { name: string; notes: string; onClose: () => void }) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    await navigator.clipboard.writeText(notes)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white truncate">
            {name} — {t('inventory.fields.notes')}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-6">
          <p className="text-sm text-gray-700 dark:text-gray-200 whitespace-pre-wrap break-words max-h-[55vh] overflow-y-auto">
            {notes}
          </p>
        </div>
        <div className="border-t border-gray-200 dark:border-gray-700 px-6 py-3 flex justify-end gap-3">
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? t('inventory.copied') : t('inventory.copy_to_clipboard')}
          </button>
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg bg-primary-500 hover:bg-primary-600 text-white text-sm font-medium"
          >
            {t('common.close')}
          </button>
        </div>
      </div>
    </div>
  )
}

function MaskedNotes({ name, notes }: { name: string; notes?: string | null }) {
  const [open, setOpen] = useState(false)
  if (!notes) return <span className="text-gray-400 dark:text-gray-500">—</span>
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
      >
        <span className="text-xs tracking-widest">•••</span>
        <Eye className="h-3.5 w-3.5 shrink-0" />
      </button>
      {open && <NotesModal name={name} notes={notes} onClose={() => setOpen(false)} />}
    </>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function InventoryPage() {
  const { t } = useTranslation()
  const currentUser = useAuthStore((s) => s.user)
  const { data: effectivePerms } = useMyEffectivePermissions()
  const invPerms = effectivePerms?.permissions?.inventory

  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<string>('')
  const [groupFilter, setGroupFilter] = useState<string>('')
  const [editItem, setEditItem] = useState<InventoryItem | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<InventoryItem | null>(null)
  const [groupsOpen, setGroupsOpen] = useState(false)
  const [editGroup, setEditGroup] = useState<InventoryGroup | null>(null)
  const [groupCreateOpen, setGroupCreateOpen] = useState(false)
  const [schedulesOpen, setSchedulesOpen] = useState(false)
  const [editSchedule, setEditSchedule] = useState<InventorySchedule | null>(null)
  const [scheduleCreateOpen, setScheduleCreateOpen] = useState(false)
  const [exportLoading, setExportLoading] = useState(false)
  const [exportMenuOpen, setExportMenuOpen] = useState(false)

  // Use effective permissions (role defaults + overrides) so granted users see full UI
  const isMgrOrAbove = currentUser?.role === 'superadmin' || currentUser?.role === 'team_manager'
  const canCreate = invPerms?.create ?? isMgrOrAbove
  const canEdit = invPerms?.edit ?? isMgrOrAbove
  const canDelete = invPerms?.delete ?? isMgrOrAbove
  const canManage = canCreate || canEdit || canDelete

  const { data: items = [], isLoading } = useInventoryItems({
    search: search || undefined,
    item_type: typeFilter || undefined,
    group_id: groupFilter || undefined,
  })

  const deleteItem = useDeleteInventoryItem()
  const { data: groups = [] } = useInventoryGroups()
  const deleteGroup = useDeleteInventoryGroup()
  const { data: schedules = [] } = useInventorySchedules()
  const deleteSchedule = useDeleteInventorySchedule()
  const sendNow = useSendInventoryScheduleNow()

  async function handleDelete(item: InventoryItem) {
    setDeleteTarget(item)
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    try {
      await deleteItem.mutateAsync(deleteTarget.id)
      setDeleteTarget(null)
    } catch (err: any) { alert(err.response?.data?.detail || t('common.error')) }
  }

  async function handleDeleteGroup(group: InventoryGroup) {
    if (!confirm(t('inventory.groups.delete_confirm'))) return
    try {
      await deleteGroup.mutateAsync(group.id)
      if (groupFilter === group.id) setGroupFilter('')
    } catch (err: any) { alert(err.response?.data?.detail || t('common.error')) }
  }

  async function handleDeleteSchedule(sch: InventorySchedule) {
    if (!confirm(t('inventory.schedule_delete_confirm'))) return
    try { await deleteSchedule.mutateAsync(sch.id) }
    catch (err: any) { alert(err.response?.data?.detail || t('common.error')) }
  }

  async function handleExport(format: 'excel' | 'csv', scope: 'all' | 'visible') {
    setExportLoading(true)
    setExportMenuOpen(false)
    try {
      await exportInventory(format, typeFilter || undefined, scope)
    } finally {
      setExportLoading(false)
    }
  }

  async function handleSendNow(id: string) {
    const res = await sendNow.mutateAsync(id)
    alert(res.sent > 0 ? t('inventory.send_now_success') : 'SMTP yapılandırılmamış veya alıcı yok.')
  }

  function renderItemSubtitle(item: InventoryItem) {
    if (item.item_type === 'server' || item.item_type === 'database') {
      return item.hostname || item.ip_address || '—'
    }
    if (item.item_type === 'email_account') return item.email_address || '—'
    if (item.item_type === 'cloud_account') return `${item.provider || '—'} / ${item.account_id || '—'}`
    return item.url || '—'
  }

  function renderSecretFields(item: InventoryItem) {
    const fields: { label: string; field: string; has: boolean }[] = []
    if (item.item_type === 'server' || item.item_type === 'database' || item.item_type === 'email_account') {
      if (item.has_password) fields.push({ label: t('inventory.fields.password'), field: 'password', has: true })
    }
    if (item.item_type === 'server' && item.has_ssh_key) {
      fields.push({ label: t('inventory.fields.ssh_key'), field: 'ssh_key', has: true })
    }
    if (item.item_type === 'cloud_account' && item.has_access_key) {
      fields.push({ label: t('inventory.fields.access_key_id'), field: 'access_key_id', has: true })
      fields.push({ label: t('inventory.fields.secret_access_key'), field: 'secret_access_key', has: true })
    }
    return fields
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('inventory.title')}</h1>
        <div className="flex items-center gap-2">
          {/* Export dropdown */}
          <div className="relative">
            <button
              onClick={() => setExportMenuOpen((v) => !v)}
              disabled={exportLoading}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-60"
            >
              <Download className="h-4 w-4" />
              {t('inventory.export')}
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
            {exportMenuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setExportMenuOpen(false)} />
                <div className="absolute right-0 top-full mt-1 z-20 w-52 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                  <div className="px-3 py-1.5 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide border-b border-gray-100 dark:border-gray-700">
                    Excel
                  </div>
                  <button onClick={() => handleExport('excel', 'visible')} className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">
                    {t('inventory.export_scope_visible')}
                  </button>
                  <button onClick={() => handleExport('excel', 'all')} className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">
                    {t('inventory.export_scope_all')}
                  </button>
                  <div className="px-3 py-1.5 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide border-t border-b border-gray-100 dark:border-gray-700">
                    CSV
                  </div>
                  <button onClick={() => handleExport('csv', 'visible')} className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">
                    {t('inventory.export_scope_visible')}
                  </button>
                  <button onClick={() => handleExport('csv', 'all')} className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">
                    {t('inventory.export_scope_all')}
                  </button>
                </div>
              </>
            )}
          </div>

          {canCreate && (
            <button
              onClick={() => setCreateOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-lg text-sm font-medium transition-colors"
            >
              <Plus className="h-4 w-4" />
              {t('inventory.add')}
            </button>
          )}
        </div>
      </div>

      {/* View-only notice */}
      {!canManage && (
        <div className="rounded-lg bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 px-4 py-3 text-sm text-yellow-800 dark:text-yellow-200">
          {t('inventory.view_only_note')}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder={t('inventory.search_placeholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>

        {/* Type pills */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setTypeFilter('')}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              typeFilter === '' ? 'bg-primary-500 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
            }`}
          >
            {t('inventory.all_types')}
          </button>
          {ALL_ITEM_TYPES.map((tp) => (
            <button
              key={tp}
              onClick={() => setTypeFilter(typeFilter === tp ? '' : tp)}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                typeFilter === tp ? 'bg-primary-500 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              {TYPE_ICONS[tp]}
              {t(`inventory.types.${tp}`)}
            </button>
          ))}
        </div>

        {/* Group filter */}
        {groups.length > 0 && (
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-xs text-gray-500 dark:text-gray-400">{t('inventory.groups.manage')}:</span>
            <button
              onClick={() => setGroupFilter('')}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                groupFilter === '' ? 'bg-indigo-500 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              {t('inventory.groups.filter_all')}
            </button>
            {groups.map((g) => (
              <button
                key={g.id}
                onClick={() => setGroupFilter(groupFilter === g.id ? '' : g.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  groupFilter === g.id ? 'text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
                style={groupFilter === g.id ? { backgroundColor: g.color } : {}}
              >
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: g.color }} />
                {g.name}
                <span className="opacity-70">({g.item_count})</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Items list */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500" />
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-16 text-gray-400 dark:text-gray-500">
          {t('inventory.no_items')}
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-800/60">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-400">{t('inventory.fields.display_name')}</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-400 hidden md:table-cell">{t('inventory.item_type')}</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-400 hidden lg:table-cell">Host / Account</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-400 hidden lg:table-cell">{t('inventory.fields.credentials')}</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-400 hidden lg:table-cell">{t('inventory.fields.owner')}</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-400 hidden lg:table-cell">{t('inventory.fields.tags')}</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-400 hidden md:table-cell">{t('inventory.group')}</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-400 hidden 2xl:table-cell">{t('inventory.fields.notes')}</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600 dark:text-gray-400">İşlemler</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {items.map((item) => (
                <tr key={item.id} className="bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-750">
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900 dark:text-white">{item.display_name}</div>
                    {item.description && (
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate max-w-[200px]">{item.description}</div>
                    )}
                    {!item.is_active && (
                      <span className="inline-block text-xs text-gray-400 bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded mt-0.5">Pasif</span>
                    )}
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${TYPE_COLORS[item.item_type]}`}>
                      {TYPE_ICONS[item.item_type]}
                      {t(`inventory.types.${item.item_type}`)}
                    </span>
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell text-gray-600 dark:text-gray-300 text-xs">
                    {renderItemSubtitle(item)}
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell">
                    <div className="space-y-1">
                      <div className="text-xs text-gray-600 dark:text-gray-300">
                        {item.username || '—'}
                      </div>
                      {renderSecretFields(item).map(({ label, field }) => (
                        <div key={field} className="flex items-center gap-2">
                          <span className="text-xs text-gray-500 dark:text-gray-400 min-w-[50px]">{label}:</span>
                          <RevealField itemId={item.id} field={field} />
                        </div>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell text-gray-600 dark:text-gray-300 text-xs">
                    {item.owner || '—'}
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell">
                    <div className="flex flex-wrap gap-1">
                      {(item.tags || []).slice(0, 3).map((tag) => (
                        <span key={tag} className="px-1.5 py-0.5 rounded text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400">
                          {tag}
                        </span>
                      ))}
                      {(item.tags || []).length > 3 && (
                        <span className="text-xs text-gray-400">+{item.tags.length - 3}</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    {item.group ? (
                      <span
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium text-white"
                        style={{ backgroundColor: item.group.color }}
                      >
                        <Layers className="h-3 w-3" />
                        {item.group.name}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400 dark:text-gray-500">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 hidden 2xl:table-cell text-xs max-w-[160px]">
                    <MaskedNotes name={item.display_name} notes={item.notes} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {canEdit && (
                        <button
                          onClick={() => setEditItem(item)}
                          className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                          title={t('inventory.edit')}
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                      )}
                      {canDelete && (
                        <button
                          onClick={() => handleDelete(item)}
                          className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                          title={t('inventory.delete')}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Groups Section */}
      {canManage && (
        <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
          <button
            className="w-full flex items-center justify-between px-6 py-4 bg-gray-50 dark:bg-gray-800/60 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-left"
            onClick={() => setGroupsOpen((v) => !v)}
          >
            <div className="flex items-center gap-2 font-semibold text-gray-800 dark:text-white">
              <Layers className="h-4 w-4" />
              {t('inventory.groups.manage')}
              <span className="text-xs font-normal text-gray-500 dark:text-gray-400">({groups.length})</span>
            </div>
            {groupsOpen ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronRight className="h-4 w-4 text-gray-400" />}
          </button>

          {groupsOpen && (
            <div className="p-4 space-y-3">
              <div className="flex justify-end">
                <button
                  onClick={() => setGroupCreateOpen(true)}
                  className="flex items-center gap-2 px-3 py-1.5 bg-primary-500 hover:bg-primary-600 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  <Plus className="h-4 w-4" />
                  {t('inventory.groups.add')}
                </button>
              </div>

              {groups.length === 0 ? (
                <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-4">{t('inventory.groups.no_groups')}</p>
              ) : (
                <div className="space-y-2">
                  {groups.map((g) => (
                    <div key={g.id} className="flex items-center justify-between p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: g.color }} />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-gray-900 dark:text-white text-sm">{g.name}</span>
                            <span className="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded">
                              {t(`inventory.groups.types.${g.group_type}`)}
                            </span>
                          </div>
                          {g.description && (
                            <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">{g.description}</div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-4">
                        <span className="text-xs text-gray-500 dark:text-gray-400">{g.item_count} {t('inventory.groups.item_count')}</span>
                        <button
                          onClick={() => setEditGroup(g)}
                          className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 hover:text-blue-600 transition-colors"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteGroup(g)}
                          className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 hover:text-red-600 transition-colors"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Email Schedules Section */}
      {canManage && (
        <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
          <button
            className="w-full flex items-center justify-between px-6 py-4 bg-gray-50 dark:bg-gray-800/60 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-left"
            onClick={() => setSchedulesOpen((v) => !v)}
          >
            <div className="flex items-center gap-2 font-semibold text-gray-800 dark:text-white">
              <Calendar className="h-4 w-4" />
              {t('inventory.schedule_title')}
              <span className="text-xs font-normal text-gray-500 dark:text-gray-400">({schedules.length})</span>
            </div>
            {schedulesOpen ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronRight className="h-4 w-4 text-gray-400" />}
          </button>

          {schedulesOpen && (
            <div className="p-4 space-y-3">
              <div className="flex justify-end">
                <button
                  onClick={() => setScheduleCreateOpen(true)}
                  className="flex items-center gap-2 px-3 py-1.5 bg-primary-500 hover:bg-primary-600 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  <Plus className="h-4 w-4" />
                  {t('inventory.schedule_add')}
                </button>
              </div>

              {schedules.length === 0 ? (
                <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-4">{t('inventory.no_schedules')}</p>
              ) : (
                <div className="space-y-2">
                  {schedules.map((sch) => (
                    <div key={sch.id} className="flex items-center justify-between p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-900 dark:text-white text-sm">{sch.name}</span>
                          {sch.is_active ? (
                            <span className="text-xs text-green-600 bg-green-50 dark:bg-green-900/20 px-1.5 py-0.5 rounded">Aktif</span>
                          ) : (
                            <span className="text-xs text-gray-500 bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded">Pasif</span>
                          )}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                          {sch.frequency === 'daily' ? t('inventory.frequency_daily') :
                           sch.frequency === 'weekly' ? `${t('inventory.frequency_weekly')} — ${sch.hour}:00` :
                           `${t('inventory.frequency_monthly')} — ${sch.hour}:00`}
                          {' · '}{sch.recipient_emails.length} alıcı
                          {sch.last_run_at && ` · Son: ${new Date(sch.last_run_at).toLocaleDateString('tr-TR')}`}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0 ml-4">
                        <button
                          onClick={() => handleSendNow(sch.id)}
                          disabled={sendNow.isPending}
                          className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 hover:text-green-600 transition-colors"
                          title={t('inventory.send_now')}
                        >
                          <Send className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => setEditSchedule(sch)}
                          className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 hover:text-blue-600 transition-colors"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteSchedule(sch)}
                          className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 hover:text-red-600 transition-colors"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Delete confirmation */}
      {deleteTarget && (
        <DeleteConfirmModal
          name={deleteTarget.display_name}
          onConfirm={confirmDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      {/* Modals */}
      {(createOpen || editItem) && (
        <ItemFormModal
          item={editItem}
          groups={groups}
          onClose={() => {
            setCreateOpen(false)
            setEditItem(null)
          }}
        />
      )}

      {(groupCreateOpen || editGroup) && (
        <GroupModal
          group={editGroup}
          onClose={() => {
            setGroupCreateOpen(false)
            setEditGroup(null)
          }}
        />
      )}

      {(scheduleCreateOpen || editSchedule) && (
        <ScheduleModal
          schedule={editSchedule}
          onClose={() => {
            setScheduleCreateOpen(false)
            setEditSchedule(null)
          }}
        />
      )}
    </div>
  )
}
