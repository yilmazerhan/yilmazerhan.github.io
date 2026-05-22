import { useState, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { format } from 'date-fns'
import { tr, enUS } from 'date-fns/locale'
import { Plus, Pencil, Trash2, CheckCircle, XCircle, Loader2, ShieldCheck, Upload, Building2, MessageSquare } from 'lucide-react'
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
  useBranding,
  useUpdateBranding,
  useUploadLogo,
} from '@/api/admin'
import {
  useTeamsWebhooks,
  useCreateTeamsWebhook,
  useDeleteTeamsWebhook,
} from '@/api/email'

export default function SettingsPage() {
  const { t, i18n } = useTranslation()
  const dateLocale = i18n.language === 'tr' ? tr : enUS

  const { data: configs = [], isLoading } = useJiraConfigs()
  const { data: sslCerts = [] } = useSslCertificates()
  const { data: branding } = useBranding()
  const activateCert = useActivateCertificate()
  const deleteCert = useDeleteCertificate()
  const uploadPem = useUploadPem()
  const uploadJks = useUploadJks()
  const updateBranding = useUpdateBranding()
  const uploadLogo = useUploadLogo()
  const logoInputRef = useRef<HTMLInputElement>(null)

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
  const [brandingError, setBrandingError] = useState('')

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

  async function handleBrandingSave(e: React.FormEvent) {
    e.preventDefault(); setBrandingError('')
    try {
      await updateBranding.mutateAsync({ company_name: companyName, primary_color: primaryColor })
    } catch (err: any) { setBrandingError(err.response?.data?.detail || t('settings.save_failed')) }
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    try { await uploadLogo.mutateAsync(file) }
    catch (err: any) { alert(err.response?.data?.detail || t('settings.logo_failed')) }
  }

  const createConfig = useCreateJiraConfig()
  const updateConfig = useUpdateJiraConfig()
  const deleteConfig = useDeleteJiraConfig()
  const testConnection = useTestJiraConnection()

  const [showForm, setShowForm] = useState(false)
  const [editingConfig, setEditingConfig] = useState<JiraConfig | null>(null)
  const [testResult, setTestResult] = useState<Record<string, { success: boolean; msg: string }>>({})

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
        <div className="flex items-center gap-2 mb-4">
          <ShieldCheck className="h-5 w-5 text-gray-500 dark:text-gray-400" />
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{t('settings.ssl_title')}</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{t('settings.ssl_description')}</p>
          </div>
        </div>

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
    </div>
  )
}
