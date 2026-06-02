import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Pencil, Trash2, ToggleLeft, ToggleRight, Clock } from 'lucide-react'
import {
  useEmailWorkflows,
  useEmailTemplates,
  useCreateEmailWorkflow,
  useUpdateEmailWorkflow,
  useToggleEmailWorkflow,
  useDeleteEmailWorkflow,
  useTeamsWebhooks,
  type EmailWorkflow,
} from '@/api/email'

// ─── Constants ────────────────────────────────────────────────────────────────

const TIMEZONE_OPTIONS = [
  { value: 'Europe/Istanbul', label: 'İstanbul (UTC+3)' },
  { value: 'Europe/Moscow', label: 'Moskova (UTC+3)' },
  { value: 'Asia/Riyadh', label: 'Riyad (UTC+3)' },
  { value: 'Asia/Dubai', label: 'Dubai (UTC+4)' },
  { value: 'UTC', label: 'UTC (UTC+0)' },
  { value: 'Europe/London', label: 'Londra (UTC+0/+1)' },
  { value: 'Europe/Berlin', label: 'Berlin (UTC+1/+2)' },
  { value: 'Europe/Paris', label: 'Paris (UTC+1/+2)' },
  { value: 'Africa/Cairo', label: 'Kahire (UTC+2)' },
  { value: 'Asia/Kolkata', label: 'Hindistan (UTC+5:30)' },
  { value: 'Asia/Tokyo', label: 'Tokyo (UTC+9)' },
  { value: 'America/New_York', label: 'New York (UTC-5/-4)' },
  { value: 'America/Chicago', label: 'Chicago (UTC-6/-5)' },
  { value: 'America/Los_Angeles', label: 'Los Angeles (UTC-8/-7)' },
]

const HOURS = Array.from({ length: 24 }, (_, i) => ({
  value: i,
  label: `${String(i).padStart(2, '0')}:00`,
}))

const DAY_LABELS_TR = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar']
const DAY_LABELS_EN = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

function detectBrowserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone
  } catch {
    return 'Europe/Istanbul'
  }
}

// ─── Schedule summary helpers ─────────────────────────────────────────────────

function scheduleSummary(wf: EmailWorkflow, lang: string): string | null {
  const cfg = (wf.trigger_config as Record<string, unknown> | null) ?? {}
  const tz = (cfg.timezone as string) || 'Europe/Istanbul'
  const hour = typeof cfg.send_hour === 'number' ? cfg.send_hour : null

  if (wf.trigger_type === 'worklog_reminder' && hour !== null) {
    return lang === 'tr'
      ? `Her gün saat ${String(hour).padStart(2, '0')}:00 (${tz})`
      : `Every day at ${String(hour).padStart(2, '0')}:00 (${tz})`
  }

  if (wf.trigger_type === 'dashboard_report' && hour !== null) {
    const freq = (cfg.frequency as string) || 'daily'
    const dow = typeof cfg.day_of_week === 'number' ? cfg.day_of_week : 0
    const dayLabels = lang === 'tr' ? DAY_LABELS_TR : DAY_LABELS_EN
    const dayName = dayLabels[dow] ?? dow
    const hourStr = `${String(hour).padStart(2, '0')}:00`
    if (freq === 'weekly') {
      return lang === 'tr'
        ? `Her ${dayName} saat ${hourStr} (${tz})`
        : `Every ${dayName} at ${hourStr} (${tz})`
    }
    return lang === 'tr'
      ? `Her gün saat ${hourStr} (${tz})`
      : `Every day at ${hourStr} (${tz})`
  }

  return null
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function EmailWorkflowsPage() {
  const { t, i18n } = useTranslation()

  const TRIGGER_TYPES = [
    { value: 'task_due_soon', label: t('email.trigger_task_due_soon') },
    { value: 'task_overdue', label: t('email.trigger_task_overdue') },
    { value: 'task_status_changed', label: t('email.trigger_task_status_changed') },
    { value: 'worklog_reminder', label: t('email.trigger_worklog_reminder') },
    { value: 'task_assigned', label: t('email.trigger_task_assigned') },
    { value: 'account_activation', label: t('email.trigger_account_activation') },
    { value: 'password_reset', label: t('email.trigger_password_reset') },
    { value: 'dashboard_report', label: t('email.trigger_dashboard_report') },
  ]

  const RECIPIENT_TYPES = [
    { value: 'assignee', label: t('email.recipient_assignee') },
    { value: 'team_manager', label: t('email.recipient_team_manager') },
    { value: 'all_managers', label: t('email.recipient_all_managers') },
    { value: 'creator', label: t('email.recipient_creator') },
    { value: 'specific_emails', label: t('email.recipient_specific_emails') },
  ]

  const { data: workflows = [], isLoading } = useEmailWorkflows()
  const { data: templates = [] } = useEmailTemplates()
  const { data: teamsWebhooks = [] } = useTeamsWebhooks()
  const createWorkflow = useCreateEmailWorkflow()
  const updateWorkflow = useUpdateEmailWorkflow()
  const toggleWorkflow = useToggleEmailWorkflow()
  const deleteWorkflow = useDeleteEmailWorkflow()

  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<EmailWorkflow | null>(null)

  const [name, setName] = useState('')
  const [triggerType, setTriggerType] = useState('task_due_soon')
  const [templateId, setTemplateId] = useState('')
  const [recipientType, setRecipientType] = useState('assignee')
  const [sendTeams, setSendTeams] = useState(false)
  const [teamsWebhookId, setTeamsWebhookId] = useState('')
  const [daysBefore, setDaysBefore] = useState(3)
  const [recipientEmailsInput, setRecipientEmailsInput] = useState('')
  const [sendHour, setSendHour] = useState(8)
  const [timezone, setTimezone] = useState(detectBrowserTimezone())
  const [frequency, setFrequency] = useState('daily')
  const [dayOfWeek, setDayOfWeek] = useState(0)
  const [error, setError] = useState('')

  function resetForm() {
    setName('')
    setTriggerType('task_due_soon')
    setTemplateId(templates[0]?.id || '')
    setRecipientType('assignee')
    setSendTeams(false)
    setTeamsWebhookId('')
    setDaysBefore(3)
    setRecipientEmailsInput('')
    setSendHour(8)
    setTimezone(detectBrowserTimezone())
    setFrequency('daily')
    setDayOfWeek(0)
    setError('')
  }

  function openCreate() {
    setEditing(null)
    resetForm()
    setShowForm(true)
  }

  function openEdit(wf: EmailWorkflow) {
    const cfg = (wf.trigger_config as Record<string, unknown> | null) ?? {}
    setEditing(wf)
    setName(wf.name)
    setTriggerType(wf.trigger_type)
    setTemplateId(wf.template_id)
    setRecipientType(wf.recipient_type)
    setSendTeams(wf.send_teams)
    setTeamsWebhookId(wf.teams_webhook_id || '')
    setDaysBefore(typeof cfg.days_before === 'number' ? cfg.days_before : 3)
    setSendHour(typeof cfg.send_hour === 'number' ? cfg.send_hour : 8)
    setTimezone((cfg.timezone as string) || detectBrowserTimezone())
    setFrequency((cfg.frequency as string) || 'daily')
    setDayOfWeek(typeof cfg.day_of_week === 'number' ? cfg.day_of_week : 0)
    if (wf.recipient_type === 'specific_emails' && Array.isArray(wf.recipient_users)) {
      setRecipientEmailsInput((wf.recipient_users as string[]).join(', '))
    } else {
      setRecipientEmailsInput('')
    }
    setError('')
    setShowForm(true)
  }

  const isTimedTrigger = triggerType === 'worklog_reminder' || triggerType === 'dashboard_report'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    let triggerConfig: Record<string, unknown> | null = null
    if (triggerType === 'task_due_soon') {
      triggerConfig = { days_before: daysBefore }
    } else if (triggerType === 'worklog_reminder') {
      triggerConfig = { send_hour: sendHour, timezone }
    } else if (triggerType === 'dashboard_report') {
      triggerConfig = { send_hour: sendHour, timezone, frequency, day_of_week: dayOfWeek }
    }

    let recipientUsers: string[] | undefined
    if (recipientType === 'specific_emails') {
      recipientUsers = recipientEmailsInput.split(',').map((e) => e.trim()).filter((e) => e.includes('@'))
    }

    const data: Record<string, unknown> = {
      name,
      trigger_type: triggerType,
      template_id: templateId,
      recipient_type: recipientType,
      trigger_config: triggerConfig,
      send_teams: sendTeams,
      teams_webhook_id: sendTeams && teamsWebhookId ? teamsWebhookId : null,
    }
    if (recipientUsers !== undefined) {
      data.recipient_users = recipientUsers
    }

    try {
      if (editing) await updateWorkflow.mutateAsync({ id: editing.id, ...data })
      else await createWorkflow.mutateAsync(data)
      setShowForm(false)
    } catch (err: unknown) {
      setError((err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || t('common.error'))
    }
  }

  const getTriggerLabel = (type: string) => TRIGGER_TYPES.find((tt) => tt.value === type)?.label ?? type
  const getTemplateName = (id: string) => templates.find((tt) => tt.id === id)?.name ?? id

  const inputCls = 'w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500'
  const labelCls = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1'

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('email.workflows_title')}</h1>
        <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-lg text-sm font-medium">
          <Plus className="h-4 w-4" /> {t('email.add_workflow')}
        </button>
      </div>

      {isLoading ? (
        <p className="text-gray-400">{t('common.loading')}</p>
      ) : workflows.length === 0 ? (
        <div className="border border-dashed border-gray-300 dark:border-gray-700 rounded-xl p-10 text-center">
          <p className="text-gray-400">{t('email.no_workflows')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {workflows.map((wf) => {
            const summary = scheduleSummary(wf, i18n.language)
            return (
              <div key={wf.id} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-gray-900 dark:text-white">{wf.name}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${wf.is_active ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-500'}`}>
                        {wf.is_active ? t('common.active') : t('common.inactive')}
                      </span>
                      {wf.send_teams && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 font-medium">Teams</span>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-gray-500 dark:text-gray-400">
                      <span>{t('email.trigger_label')}: {getTriggerLabel(wf.trigger_type)}</span>
                      <span>{t('email.template_label')}: {getTemplateName(wf.template_id)}</span>
                      {summary && (
                        <span className="inline-flex items-center gap-1 text-primary-600 dark:text-primary-400 font-medium">
                          <Clock className="h-3 w-3" />
                          {summary}
                        </span>
                      )}
                      {wf.last_run_at && <span>{t('email.last_run')} {new Date(wf.last_run_at).toLocaleString()}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => toggleWorkflow.mutate(wf.id)}
                      className="p-1.5 rounded text-gray-400 hover:text-primary-500"
                      title={wf.is_active ? t('email.deactivate') : t('email.activate')}
                    >
                      {wf.is_active ? <ToggleRight className="h-5 w-5 text-green-500" /> : <ToggleLeft className="h-5 w-5" />}
                    </button>
                    <button onClick={() => openEdit(wf)} className="p-1.5 rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20">
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => { if (confirm(t('common.confirm_delete'))) deleteWorkflow.mutate(wf.id) }}
                      className="p-1.5 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-lg shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-800">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                {editing ? t('email.edit_workflow') : t('email.add_workflow')}
              </h2>
              <button onClick={() => setShowForm(false)} className="p-1 rounded text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {error && <p className="text-sm text-red-600 bg-red-50 dark:bg-red-900/20 p-3 rounded-lg">{error}</p>}

              <div>
                <label className={labelCls}>{t('common.name')} *</label>
                <input value={name} onChange={(e) => setName(e.target.value)} required className={inputCls} />
              </div>

              <div>
                <label className={labelCls}>{t('email.trigger_label')} *</label>
                <select value={triggerType} onChange={(e) => setTriggerType(e.target.value)} className={inputCls}>
                  {TRIGGER_TYPES.map((tt) => <option key={tt.value} value={tt.value}>{tt.label}</option>)}
                </select>
              </div>

              {/* days_before — only for task_due_soon */}
              {triggerType === 'task_due_soon' && (
                <div>
                  <label className={labelCls}>{t('email.days_before_label')}</label>
                  <input type="number" value={daysBefore} min={1} max={30} onChange={(e) => setDaysBefore(parseInt(e.target.value))} className={inputCls} />
                </div>
              )}

              {/* Send hour + timezone — for worklog_reminder and dashboard_report */}
              {isTimedTrigger && (
                <div className="p-4 rounded-lg bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800 space-y-3">
                  <p className="text-xs font-semibold text-primary-700 dark:text-primary-300 uppercase tracking-wide flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5" />
                    {i18n.language === 'tr' ? 'Gönderim Zamanlaması' : 'Send Schedule'}
                  </p>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelCls}>{t('email.send_hour')}</label>
                      <select
                        value={sendHour}
                        onChange={(e) => setSendHour(parseInt(e.target.value))}
                        className={inputCls}
                      >
                        {HOURS.map((h) => (
                          <option key={h.value} value={h.value}>{h.label}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className={labelCls}>{t('email.send_timezone')}</label>
                      <select
                        value={timezone}
                        onChange={(e) => setTimezone(e.target.value)}
                        className={inputCls}
                      >
                        {TIMEZONE_OPTIONS.map((tz) => (
                          <option key={tz.value} value={tz.value}>{tz.label}</option>
                        ))}
                        {/* If current timezone is not in the list, add it */}
                        {!TIMEZONE_OPTIONS.some((tz) => tz.value === timezone) && (
                          <option value={timezone}>{timezone} ({t('email.timezone_browser')})</option>
                        )}
                      </select>
                    </div>
                  </div>

                  {/* Frequency — only for dashboard_report */}
                  {triggerType === 'dashboard_report' && (
                    <>
                      <div>
                        <label className={labelCls}>{t('email.frequency')}</label>
                        <select value={frequency} onChange={(e) => setFrequency(e.target.value)} className={inputCls}>
                          <option value="daily">{t('email.frequency_daily')}</option>
                          <option value="weekly">{t('email.frequency_weekly')}</option>
                        </select>
                      </div>
                      {frequency === 'weekly' && (
                        <div>
                          <label className={labelCls}>{t('email.day_of_week')}</label>
                          <select value={dayOfWeek} onChange={(e) => setDayOfWeek(parseInt(e.target.value))} className={inputCls}>
                            <option value={0}>{t('backup.monday')}</option>
                            <option value={1}>{t('backup.tuesday')}</option>
                            <option value={2}>{t('backup.wednesday')}</option>
                            <option value={3}>{t('backup.thursday')}</option>
                            <option value={4}>{t('backup.friday')}</option>
                            <option value={5}>{t('backup.saturday')}</option>
                            <option value={6}>{t('backup.sunday')}</option>
                          </select>
                        </div>
                      )}
                    </>
                  )}

                  {/* Preview */}
                  <p className="text-xs text-primary-600 dark:text-primary-400 italic">
                    {scheduleSummary(
                      {
                        trigger_type: triggerType,
                        trigger_config: { send_hour: sendHour, timezone, frequency, day_of_week: dayOfWeek },
                      } as unknown as EmailWorkflow,
                      i18n.language,
                    )}
                  </p>
                </div>
              )}

              <div>
                <label className={labelCls}>{t('email.template_label_form')} *</label>
                <select value={templateId} onChange={(e) => setTemplateId(e.target.value)} required className={inputCls}>
                  <option value="">{t('email.select_template')}</option>
                  {templates.map((tt) => <option key={tt.id} value={tt.id}>{tt.name}</option>)}
                </select>
              </div>

              <div>
                <label className={labelCls}>{t('email.recipient_type_label')} *</label>
                <select value={recipientType} onChange={(e) => setRecipientType(e.target.value)} className={inputCls}>
                  {RECIPIENT_TYPES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>

              {recipientType === 'specific_emails' && (
                <div>
                  <label className={labelCls}>{t('email.recipient_emails_label')}</label>
                  <input
                    type="text"
                    value={recipientEmailsInput}
                    onChange={(e) => setRecipientEmailsInput(e.target.value)}
                    placeholder="email1@domain.com, email2@domain.com"
                    className={inputCls}
                  />
                </div>
              )}

              <div className="flex items-center gap-2">
                <input type="checkbox" id="sendTeams" checked={sendTeams} onChange={(e) => setSendTeams(e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-primary-600" />
                <label htmlFor="sendTeams" className="text-sm text-gray-700 dark:text-gray-300">{t('email.send_to_teams')}</label>
              </div>

              {sendTeams && teamsWebhooks.length > 0 && (
                <div>
                  <label className={labelCls}>{t('email.teams_webhook_label')}</label>
                  <select value={teamsWebhookId} onChange={(e) => setTeamsWebhookId(e.target.value)} className={inputCls}>
                    <option value="">{t('email.select_placeholder')}</option>
                    {teamsWebhooks.map((wh) => <option key={wh.id} value={wh.id}>{wh.name}</option>)}
                  </select>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="flex-1 py-2 px-4 rounded-lg border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 text-sm font-medium">{t('common.cancel')}</button>
                <button type="submit" disabled={createWorkflow.isPending || updateWorkflow.isPending} className="flex-1 py-2 px-4 rounded-lg bg-primary-500 hover:bg-primary-600 text-white text-sm font-medium disabled:opacity-50">
                  {createWorkflow.isPending || updateWorkflow.isPending ? t('common.saving') : t('common.save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
