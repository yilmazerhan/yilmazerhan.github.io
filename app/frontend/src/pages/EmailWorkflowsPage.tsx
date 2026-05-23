import { useState } from 'react'
import { Plus, Pencil, Trash2, ToggleLeft, ToggleRight } from 'lucide-react'
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

const TRIGGER_TYPES = [
  { value: 'task_due_soon', label: 'Görev Bitiş Yaklaşıyor' },
  { value: 'task_overdue', label: 'Görev Gecikti' },
  { value: 'task_status_changed', label: 'Görev Durumu Değişti' },
  { value: 'worklog_reminder', label: 'İş Günlüğü Hatırlatıcısı' },
  { value: 'task_assigned', label: 'Görev Atandı' },
  { value: 'account_activation', label: 'Hesap Aktivasyonu' },
  { value: 'password_reset', label: 'Şifre Sıfırlama' },
]

const RECIPIENT_TYPES = [
  { value: 'assignee', label: 'Atanan Kişi' },
  { value: 'team_manager', label: 'Takım Yöneticisi' },
  { value: 'all_managers', label: 'Tüm Yöneticiler' },
  { value: 'creator', label: 'Oluşturan' },
]

export default function EmailWorkflowsPage() {
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
  const [error, setError] = useState('')

  function openCreate() {
    setEditing(null); setName(''); setTriggerType('task_due_soon'); setTemplateId(templates[0]?.id || '')
    setRecipientType('assignee'); setSendTeams(false); setTeamsWebhookId(''); setDaysBefore(3); setError('')
    setShowForm(true)
  }

  function openEdit(wf: EmailWorkflow) {
    setEditing(wf); setName(wf.name); setTriggerType(wf.trigger_type); setTemplateId(wf.template_id)
    setRecipientType(wf.recipient_type); setSendTeams(wf.send_teams); setTeamsWebhookId(wf.teams_webhook_id || '')
    setDaysBefore((wf.trigger_config as any)?.days_before ?? 3); setError('')
    setShowForm(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setError('')
    const triggerConfig = triggerType === 'task_due_soon' ? { days_before: daysBefore } : null
    const data = {
      name, trigger_type: triggerType, template_id: templateId, recipient_type: recipientType,
      trigger_config: triggerConfig, send_teams: sendTeams,
      teams_webhook_id: sendTeams && teamsWebhookId ? teamsWebhookId : null,
    }
    try {
      if (editing) await updateWorkflow.mutateAsync({ id: editing.id, ...data })
      else await createWorkflow.mutateAsync(data)
      setShowForm(false)
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Bir hata oluştu.')
    }
  }

  const getTriggerLabel = (type: string) => TRIGGER_TYPES.find((t) => t.value === type)?.label ?? type
  const getTemplateName = (id: string) => templates.find((t) => t.id === id)?.name ?? id

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">E-posta İş Akışları</h1>
        <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-lg text-sm font-medium">
          <Plus className="h-4 w-4" /> Akış Ekle
        </button>
      </div>

      {isLoading ? (
        <p className="text-gray-400">Yükleniyor...</p>
      ) : workflows.length === 0 ? (
        <div className="border border-dashed border-gray-300 dark:border-gray-700 rounded-xl p-10 text-center">
          <p className="text-gray-400">Henüz iş akışı yok.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {workflows.map((wf) => (
            <div key={wf.id} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-gray-900 dark:text-white">{wf.name}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${wf.is_active ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-500'}`}>
                      {wf.is_active ? 'Aktif' : 'Pasif'}
                    </span>
                    {wf.send_teams && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 font-medium">Teams</span>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-gray-500 dark:text-gray-400">
                    <span>Tetikleyici: {getTriggerLabel(wf.trigger_type)}</span>
                    <span>Şablon: {getTemplateName(wf.template_id)}</span>
                    {wf.last_run_at && <span>Son çalışma: {new Date(wf.last_run_at).toLocaleString('tr')}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => toggleWorkflow.mutate(wf.id)} className="p-1.5 rounded text-gray-400 hover:text-primary-500" title={wf.is_active ? 'Pasife Al' : 'Aktife Al'}>
                    {wf.is_active ? <ToggleRight className="h-5 w-5 text-green-500" /> : <ToggleLeft className="h-5 w-5" />}
                  </button>
                  <button onClick={() => openEdit(wf)} className="p-1.5 rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20">
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button onClick={() => { if (confirm('Silmek istediğinizden emin misiniz?')) deleteWorkflow.mutate(wf.id) }} className="p-1.5 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-lg shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-800">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{editing ? 'İş Akışını Düzenle' : 'İş Akışı Ekle'}</h2>
              <button onClick={() => setShowForm(false)} className="p-1 rounded text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {error && <p className="text-sm text-red-600 bg-red-50 dark:bg-red-900/20 p-3 rounded-lg">{error}</p>}

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Ad *</label>
                <input value={name} onChange={(e) => setName(e.target.value)} required className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500" />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Tetikleyici *</label>
                <select value={triggerType} onChange={(e) => setTriggerType(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500">
                  {TRIGGER_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>

              {triggerType === 'task_due_soon' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Kaç gün önce uyar?</label>
                  <input type="number" value={daysBefore} min={1} max={30} onChange={(e) => setDaysBefore(parseInt(e.target.value))} className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500" />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">E-posta Şablonu *</label>
                <select value={templateId} onChange={(e) => setTemplateId(e.target.value)} required className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500">
                  <option value="">Şablon seçin...</option>
                  {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Alıcı Tipi *</label>
                <select value={recipientType} onChange={(e) => setRecipientType(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500">
                  {RECIPIENT_TYPES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>

              <div className="flex items-center gap-2">
                <input type="checkbox" id="sendTeams" checked={sendTeams} onChange={(e) => setSendTeams(e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-primary-600" />
                <label htmlFor="sendTeams" className="text-sm text-gray-700 dark:text-gray-300">Teams kanalına da gönder</label>
              </div>

              {sendTeams && teamsWebhooks.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Teams Webhook</label>
                  <select value={teamsWebhookId} onChange={(e) => setTeamsWebhookId(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500">
                    <option value="">Seçin...</option>
                    {teamsWebhooks.map((wh) => <option key={wh.id} value={wh.id}>{wh.name}</option>)}
                  </select>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="flex-1 py-2 px-4 rounded-lg border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 text-sm font-medium">İptal</button>
                <button type="submit" disabled={createWorkflow.isPending || updateWorkflow.isPending} className="flex-1 py-2 px-4 rounded-lg bg-primary-500 hover:bg-primary-600 text-white text-sm font-medium disabled:opacity-50">
                  {createWorkflow.isPending || updateWorkflow.isPending ? 'Kaydediliyor...' : 'Kaydet'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
