import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Pencil, Trash2, ToggleLeft, ToggleRight, Clock, Play, ChevronDown, ChevronUp, X } from 'lucide-react'
import {
  useEmailWorkflows,
  useEmailTemplates,
  useCreateEmailWorkflow,
  useUpdateEmailWorkflow,
  useToggleEmailWorkflow,
  useDeleteEmailWorkflow,
  useTeamsWebhooks,
  useEmailCeleryHeartbeat,
  useEvaluateEmailsNow,
  useWorkflowEmailLogs,
  type EmailWorkflow,
  type EmailLog,
} from '@/api/email'
import { useUsers } from '@/api/users'

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
    const hourStr = `${String(hour).padStart(2, '0')}:00`
    const dayLabels = lang === 'tr' ? DAY_LABELS_TR : DAY_LABELS_EN
    const sendDays = Array.isArray(cfg.send_days) ? (cfg.send_days as number[]).sort((a, b) => a - b) : null
    if (!sendDays || sendDays.length === 7) {
      return lang === 'tr'
        ? `Her gün saat ${hourStr} (${tz})`
        : `Every day at ${hourStr} (${tz})`
    }
    const dayNames = sendDays.map((d) => dayLabels[d] ?? d).join(', ')
    return lang === 'tr'
      ? `${dayNames} saat ${hourStr} (${tz})`
      : `${dayNames} at ${hourStr} (${tz})`
  }

  if (wf.trigger_type === 'dashboard_report' && hour !== null) {
    const freq = (cfg.frequency as string) || 'daily'
    const dow = typeof cfg.day_of_week === 'number' ? cfg.day_of_week : 0
    const dayLabels = lang === 'tr' ? DAY_LABELS_TR : DAY_LABELS_EN
    const hourStr = `${String(hour).padStart(2, '0')}:00`
    if (freq === 'weekly') {
      const dayName = dayLabels[dow] ?? dow
      return lang === 'tr'
        ? `Her ${dayName} saat ${hourStr} (${tz})`
        : `Every ${dayName} at ${hourStr} (${tz})`
    }
    const sendDays = Array.isArray(cfg.send_days) ? (cfg.send_days as number[]).sort((a, b) => a - b) : null
    if (!sendDays || sendDays.length === 7) {
      return lang === 'tr'
        ? `Her gün saat ${hourStr} (${tz})`
        : `Every day at ${hourStr} (${tz})`
    }
    const dayNames = sendDays.map((d) => dayLabels[d] ?? d).join(', ')
    return lang === 'tr'
      ? `${dayNames} saat ${hourStr} (${tz})`
      : `${dayNames} at ${hourStr} (${tz})`
  }

  return null
}

// ─── WorkflowLogs sub-component ──────────────────────────────────────────────

function WorkflowLogs({ workflowId }: { workflowId: string }) {
  const { t } = useTranslation()
  const { data: logs = [], isLoading } = useWorkflowEmailLogs(workflowId)

  if (isLoading) return <p className="text-xs text-gray-400 p-2">{t('common.loading')}</p>
  if (logs.length === 0) return <p className="text-xs text-gray-400 p-2">{t('email.no_workflow_logs')}</p>

  const statusStyle = (status: EmailLog['status']) => {
    if (status === 'sent') return 'text-green-600 dark:text-green-400'
    if (status === 'failed') return 'text-red-600 dark:text-red-400'
    return 'text-yellow-600 dark:text-yellow-400'
  }

  return (
    <div className="mt-3 border-t border-gray-100 dark:border-gray-800 pt-3 space-y-1.5 max-h-52 overflow-y-auto">
      {logs.map((log) => (
        <div key={log.id} className="flex items-start gap-2 text-xs">
          <span className={`font-semibold whitespace-nowrap mt-0.5 ${statusStyle(log.status)}`}>
            {t(`email.status_${log.status}`)}
          </span>
          <span className="text-gray-500 dark:text-gray-400 whitespace-nowrap">
            {new Date(log.created_at).toLocaleString()}
          </span>
          <span className="text-gray-700 dark:text-gray-300 truncate">{log.to_email}</span>
          {log.error_message && (
            <span className="text-red-500 truncate" title={log.error_message}>— {log.error_message}</span>
          )}
        </div>
      ))}
    </div>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function EmailWorkflowsPage() {
  const { t, i18n } = useTranslation()

  const TRIGGER_TYPES = [
    { value: 'task_due_soon', label: t('email.trigger_task_due_soon') },
    { value: 'task_overdue', label: t('email.trigger_task_overdue') },
    { value: 'worklog_reminder', label: t('email.trigger_worklog_reminder') },
    { value: 'account_activation', label: t('email.trigger_account_activation') },
    { value: 'password_reset', label: t('email.trigger_password_reset') },
    { value: 'dashboard_report', label: t('email.trigger_dashboard_report') },
  ]

  const RECIPIENT_TYPES = [
    { value: 'assignee', label: t('email.recipient_assignee'), timedOnly: false },
    { value: 'team_manager', label: t('email.recipient_team_manager'), timedOnly: false },
    { value: 'all_managers', label: t('email.recipient_all_managers'), timedOnly: false },
    { value: 'all_users', label: t('email.recipient_all_users'), timedOnly: false },
    { value: 'creator', label: t('email.recipient_creator'), timedOnly: false },
    { value: 'specific_emails', label: t('email.recipient_specific_emails'), timedOnly: false },
    { value: 'specific_users', label: t('email.recipient_specific_users'), timedOnly: true },
  ]

  const { data: workflows = [], isLoading } = useEmailWorkflows()
  const { data: templates = [] } = useEmailTemplates()
  const { data: teamsWebhooks = [] } = useTeamsWebhooks()
  const { data: allUsersData } = useUsers({ is_active: true, limit: 200 })
  const { data: heartbeatData } = useEmailCeleryHeartbeat()
  const createWorkflow = useCreateEmailWorkflow()
  const updateWorkflow = useUpdateEmailWorkflow()
  const toggleWorkflow = useToggleEmailWorkflow()
  const deleteWorkflow = useDeleteEmailWorkflow()
  const evaluateNow = useEvaluateEmailsNow()

  const [showForm, setShowForm] = useState(false)
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null)
  const [editing, setEditing] = useState<EmailWorkflow | null>(null)

  const [name, setName] = useState('')
  const [triggerType, setTriggerType] = useState('task_due_soon')
  const [templateId, setTemplateId] = useState('')
  const [recipientType, setRecipientType] = useState('assignee')
  const [sendTeams, setSendTeams] = useState(false)
  const [teamsWebhookId, setTeamsWebhookId] = useState('')
  const [daysBefore, setDaysBefore] = useState(3)
  const [recipientEmailsInput, setRecipientEmailsInput] = useState('')
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([])
  const [sendHour, setSendHour] = useState(8)
  const [timezone, setTimezone] = useState(detectBrowserTimezone())
  const [frequency, setFrequency] = useState('daily')
  const [dayOfWeek, setDayOfWeek] = useState(0)
  const [sendDays, setSendDays] = useState<number[]>([0, 1, 2, 3, 4, 5, 6])
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
    setSelectedUserIds([])
    setSendHour(8)
    setTimezone(detectBrowserTimezone())
    setFrequency('daily')
    setDayOfWeek(0)
    setSendDays([0, 1, 2, 3, 4, 5, 6])
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
    setSendDays(Array.isArray(cfg.send_days) ? (cfg.send_days as number[]) : [0, 1, 2, 3, 4, 5, 6])
    if (wf.recipient_type === 'specific_emails' && Array.isArray(wf.recipient_users)) {
      setRecipientEmailsInput((wf.recipient_users as string[]).join(', '))
      setSelectedUserIds([])
    } else if (wf.recipient_type === 'specific_users' && Array.isArray(wf.recipient_users)) {
      setSelectedUserIds(wf.recipient_users as string[])
      setRecipientEmailsInput('')
    } else {
      setRecipientEmailsInput('')
      setSelectedUserIds([])
    }
    setError('')
    setShowForm(true)
  }

  const isTimedTrigger = triggerType === 'worklog_reminder' || triggerType === 'dashboard_report'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if ((triggerType === 'worklog_reminder' || (triggerType === 'dashboard_report' && frequency === 'daily')) && sendDays.length === 0) {
      setError(i18n.language === 'tr' ? 'En az bir gün seçilmelidir.' : 'At least one day must be selected.')
      return
    }

    let triggerConfig: Record<string, unknown> | null = null
    if (triggerType === 'task_due_soon') {
      triggerConfig = { days_before: daysBefore }
    } else if (triggerType === 'worklog_reminder') {
      triggerConfig = { send_hour: sendHour, timezone, send_days: sendDays }
    } else if (triggerType === 'dashboard_report') {
      triggerConfig = frequency === 'daily'
        ? { send_hour: sendHour, timezone, frequency, send_days: sendDays }
        : { send_hour: sendHour, timezone, frequency, day_of_week: dayOfWeek }
    }

    let recipientUsers: string[] | undefined
    if (recipientType === 'specific_emails') {
      recipientUsers = recipientEmailsInput.split(',').map((e) => e.trim()).filter((e) => e.includes('@'))
    } else if (recipientType === 'specific_users') {
      recipientUsers = selectedUserIds
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

  const heartbeatAge = (() => {
    if (!heartbeatData?.last_heartbeat) return null
    return (Date.now() - new Date(heartbeatData.last_heartbeat).getTime()) / 1000
  })()
  const heartbeatOk = heartbeatAge !== null && heartbeatAge < 1200 // 20 minutes (email evaluator runs every 15min)
  const heartbeatWarn = heartbeatAge !== null && heartbeatAge >= 1200 && heartbeatAge < 3600

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('email.workflows_title')}</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => evaluateNow.mutate()}
            disabled={evaluateNow.isPending}
            className="flex items-center gap-2 px-3 py-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-medium disabled:opacity-50"
            title={t('email.evaluate_now_title')}
          >
            <Play className="h-4 w-4" />
            {evaluateNow.isPending ? t('common.loading') : t('email.evaluate_now')}
          </button>
          <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-lg text-sm font-medium">
            <Plus className="h-4 w-4" /> {t('email.add_workflow')}
          </button>
        </div>
      </div>

      {/* Celery heartbeat indicator */}
      <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-sm ${
        heartbeatData === undefined
          ? 'border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50'
          : heartbeatOk
            ? 'border-green-200 dark:border-green-900 bg-green-50 dark:bg-green-900/20'
            : heartbeatWarn
              ? 'border-yellow-200 dark:border-yellow-900 bg-yellow-50 dark:bg-yellow-900/20'
              : 'border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-900/20'
      }`}>
        <span className={`h-2.5 w-2.5 rounded-full flex-shrink-0 ${
          heartbeatData === undefined ? 'bg-gray-400'
            : heartbeatOk ? 'bg-green-500'
              : heartbeatWarn ? 'bg-yellow-500'
                : 'bg-red-500'
        }`} />
        <div>
          <span className="font-medium text-gray-700 dark:text-gray-300">{t('email.celery_heartbeat_label')}</span>
          {heartbeatData === undefined ? (
            <span className="text-gray-400 ml-2">{t('common.loading')}</span>
          ) : heartbeatData.last_heartbeat ? (
            <span className={`ml-2 ${heartbeatOk ? 'text-green-700 dark:text-green-300' : heartbeatWarn ? 'text-yellow-700 dark:text-yellow-300' : 'text-red-700 dark:text-red-300'}`}>
              {new Date(heartbeatData.last_heartbeat).toLocaleString()}
              {!heartbeatOk && <span className="ml-2 font-medium">{t('email.celery_heartbeat_stale')}</span>}
            </span>
          ) : (
            <span className="text-red-600 dark:text-red-400 ml-2">{t('email.celery_heartbeat_never')}</span>
          )}
        </div>
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
            const logsExpanded = expandedLogId === wf.id
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
                      onClick={() => setExpandedLogId(logsExpanded ? null : wf.id)}
                      className="p-1.5 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                      title={t('email.show_logs')}
                    >
                      {logsExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </button>
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
                {logsExpanded && <WorkflowLogs workflowId={wf.id} />}
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

                  {/* Day-of-week selector — only for worklog_reminder */}
                  {triggerType === 'worklog_reminder' && (
                    <div>
                      <label className={labelCls}>{t('email.send_days')}</label>
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        {(i18n.language === 'tr' ? DAY_LABELS_TR : DAY_LABELS_EN).map((dayName, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => setSendDays((prev) =>
                              prev.includes(idx) ? prev.filter((d) => d !== idx) : [...prev, idx].sort((a, b) => a - b)
                            )}
                            className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
                              sendDays.includes(idx)
                                ? 'bg-primary-500 border-primary-500 text-white'
                                : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-primary-400'
                            }`}
                          >
                            {dayName.slice(0, 3)}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

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
                      {frequency === 'daily' && (
                        <div>
                          <label className={labelCls}>{t('email.send_days')}</label>
                          <div className="flex flex-wrap gap-1.5 mt-1">
                            {(i18n.language === 'tr' ? DAY_LABELS_TR : DAY_LABELS_EN).map((dayName, idx) => (
                              <button
                                key={idx}
                                type="button"
                                onClick={() => setSendDays((prev) =>
                                  prev.includes(idx) ? prev.filter((d) => d !== idx) : [...prev, idx].sort((a, b) => a - b)
                                )}
                                className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
                                  sendDays.includes(idx)
                                    ? 'bg-primary-500 border-primary-500 text-white'
                                    : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-primary-400'
                                }`}
                              >
                                {dayName.slice(0, 3)}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
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
                        trigger_config: { send_hour: sendHour, timezone, frequency, day_of_week: dayOfWeek, send_days: sendDays },
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
                  {RECIPIENT_TYPES.filter((r) => !r.timedOnly || isTimedTrigger).map((r) => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
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

              {recipientType === 'specific_users' && (
                <div>
                  <label className={labelCls}>{t('email.recipient_specific_users')}</label>
                  {selectedUserIds.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {selectedUserIds.map((uid) => {
                        const u = (allUsersData?.items ?? []).find((x) => x.id === uid)
                        return u ? (
                          <span key={uid} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-primary-100 text-primary-800 dark:bg-primary-900/40 dark:text-primary-300">
                            {u.full_name}
                            <button type="button" onClick={() => setSelectedUserIds(selectedUserIds.filter((id) => id !== uid))} className="hover:text-primary-600">
                              <X className="h-3 w-3" />
                            </button>
                          </span>
                        ) : null
                      })}
                    </div>
                  )}
                  <select
                    className={inputCls}
                    value=""
                    onChange={(e) => {
                      if (e.target.value && !selectedUserIds.includes(e.target.value)) {
                        setSelectedUserIds([...selectedUserIds, e.target.value])
                      }
                    }}
                  >
                    <option value="">{t('email.recipient_user_select_placeholder')}</option>
                    {(allUsersData?.items ?? [])
                      .filter((u) => !selectedUserIds.includes(u.id))
                      .map((u) => (
                        <option key={u.id} value={u.id}>{u.full_name} — {u.email}</option>
                      ))}
                  </select>
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
