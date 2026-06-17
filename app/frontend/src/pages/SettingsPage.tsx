import { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { format } from 'date-fns'
import { tr, enUS } from 'date-fns/locale'
import { Plus, Pencil, Trash2, CheckCircle, XCircle, Loader2, ShieldCheck, Upload, Building2, MessageSquare, Mail, Layers, Tag, RefreshCw } from 'lucide-react'
import { resolveName } from '@/utils/i18nName'
import {
  useWorkTypes,
  useCreateWorkType,
  useUpdateWorkType,
  useDeleteWorkType,
  type WorkType,
} from '@/api/worklog'
import {
  useBoards,
  useColumns,
  useCreateColumn,
  useUpdateColumn,
  useDeleteColumn,
  useLabels,
  useCreateLabel,
  useUpdateLabel,
  useDeleteLabel,
  type KanbanColumn,
  type TaskLabel,
} from '@/api/kanban'
import {
  useJiraConfigs,
  useCreateJiraConfig,
  useUpdateJiraConfig,
  useDeleteJiraConfig,
  useTestJiraConnection,
  type JiraConfig,
} from '@/api/jira'
import {
  useSslCertificates,
  useUploadPem,
  useUploadJks,
  useActivateCertificate,
  useDeleteCertificate,
  useReloadSsl,
  useBranding,
  useUpdateBranding,
  useUploadLogo,
  useUploadFavicon,
} from '@/api/admin'
import {
  useTeamsWebhooks,
  useCreateTeamsWebhook,
  useDeleteTeamsWebhook,
  useSmtpConfigs,
  useCreateSmtpConfig,
  useUpdateSmtpConfig,
  useTestSmtpConfig,
  type SmtpConfig,
} from '@/api/email'

export default function SettingsPage() {
  const { t, i18n } = useTranslation()
  const dateLocale = i18n.language === 'tr' ? tr : enUS

  // SMTP
  const { data: smtpConfigs = [] } = useSmtpConfigs()
  const createSmtp = useCreateSmtpConfig()
  const updateSmtp = useUpdateSmtpConfig()
  const testSmtp = useTestSmtpConfig()
  const [smtpShowForm, setSmtpShowForm] = useState(false)
  const [smtpEditing, setSmtpEditing] = useState<SmtpConfig | null>(null)
  const [smtpHost, setSmtpHost] = useState('')
  const [smtpPort, setSmtpPort] = useState(587)
  const [smtpUsername, setSmtpUsername] = useState('')
  const [smtpPassword, setSmtpPassword] = useState('')
  const [smtpFromEmail, setSmtpFromEmail] = useState('')
  const [smtpFromName, setSmtpFromName] = useState('')
  const [smtpUseTls, setSmtpUseTls] = useState(true)
  const [smtpUseSsl, setSmtpUseSsl] = useState(false)
  const [smtpError, setSmtpError] = useState('')
  const [smtpTestResult, setSmtpTestResult] = useState<Record<string, { success: boolean; msg: string }>>({})

  async function handleSmtpTest(cfg: SmtpConfig) {
    setSmtpTestResult((prev) => ({ ...prev, [cfg.id]: { success: false, msg: '...' } }))
    try {
      const result = await testSmtp.mutateAsync(cfg.id)
      setSmtpTestResult((prev) => ({ ...prev, [cfg.id]: { success: result.success, msg: result.message } }))
    } catch (err: any) {
      setSmtpTestResult((prev) => ({ ...prev, [cfg.id]: { success: false, msg: err.response?.data?.detail || t('common.error') } }))
    }
  }

  function smtpOpenCreate() {
    setSmtpEditing(null)
    setSmtpHost(''); setSmtpPort(587); setSmtpUsername(''); setSmtpPassword('')
    setSmtpFromEmail(''); setSmtpFromName(''); setSmtpUseTls(true); setSmtpUseSsl(false); setSmtpError('')
    setSmtpShowForm(true)
  }

  function smtpOpenEdit(cfg: SmtpConfig) {
    setSmtpEditing(cfg)
    setSmtpHost(cfg.host); setSmtpPort(cfg.port); setSmtpUsername(cfg.username)
    setSmtpPassword(''); setSmtpFromEmail(cfg.from_email); setSmtpFromName(cfg.from_name)
    setSmtpUseTls(cfg.use_tls); setSmtpUseSsl(cfg.use_ssl ?? false); setSmtpError('')
    setSmtpShowForm(true)
  }

  async function smtpHandleSubmit(e: React.FormEvent) {
    e.preventDefault(); setSmtpError('')
    try {
      if (smtpEditing) {
        const data: any = { id: smtpEditing.id, host: smtpHost, port: smtpPort, username: smtpUsername, from_email: smtpFromEmail, from_name: smtpFromName, use_tls: smtpUseTls, use_ssl: smtpUseSsl }
        if (smtpPassword) data.password = smtpPassword
        await updateSmtp.mutateAsync(data)
      } else {
        await createSmtp.mutateAsync({ host: smtpHost, port: smtpPort, username: smtpUsername, password: smtpPassword, from_email: smtpFromEmail, from_name: smtpFromName, use_tls: smtpUseTls, use_ssl: smtpUseSsl })
      }
      setSmtpShowForm(false)
    } catch (err: any) {
      setSmtpError(err.response?.data?.detail || t('common.error'))
    }
  }

  const { data: configs = [], isLoading } = useJiraConfigs()
  const { data: sslCerts = [] } = useSslCertificates()
  const { data: branding } = useBranding()
  const activateCert = useActivateCertificate()
  const deleteCert = useDeleteCertificate()
  const reloadSsl = useReloadSsl()
  const [sslReloadMsg, setSslReloadMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const uploadPem = useUploadPem()
  const uploadJks = useUploadJks()
  const updateBranding = useUpdateBranding()
  const uploadLogo = useUploadLogo()
  const uploadFavicon = useUploadFavicon()
  const logoInputRef = useRef<HTMLInputElement>(null)
  const faviconInputRef = useRef<HTMLInputElement>(null)

  const { data: teamsWebhooks = [] } = useTeamsWebhooks()
  const createWebhook = useCreateTeamsWebhook()
  const deleteWebhook = useDeleteTeamsWebhook()
  const [webhookName, setWebhookName] = useState('')
  const [webhookUrl, setWebhookUrl] = useState('')
  const [webhookError, setWebhookError] = useState('')

  async function handleWebhookCreate(e: React.FormEvent) {
    e.preventDefault(); setWebhookError('')
    try {
      await createWebhook.mutateAsync({ name: webhookName, webhook_url: webhookUrl })
      setWebhookName(''); setWebhookUrl('')
    } catch (err: any) { setWebhookError(err.response?.data?.detail || t('settings.create_failed')) }
  }

  const [sslUploadType, setSslUploadType] = useState<'pem' | 'jks'>('pem')
  const [sslName, setSslName] = useState('')
  const [certFile, setCertFile] = useState<File | null>(null)
  const [keyFile, setKeyFile] = useState<File | null>(null)
  const [jksFile, setJksFile] = useState<File | null>(null)
  const [jksPassword, setJksPassword] = useState('')
  const [sslError, setSslError] = useState('')

  const [companyName, setCompanyName] = useState(branding?.company_name ?? '')
  const [primaryColor, setPrimaryColor] = useState(branding?.primary_color ?? '#3b82f6')
  const [jiraBaseUrl, setJiraBaseUrl] = useState(branding?.jira_base_url ?? '')
  const [brandingError, setBrandingError] = useState('')

  // Sync branding form state when server data loads
  useEffect(() => {
    if (branding) {
      setCompanyName(branding.company_name ?? '')
      setPrimaryColor(branding.primary_color ?? '#3b82f6')
      setJiraBaseUrl(branding.jira_base_url ?? '')
    }
  }, [branding?.company_name, branding?.primary_color, branding?.jira_base_url])

  async function handleSslUpload(e: React.FormEvent) {
    e.preventDefault(); setSslError('')
    try {
      if (sslUploadType === 'pem') {
        if (!certFile || !keyFile) { setSslError(t('settings.cert_key_required')); return }
        await uploadPem.mutateAsync({ name: sslName, certFile, keyFile })
      } else {
        if (!jksFile) { setSslError(t('settings.jks_required')); return }
        await uploadJks.mutateAsync({ name: sslName, jksFile, password: jksPassword })
      }
      setSslName(''); setCertFile(null); setKeyFile(null); setJksFile(null); setJksPassword('')
    } catch (err: any) { setSslError(err.response?.data?.detail || t('settings.upload_failed')) }
  }

  async function handleSslReload() {
    setSslReloadMsg(null)
    try {
      await reloadSsl.mutateAsync()
      setSslReloadMsg({ ok: true, text: t('settings.ssl_reload_success') })
    } catch (err: any) {
      setSslReloadMsg({ ok: false, text: err.response?.data?.detail || t('settings.ssl_reload_error') })
    }
  }

  async function handleBrandingSave(e: React.FormEvent) {
    e.preventDefault(); setBrandingError('')
    try {
      await updateBranding.mutateAsync({ company_name: companyName, primary_color: primaryColor, jira_base_url: jiraBaseUrl })
    } catch (err: any) { setBrandingError(err.response?.data?.detail || t('settings.save_failed')) }
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    try { await uploadLogo.mutateAsync(file) }
    catch (err: any) { alert(err.response?.data?.detail || t('settings.logo_failed')) }
  }

  async function handleFaviconUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    try { await uploadFavicon.mutateAsync(file) }
    catch (err: any) { alert(err.response?.data?.detail || t('settings.favicon_failed')) }
  }

  const createConfig = useCreateJiraConfig()
  const updateConfig = useUpdateJiraConfig()
  const deleteConfig = useDeleteJiraConfig()
  const testConnection = useTestJiraConnection()

  const [showForm, setShowForm] = useState(false)
  const [editingConfig, setEditingConfig] = useState<JiraConfig | null>(null)
  const [testResult, setTestResult] = useState<Record<string, { success: boolean; msg: string }>>({})

  // Work Types state
  const { data: workTypes = [] } = useWorkTypes(false)
  const createWt = useCreateWorkType()
  const updateWt = useUpdateWorkType()
  const deleteWt = useDeleteWorkType()
  const [wtShowForm, setWtShowForm] = useState(false)
  const [wtEditing, setWtEditing] = useState<WorkType | null>(null)
  const [wtName, setWtName] = useState('')
  const [wtColor, setWtColor] = useState('#6366f1')
  const [wtSortOrder, setWtSortOrder] = useState(0)
  const [wtError, setWtError] = useState('')

  function wtOpenCreate() { setWtEditing(null); setWtName(''); setWtColor('#6366f1'); setWtSortOrder(workTypes.length); setWtError(''); setWtShowForm(true) }
  function wtOpenEdit(wt: WorkType) { setWtEditing(wt); setWtName(wt.name); setWtColor(wt.color); setWtSortOrder(wt.sort_order); setWtError(''); setWtShowForm(true) }

  async function wtHandleSubmit(e: React.FormEvent) {
    e.preventDefault(); setWtError('')
    try {
      if (wtEditing) await updateWt.mutateAsync({ id: wtEditing.id, name: wtName, color: wtColor, sort_order: wtSortOrder })
      else await createWt.mutateAsync({ name: wtName, color: wtColor, sort_order: wtSortOrder })
      setWtShowForm(false)
    } catch (err: any) { setWtError(err.response?.data?.detail || t('common.error')) }
  }

  async function wtHandleDelete(id: string) {
    if (!confirm(t('settings.confirm_delete_work_type'))) return
    try { await deleteWt.mutateAsync(id) }
    catch (err: any) { alert(err.response?.data?.detail || t('common.error')) }
  }

  // Kanban Boards for column filter
  const { data: boardsData = [] } = useBoards()
  const [selectedBoardId, setSelectedBoardId] = useState<string>('')

  // Kanban Columns state — filter by selected board
  const { data: columnsData = [] } = useColumns(selectedBoardId || undefined)
  const createCol = useCreateColumn()
  const updateCol = useUpdateColumn()
  const deleteCol = useDeleteColumn()
  const [colShowForm, setColShowForm] = useState(false)
  const [colEditing, setColEditing] = useState<KanbanColumn | null>(null)
  const [colName, setColName] = useState('')
  const [colColor, setColColor] = useState('#e2e8f0')
  const [colIsTerminal, setColIsTerminal] = useState(false)
  const [colSortOrder, setColSortOrder] = useState(0)
  const [colError, setColError] = useState('')

  function colOpenCreate() { setColEditing(null); setColName(''); setColColor('#e2e8f0'); setColIsTerminal(false); setColSortOrder(columnsData.length); setColError(''); setColShowForm(true) }
  function colOpenEdit(col: KanbanColumn) { setColEditing(col); setColName(col.name); setColColor(col.color); setColIsTerminal(col.is_terminal); setColSortOrder(col.sort_order); setColError(''); setColShowForm(true) }

  async function colHandleSubmit(e: React.FormEvent) {
    e.preventDefault(); setColError('')
    try {
      const boardId = selectedBoardId || (boardsData[0]?.id)
      if (colEditing) await updateCol.mutateAsync({ id: colEditing.id, name: colName, color: colColor, is_terminal: colIsTerminal, sort_order: colSortOrder })
      else await createCol.mutateAsync({ name: colName, color: colColor, is_terminal: colIsTerminal, sort_order: colSortOrder, board_id: boardId })
      setColShowForm(false)
    } catch (err: any) { setColError(err.response?.data?.detail || t('common.error')) }
  }

  async function colHandleDelete(id: string) {
    if (!confirm(t('settings.confirm_delete_column'))) return
    try { await deleteCol.mutateAsync(id) }
    catch (err: any) { alert(err.response?.data?.detail || t('common.error')) }
  }

  // Task Labels state
  const { data: labelsData = [] } = useLabels()
  const createLabel = useCreateLabel()
  const updateLabel = useUpdateLabel()
  const deleteLabel = useDeleteLabel()
  const [labelShowForm, setLabelShowForm] = useState(false)
  const [labelEditing, setLabelEditing] = useState<TaskLabel | null>(null)
  const [labelName, setLabelName] = useState('')
  const [labelColor, setLabelColor] = useState('#6366f1')
  const [labelError, setLabelError] = useState('')

  function labelOpenCreate() { setLabelEditing(null); setLabelName(''); setLabelColor('#6366f1'); setLabelError(''); setLabelShowForm(true) }
  function labelOpenEdit(label: TaskLabel) { setLabelEditing(label); setLabelName(label.name); setLabelColor(label.color); setLabelError(''); setLabelShowForm(true) }

  async function labelHandleSubmit(e: React.FormEvent) {
    e.preventDefault(); setLabelError('')
    try {
      if (labelEditing) await updateLabel.mutateAsync({ id: labelEditing.id, name: labelName, color: labelColor })
      else await createLabel.mutateAsync({ name: labelName, color: labelColor })
      setLabelShowForm(false)
    } catch (err: any) { setLabelError(err.response?.data?.detail || t('common.error')) }
  }

  async function labelHandleDelete(id: string) {
    if (!confirm(t('kanban.delete_label_confirm'))) return
    try { await deleteLabel.mutateAsync(id) }
    catch (err: any) { alert(err.response?.data?.detail || t('common.error')) }
  }

  const [name, setName] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [email, setEmail] = useState('')
  const [apiToken, setApiToken] = useState('')
  const [projectKey, setProjectKey] = useState('')
  const [formError, setFormError] = useState('')

  function openCreate() {
    setEditingConfig(null)
    setName(''); setBaseUrl(''); setEmail(''); setApiToken(''); setProjectKey('')
    setFormError('')
    setShowForm(true)
  }

  function openEdit(cfg: JiraConfig) {
    setEditingConfig(cfg)
    setName(cfg.name); setBaseUrl(cfg.base_url); setEmail(cfg.email); setApiToken(''); setProjectKey(cfg.project_key)
    setFormError('')
    setShowForm(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError('')
    try {
      if (editingConfig) {
        const data: any = { id: editingConfig.id, name, base_url: baseUrl, email, project_key: projectKey }
        if (apiToken) data.api_token = apiToken
        await updateConfig.mutateAsync(data)
      } else {
        await createConfig.mutateAsync({ name, base_url: baseUrl, email, api_token: apiToken, project_key: projectKey })
      }
      setShowForm(false)
    } catch (err: any) {
      setFormError(err.response?.data?.detail || t('common.error'))
    }
  }

  async function handleDelete(id: string) {
    if (!confirm(t('common.confirm_delete'))) return
    await deleteConfig.mutateAsync(id)
  }

  async function handleTest(id: string) {
    setTestResult((prev) => ({ ...prev, [id]: { success: false, msg: '...' } }))
    const result = await testConnection.mutateAsync(id)
    setTestResult((prev) => ({
      ...prev,
      [id]: {
        success: result.success,
        msg: result.success
          ? (result.project_name ?? t('settings.connection_success'))
          : (result.error ?? t('settings.connection_failed')),
      },
    }))
  }

  return (
    <div className="space-y-8 max-w-3xl">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('settings.title')}</h1>

      {/* SMTP Section */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-gray-500 dark:text-gray-400" />
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{t('settings.smtp_title')}</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{t('settings.smtp_description')}</p>
            </div>
          </div>
          <button
            onClick={smtpOpenCreate}
            className="flex items-center gap-2 px-3 py-1.5 bg-primary-500 hover:bg-primary-600 text-white rounded-lg text-sm font-medium"
          >
            <Plus className="h-4 w-4" />
            {t('common.add')}
          </button>
        </div>

        {smtpConfigs.length === 0 ? (
          <div className="border border-dashed border-gray-300 dark:border-gray-700 rounded-xl p-8 text-center">
            <p className="text-gray-400 dark:text-gray-500 text-sm">{t('settings.smtp_none')}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {smtpConfigs.map((cfg) => (
              <div key={cfg.id} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-gray-900 dark:text-white">{cfg.host}:{cfg.port}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${cfg.is_active ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-500'}`}>
                        {cfg.is_active ? t('common.active') : t('common.inactive')}
                      </span>
                      {cfg.use_tls && <span className="text-xs px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 font-medium">TLS</span>}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-gray-500 dark:text-gray-400">
                      <span>{t('settings.smtp_from_label')}: {cfg.from_name} &lt;{cfg.from_email}&gt;</span>
                      <span>{t('settings.smtp_username_label')}: {cfg.username}</span>
                    </div>
                    {/* Test result */}
                    {smtpTestResult[cfg.id] && (
                      <div className={`mt-2 flex items-center gap-1.5 text-xs ${
                        smtpTestResult[cfg.id].msg === '...' ? 'text-gray-400' :
                        smtpTestResult[cfg.id].success ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                      }`}>
                        {smtpTestResult[cfg.id].msg === '...' ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : smtpTestResult[cfg.id].success ? (
                          <CheckCircle className="h-3 w-3" />
                        ) : (
                          <XCircle className="h-3 w-3" />
                        )}
                        {smtpTestResult[cfg.id].msg}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => handleSmtpTest(cfg)}
                      disabled={testSmtp.isPending && smtpTestResult[cfg.id]?.msg === '...'}
                      className="px-2.5 py-1.5 rounded text-xs font-medium text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-900/20 border border-amber-300 dark:border-amber-700 flex items-center gap-1"
                      title={t('settings.smtp_test')}
                    >
                      {smtpTestResult[cfg.id]?.msg === '...' ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Mail className="h-3 w-3" />
                      )}
                      {t('settings.smtp_test')}
                    </button>
                    <button onClick={() => smtpOpenEdit(cfg)} className="p-1.5 rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20">
                      <Pencil className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Jira Section */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{t('settings.jira_title')}</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{t('settings.jira_description')}</p>
          </div>
          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-3 py-1.5 bg-primary-500 hover:bg-primary-600 text-white rounded-lg text-sm font-medium"
          >
            <Plus className="h-4 w-4" />
            {t('common.add')}
          </button>
        </div>

        {isLoading ? (
          <p className="text-sm text-gray-400">{t('common.loading')}</p>
        ) : configs.length === 0 ? (
          <div className="border border-dashed border-gray-300 dark:border-gray-700 rounded-xl p-8 text-center">
            <p className="text-gray-400 dark:text-gray-500 text-sm">{t('settings.no_jira')}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {configs.map((cfg) => (
              <div key={cfg.id} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900 dark:text-white">{cfg.name}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                        cfg.is_active
                          ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                          : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-500'
                      }`}>
                        {cfg.is_active ? t('common.active') : t('common.inactive')}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-gray-500 dark:text-gray-400">
                      <span>{cfg.base_url}</span>
                      <span>{cfg.email}</span>
                      <span>{t('settings.project_label')}: {cfg.project_key}</span>
                    </div>
                    {testResult[cfg.id] && (
                      <div className={`mt-1.5 flex items-center gap-1 text-xs ${
                        testResult[cfg.id].msg === '...' ? 'text-gray-400' :
                        testResult[cfg.id].success ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                      }`}>
                        {testResult[cfg.id].msg === '...' ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : testResult[cfg.id].success ? (
                          <CheckCircle className="h-3.5 w-3.5" />
                        ) : (
                          <XCircle className="h-3.5 w-3.5" />
                        )}
                        {testResult[cfg.id].msg}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => handleTest(cfg.id)}
                      className="px-2.5 py-1.5 rounded text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 border border-gray-200 dark:border-gray-700"
                    >
                      {t('settings.test_connection')}
                    </button>
                    <button onClick={() => openEdit(cfg)} className="p-1.5 rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20">
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button onClick={() => handleDelete(cfg.id)} className="p-1.5 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Branding */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <Building2 className="h-5 w-5 text-gray-500 dark:text-gray-400" />
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{t('settings.branding_title')}</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{t('settings.branding_description')}</p>
          </div>
        </div>
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-4">
            {branding?.company_logo ? (
              <img src={branding.company_logo} alt="Logo" className="h-12 w-12 object-contain rounded" />
            ) : (
              <div className="h-12 w-12 rounded bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-400 text-xs">Logo</div>
            )}
            <div>
              <input ref={logoInputRef} type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
              <button onClick={() => logoInputRef.current?.click()} disabled={uploadLogo.isPending} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-700 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50">
                <Upload className="h-3.5 w-3.5" />
                {uploadLogo.isPending ? t('common.uploading') : t('settings.upload_logo')}
              </button>
              <p className="text-xs text-gray-400 mt-0.5">{t('settings.logo_format_hint')}</p>
            </div>
          </div>
          <div className="flex items-center gap-4 border-t border-gray-100 dark:border-gray-800 pt-4">
            {branding?.favicon ? (
              <img src={branding.favicon} alt="Favicon" className="h-8 w-8 object-contain rounded" />
            ) : (
              <div className="h-8 w-8 rounded bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-400 text-[10px]">ICO</div>
            )}
            <div>
              <input ref={faviconInputRef} type="file" accept="image/png,image/x-icon,.ico,image/webp" onChange={handleFaviconUpload} className="hidden" />
              <button onClick={() => faviconInputRef.current?.click()} disabled={uploadFavicon.isPending} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-700 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50">
                <Upload className="h-3.5 w-3.5" />
                {uploadFavicon.isPending ? t('common.uploading') : t('settings.upload_favicon')}
              </button>
              <p className="text-xs text-gray-400 mt-0.5">{t('settings.favicon_format_hint')}</p>
            </div>
          </div>
          <form onSubmit={handleBrandingSave} className="space-y-3">
            {brandingError && <p className="text-sm text-red-600 bg-red-50 dark:bg-red-900/20 p-2 rounded">{brandingError}</p>}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('settings.company_name')}</label>
                <input value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder={t('settings.company_name_placeholder')} className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('settings.primary_color')}</label>
                <div className="flex items-center gap-2">
                  <input type="color" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} className="h-9 w-14 rounded border border-gray-300 dark:border-gray-700 cursor-pointer" />
                  <input value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} className="flex-1 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm font-mono text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500" />
                </div>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('settings.jira_base_url')}</label>
              <input
                value={jiraBaseUrl}
                onChange={(e) => setJiraBaseUrl(e.target.value)}
                placeholder={t('settings.jira_base_url_placeholder')}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{t('settings.jira_base_url_hint')}</p>
            </div>
            <div className="flex justify-end">
              <button type="submit" disabled={updateBranding.isPending} className="px-4 py-2 rounded-lg bg-primary-500 hover:bg-primary-600 text-white text-sm font-medium disabled:opacity-50">
                {updateBranding.isPending ? t('common.saving') : t('common.save')}
              </button>
            </div>
          </form>
        </div>
      </section>

      {/* SSL */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-gray-500 dark:text-gray-400" />
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{t('settings.ssl_title')}</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{t('settings.ssl_description')}</p>
            </div>
          </div>
          {sslCerts.some((c) => c.is_active) && (
            <button
              onClick={handleSslReload}
              disabled={reloadSsl.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-700 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
            >
              {reloadSsl.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              {t('settings.ssl_reload')}
            </button>
          )}
        </div>
        {sslReloadMsg && (
          <div className={`mb-3 flex items-center gap-1.5 text-sm p-2 rounded ${sslReloadMsg.ok ? 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-300' : 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400'}`}>
            {sslReloadMsg.ok ? <CheckCircle className="h-4 w-4 shrink-0" /> : <XCircle className="h-4 w-4 shrink-0" />}
            {sslReloadMsg.text}
          </div>
        )}

        {sslCerts.length > 0 && (
          <div className="space-y-2 mb-4">
            {sslCerts.map((cert) => {
              const expiresAt = new Date(cert.expires_at)
              const daysLeft = Math.floor((expiresAt.getTime() - Date.now()) / 86400000)
              return (
                <div key={cert.id} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 flex items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900 dark:text-white">{cert.name}</span>
                      {cert.is_active && <span className="text-xs px-1.5 py-0.5 rounded bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 font-medium">{t('common.active')}</span>}
                    </div>
                    <p className={`text-xs mt-0.5 ${daysLeft < 30 ? 'text-red-500' : 'text-gray-500 dark:text-gray-400'}`}>
                      {t('settings.expires_label')}: {format(expiresAt, 'dd MMM yyyy', { locale: dateLocale })} ({daysLeft > 0 ? t('settings.days_left', { n: daysLeft }) : t('settings.expired')})
                    </p>
                  </div>
                  <div className="flex gap-1">
                    {!cert.is_active && (
                      <button onClick={() => activateCert.mutate(cert.id)} className="px-2.5 py-1.5 rounded text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 border border-gray-200 dark:border-gray-700">{t('settings.activate')}</button>
                    )}
                    {!cert.is_active && (
                      <button onClick={() => { if (confirm(t('settings.confirm_delete_cert'))) deleteCert.mutate(cert.id) }} className="p-1.5 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">{t('settings.upload_cert_title')}</h3>
          <div className="flex gap-2 mb-3">
            {(['pem', 'jks'] as const).map((type) => (
              <button key={type} type="button" onClick={() => setSslUploadType(type)} className={`px-3 py-1.5 rounded-lg text-sm font-medium border ${sslUploadType === type ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300' : 'border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-300'}`}>
                {type.toUpperCase()}
              </button>
            ))}
          </div>
          <form onSubmit={handleSslUpload} className="space-y-3">
            {sslError && <p className="text-sm text-red-600 bg-red-50 dark:bg-red-900/20 p-2 rounded">{sslError}</p>}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('settings.cert_name_label')} *</label>
              <input value={sslName} onChange={(e) => setSslName(e.target.value)} required placeholder={t('settings.cert_name_placeholder')} className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500" />
            </div>
            {sslUploadType === 'pem' ? (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('settings.cert_file_label')}</label>
                  <input type="file" accept=".crt,.pem,.cer" onChange={(e) => setCertFile(e.target.files?.[0] ?? null)} className="w-full text-sm text-gray-600 dark:text-gray-300" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('settings.private_key_label')}</label>
                  <input type="file" accept=".key,.pem" onChange={(e) => setKeyFile(e.target.files?.[0] ?? null)} className="w-full text-sm text-gray-600 dark:text-gray-300" />
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('settings.jks_file_label')}</label>
                  <input type="file" accept=".jks,.p12,.pfx" onChange={(e) => setJksFile(e.target.files?.[0] ?? null)} className="w-full text-sm text-gray-600 dark:text-gray-300" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('auth.password')}</label>
                  <input type="password" value={jksPassword} onChange={(e) => setJksPassword(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500" />
                </div>
              </div>
            )}
            <div className="flex justify-end">
              <button type="submit" disabled={uploadPem.isPending || uploadJks.isPending} className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary-500 hover:bg-primary-600 text-white text-sm font-medium disabled:opacity-50">
                <Upload className="h-4 w-4" />
                {uploadPem.isPending || uploadJks.isPending ? t('common.uploading') : t('common.upload')}
              </button>
            </div>
          </form>
        </div>
      </section>

      {/* Teams Webhooks */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <MessageSquare className="h-5 w-5 text-gray-500 dark:text-gray-400" />
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{t('settings.teams_title')}</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{t('settings.teams_description')}</p>
          </div>
        </div>

        {teamsWebhooks.length > 0 && (
          <div className="space-y-2 mb-4">
            {teamsWebhooks.map((wh) => (
              <div key={wh.id} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 flex items-center justify-between gap-4">
                <div>
                  <span className="font-medium text-gray-900 dark:text-white">{wh.name}</span>
                  <span className={`ml-2 text-xs px-1.5 py-0.5 rounded font-medium ${wh.is_active ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-500'}`}>
                    {wh.is_active ? t('common.active') : t('common.inactive')}
                  </span>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {format(new Date(wh.created_at), 'dd MMM yyyy', { locale: dateLocale })}
                  </p>
                </div>
                <button
                  onClick={() => { if (confirm(t('settings.confirm_delete_webhook'))) deleteWebhook.mutate(wh.id) }}
                  className="p-1.5 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">{t('settings.add_webhook_title')}</h3>
          <form onSubmit={handleWebhookCreate} className="space-y-3">
            {webhookError && <p className="text-sm text-red-600 bg-red-50 dark:bg-red-900/20 p-2 rounded">{webhookError}</p>}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('common.name')} *</label>
                <input
                  value={webhookName}
                  onChange={(e) => setWebhookName(e.target.value)}
                  required
                  placeholder={t('settings.webhook_name_placeholder')}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('settings.webhook_url_label')} *</label>
                <input
                  type="url"
                  value={webhookUrl}
                  onChange={(e) => setWebhookUrl(e.target.value)}
                  required
                  placeholder="https://outlook.office.com/webhook/..."
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
            </div>
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={createWebhook.isPending}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary-500 hover:bg-primary-600 text-white text-sm font-medium disabled:opacity-50"
              >
                <Plus className="h-4 w-4" />
                {createWebhook.isPending ? t('common.adding') : t('common.add')}
              </button>
            </div>
          </form>
        </div>
      </section>

      {/* SMTP Form Modal */}
      {smtpShowForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-md shadow-xl">
            <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-800">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                {smtpEditing ? t('settings.smtp_edit') : t('settings.smtp_add')}
              </h3>
              <button onClick={() => setSmtpShowForm(false)} className="p-1 rounded text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <form onSubmit={smtpHandleSubmit} className="p-6 space-y-4">
              {smtpError && <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 p-3 rounded-lg">{smtpError}</p>}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('settings.smtp_host')} *</label>
                  <input value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)} required placeholder="smtp.gmail.com" className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('settings.smtp_port')} *</label>
                  <input type="number" value={smtpPort} onChange={(e) => setSmtpPort(Number(e.target.value))} required className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('settings.smtp_username_label')} *</label>
                <input value={smtpUsername} onChange={(e) => setSmtpUsername(e.target.value)} required placeholder="user@gmail.com" className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t('settings.smtp_password')}
                  {smtpEditing && <span className="ml-1 text-gray-400 text-xs">{t('settings.api_token_note')}</span>}
                </label>
                <input type="password" value={smtpPassword} onChange={(e) => setSmtpPassword(e.target.value)} required={!smtpEditing} placeholder="••••••••" className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('settings.smtp_from_email')} *</label>
                  <input type="email" value={smtpFromEmail} onChange={(e) => setSmtpFromEmail(e.target.value)} required placeholder="noreply@company.com" className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('settings.smtp_from_name')}</label>
                  <input value={smtpFromName} onChange={(e) => setSmtpFromName(e.target.value)} placeholder="Team App" className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500" />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="smtp_tls"
                  checked={smtpUseTls}
                  disabled={smtpUseSsl}
                  onChange={(e) => { setSmtpUseTls(e.target.checked); if (e.target.checked) setSmtpUseSsl(false) }}
                  className="rounded"
                />
                <label htmlFor="smtp_tls" className={`text-sm ${smtpUseSsl ? 'text-gray-400 dark:text-gray-500' : 'text-gray-700 dark:text-gray-300'}`}>{t('settings.smtp_use_tls')}</label>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="smtp_ssl"
                  checked={smtpUseSsl}
                  disabled={smtpUseTls}
                  onChange={(e) => { setSmtpUseSsl(e.target.checked); if (e.target.checked) setSmtpUseTls(false) }}
                  className="rounded"
                />
                <label htmlFor="smtp_ssl" className={`text-sm ${smtpUseTls ? 'text-gray-400 dark:text-gray-500' : 'text-gray-700 dark:text-gray-300'}`}>SSL (port 465)</label>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setSmtpShowForm(false)} className="flex-1 py-2 px-4 rounded-lg border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 text-sm font-medium">{t('common.cancel')}</button>
                <button type="submit" disabled={createSmtp.isPending || updateSmtp.isPending} className="flex-1 py-2 px-4 rounded-lg bg-primary-500 hover:bg-primary-600 text-white text-sm font-medium disabled:opacity-50">
                  {createSmtp.isPending || updateSmtp.isPending ? t('common.saving') : t('common.save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Jira Config Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-md shadow-xl">
            <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-800">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                {editingConfig ? t('settings.edit_jira') : t('settings.add_jira')}
              </h3>
              <button onClick={() => setShowForm(false)} className="p-1 rounded text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {formError && (
                <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 p-3 rounded-lg">
                  {formError}
                </p>
              )}
              {[
                { label: t('common.name'), value: name, set: setName, placeholder: t('settings.jira_name_placeholder'), required: true },
                { label: t('settings.base_url_label'), value: baseUrl, set: setBaseUrl, placeholder: 'https://myco.atlassian.net', required: true },
                { label: t('auth.email'), value: email, set: setEmail, placeholder: 'admin@myco.com', required: true },
                { label: `${t('settings.api_token_label')}${editingConfig ? ` ${t('settings.api_token_note')}` : ''}`, value: apiToken, set: setApiToken, placeholder: '••••••••', required: !editingConfig },
                { label: t('settings.project_key_label'), value: projectKey, set: setProjectKey, placeholder: 'MYCO', required: true },
              ].map(({ label, value, set, placeholder, required }) => (
                <div key={label}>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{label}</label>
                  <input
                    type={label.startsWith('API') || label.includes('Token') ? 'password' : 'text'}
                    value={value}
                    onChange={(e) => set(e.target.value)}
                    required={required}
                    placeholder={placeholder}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
              ))}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="flex-1 py-2 px-4 rounded-lg border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 text-sm font-medium">
                  {t('common.cancel')}
                </button>
                <button type="submit" disabled={createConfig.isPending || updateConfig.isPending} className="flex-1 py-2 px-4 rounded-lg bg-primary-500 hover:bg-primary-600 text-white text-sm font-medium disabled:opacity-50">
                  {createConfig.isPending || updateConfig.isPending ? t('common.saving') : t('common.save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Work Types Section */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Tag className="h-5 w-5 text-gray-500 dark:text-gray-400" />
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{t('settings.work_types_title')}</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{t('settings.work_types_description')}</p>
            </div>
          </div>
          <button
            onClick={wtOpenCreate}
            className="flex items-center gap-2 px-3 py-1.5 bg-primary-500 hover:bg-primary-600 text-white rounded-lg text-sm font-medium"
          >
            <Plus className="h-4 w-4" />
            {t('settings.add_work_type')}
          </button>
        </div>

        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[480px]">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
                <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">{t('settings.work_type_name')}</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">{t('settings.work_type_sort')}</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">{t('common.status')}</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600 dark:text-gray-400">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {workTypes.length === 0 ? (
                <tr><td colSpan={4} className="text-center py-6 text-gray-400">{t('common.loading')}</td></tr>
              ) : workTypes.map((wt) => (
                <tr key={wt.id} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/30">
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: wt.color }} />
                      <span className="font-medium text-gray-800 dark:text-gray-200">{resolveName(t, wt.name, wt.name_key)}</span>
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{wt.sort_order}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${wt.is_active ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-500'}`}>
                      {wt.is_active ? t('common.active') : t('common.inactive')}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => wtOpenEdit(wt)} className="p-1.5 rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20" title={t('common.edit')}>
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button onClick={() => updateWt.mutateAsync({ id: wt.id, is_active: !wt.is_active })} className="p-1.5 rounded text-gray-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20" title={wt.is_active ? t('common.inactive') : t('common.active')}>
                        {wt.is_active ? <XCircle className="h-4 w-4" /> : <CheckCircle className="h-4 w-4" />}
                      </button>
                      <button onClick={() => wtHandleDelete(wt.id)} className="p-1.5 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20" title={t('common.delete')}>
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>

        {wtShowForm && (
          <div className="mt-4 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
              {wtEditing ? t('settings.edit_work_type') : t('settings.add_work_type')}
            </h3>
            {wtError && <p className="text-sm text-red-600 mb-3">{wtError}</p>}
            <form onSubmit={wtHandleSubmit} className="grid grid-cols-3 gap-3 items-end">
              <div>
                <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">{t('settings.work_type_name')} *</label>
                <input type="text" value={wtName} onChange={(e) => setWtName(e.target.value)} required className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500" />
              </div>
              <div>
                <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">{t('settings.work_type_color')}</label>
                <div className="flex items-center gap-2">
                  <input type="color" value={wtColor} onChange={(e) => setWtColor(e.target.value)} className="w-10 h-9 rounded border border-gray-300 dark:border-gray-700 cursor-pointer" />
                  <input type="text" value={wtColor} onChange={(e) => setWtColor(e.target.value)} className="flex-1 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500" />
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">{t('settings.work_type_sort')}</label>
                <input type="number" value={wtSortOrder} onChange={(e) => setWtSortOrder(parseInt(e.target.value) || 0)} min={0} className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500" />
              </div>
              <div className="col-span-3 flex justify-end gap-2">
                <button type="button" onClick={() => setWtShowForm(false)} className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 text-sm font-medium">{t('common.cancel')}</button>
                <button type="submit" disabled={createWt.isPending || updateWt.isPending} className="px-4 py-2 rounded-lg bg-primary-500 hover:bg-primary-600 text-white text-sm font-medium disabled:opacity-50">
                  {createWt.isPending || updateWt.isPending ? t('common.saving') : t('common.save')}
                </button>
              </div>
            </form>
          </div>
        )}
      </section>

      {/* Kanban Columns Section */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Layers className="h-5 w-5 text-gray-500 dark:text-gray-400" />
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{t('settings.columns_title')}</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{t('settings.columns_description')}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {boardsData.length > 1 && (
              <select
                value={selectedBoardId}
                onChange={(e) => setSelectedBoardId(e.target.value)}
                className="text-sm px-2 py-1.5 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200"
              >
                <option value="">{t('kanban.boards_title')}</option>
                {boardsData.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            )}
            <button
              onClick={colOpenCreate}
              className="flex items-center gap-2 px-3 py-1.5 bg-primary-500 hover:bg-primary-600 text-white rounded-lg text-sm font-medium"
            >
              <Plus className="h-4 w-4" />
              {t('settings.add_column')}
            </button>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[480px]">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
                <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">{t('settings.column_name_label')}</th>
                {!selectedBoardId && <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">{t('kanban.boards_title')}</th>}
                <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">{t('settings.column_sort_label')}</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">{t('settings.column_terminal_label')}</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600 dark:text-gray-400">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {[...columnsData].sort((a, b) => a.sort_order - b.sort_order).map((col) => (
                <tr key={col.id} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/30">
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-2">
                      <span className="w-3 h-3 rounded flex-shrink-0" style={{ backgroundColor: col.color }} />
                      <span className="font-medium text-gray-800 dark:text-gray-200">{resolveName(t, col.name, col.name_key)}</span>
                    </span>
                  </td>
                  {!selectedBoardId && (
                    <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400">
                      {boardsData.find(b => b.id === col.board_id)?.name ?? '—'}
                    </td>
                  )}
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{col.sort_order}</td>
                  <td className="px-4 py-3">
                    {col.is_terminal ? (
                      <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                        {t('kanban.archived')}
                      </span>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => colOpenEdit(col)} className="p-1.5 rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20" title={t('common.edit')}>
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button onClick={() => colHandleDelete(col.id)} className="p-1.5 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20" title={t('common.delete')}>
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>

        {colShowForm && (
          <div className="mt-4 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
              {colEditing ? t('settings.edit_column') : t('settings.add_column')}
            </h3>
            {colError && <p className="text-sm text-red-600 mb-3">{colError}</p>}
            <form onSubmit={colHandleSubmit} className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">{t('settings.column_name_label')} *</label>
                  <input type="text" value={colName} onChange={(e) => setColName(e.target.value)} required className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500" />
                </div>
                <div>
                  <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">{t('settings.column_color_label')}</label>
                  <div className="flex items-center gap-2">
                    <input type="color" value={colColor} onChange={(e) => setColColor(e.target.value)} className="w-10 h-9 rounded border border-gray-300 dark:border-gray-700 cursor-pointer" />
                    <input type="text" value={colColor} onChange={(e) => setColColor(e.target.value)} className="flex-1 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">{t('settings.column_sort_label')}</label>
                  <input type="number" value={colSortOrder} onChange={(e) => setColSortOrder(parseInt(e.target.value) || 0)} min={0} className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500" />
                </div>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={colIsTerminal} onChange={(e) => setColIsTerminal(e.target.checked)} className="w-4 h-4 rounded text-primary-500 border-gray-300" />
                <span className="text-sm text-gray-700 dark:text-gray-300">{t('settings.column_terminal_label')}</span>
                <span className="text-xs text-gray-400">({t('settings.column_terminal_hint')})</span>
              </label>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setColShowForm(false)} className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 text-sm font-medium">{t('common.cancel')}</button>
                <button type="submit" disabled={createCol.isPending || updateCol.isPending} className="px-4 py-2 rounded-lg bg-primary-500 hover:bg-primary-600 text-white text-sm font-medium disabled:opacity-50">
                  {createCol.isPending || updateCol.isPending ? t('common.saving') : t('common.save')}
                </button>
              </div>
            </form>
          </div>
        )}
      </section>

      {/* Task Labels Section */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Tag className="h-5 w-5 text-gray-500 dark:text-gray-400" />
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{t('kanban.manage_labels')}</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{t('settings.labels_description', 'Manage task labels for filtering and categorization.')}</p>
            </div>
          </div>
          <button
            onClick={labelOpenCreate}
            className="flex items-center gap-2 px-3 py-1.5 bg-primary-500 hover:bg-primary-600 text-white rounded-lg text-sm font-medium"
          >
            <Plus className="h-4 w-4" />
            {t('kanban.create_label')}
          </button>
        </div>

        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
          {labelsData.length === 0 ? (
            <div className="text-center py-8 text-gray-400 dark:text-gray-500 text-sm">{t('kanban.no_labels')}</div>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {labelsData.map((label) => (
                <div key={label.id} className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/30">
                  <span className="flex items-center gap-3">
                    <span className="w-4 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: label.color }} />
                    <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{label.name}</span>
                    <span className="text-xs text-gray-400 font-mono">{label.color}</span>
                  </span>
                  <div className="flex items-center gap-1">
                    <button onClick={() => labelOpenEdit(label)} className="p-1.5 rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20" title={t('common.edit')}>
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button onClick={() => labelHandleDelete(label.id)} className="p-1.5 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20" title={t('common.delete')}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {labelShowForm && (
          <div className="mt-4 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
              {labelEditing ? t('kanban.edit_label') : t('kanban.create_label')}
            </h3>
            {labelError && <p className="text-sm text-red-600 mb-3">{labelError}</p>}
            <form onSubmit={labelHandleSubmit} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">{t('kanban.label_name')} *</label>
                  <input type="text" value={labelName} onChange={(e) => setLabelName(e.target.value)} required className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500" />
                </div>
                <div>
                  <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">{t('kanban.label_color')}</label>
                  <div className="flex items-center gap-2">
                    <input type="color" value={labelColor} onChange={(e) => setLabelColor(e.target.value)} className="w-10 h-9 rounded border border-gray-300 dark:border-gray-700 cursor-pointer" />
                    <input type="text" value={labelColor} onChange={(e) => setLabelColor(e.target.value)} className="flex-1 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500" />
                  </div>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setLabelShowForm(false)} className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 text-sm font-medium">{t('common.cancel')}</button>
                <button type="submit" disabled={createLabel.isPending || updateLabel.isPending} className="px-4 py-2 rounded-lg bg-primary-500 hover:bg-primary-600 text-white text-sm font-medium disabled:opacity-50">
                  {createLabel.isPending || updateLabel.isPending ? t('common.saving') : t('common.save')}
                </button>
              </div>
            </form>
          </div>
        )}
      </section>
    </div>
  )
}
