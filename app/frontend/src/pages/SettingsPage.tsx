import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Pencil, Trash2, CheckCircle, XCircle, Loader2, ExternalLink } from 'lucide-react'
import {
  useJiraConfigs,
  useCreateJiraConfig,
  useUpdateJiraConfig,
  useDeleteJiraConfig,
  useTestJiraConnection,
  type JiraConfig,
} from '@/api/jira'

export default function SettingsPage() {
  const { t } = useTranslation()
  const { data: configs = [], isLoading } = useJiraConfigs()
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
        msg: result.success ? (result.project_name ?? 'Bağlantı başarılı') : (result.error ?? 'Bağlantı başarısız'),
      },
    }))
  }

  return (
    <div className="space-y-8 max-w-3xl">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Ayarlar</h1>

      {/* Jira Section */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Jira Entegrasyonu</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              Görevlerdeki Jira ticket durumlarını otomatik çekmek için yapılandırın.
            </p>
          </div>
          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-3 py-1.5 bg-primary-500 hover:bg-primary-600 text-white rounded-lg text-sm font-medium"
          >
            <Plus className="h-4 w-4" />
            Ekle
          </button>
        </div>

        {isLoading ? (
          <p className="text-sm text-gray-400">{t('common.loading')}</p>
        ) : configs.length === 0 ? (
          <div className="border border-dashed border-gray-300 dark:border-gray-700 rounded-xl p-8 text-center">
            <p className="text-gray-400 dark:text-gray-500 text-sm">Henüz Jira yapılandırması yok.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {configs.map((cfg) => (
              <div
                key={cfg.id}
                className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900 dark:text-white">{cfg.name}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                        cfg.is_active
                          ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                          : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-500'
                      }`}>
                        {cfg.is_active ? 'Aktif' : 'Pasif'}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-gray-500 dark:text-gray-400">
                      <span>{cfg.base_url}</span>
                      <span>{cfg.email}</span>
                      <span>Proje: {cfg.project_key}</span>
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
                      Test
                    </button>
                    <button
                      onClick={() => openEdit(cfg)}
                      className="p-1.5 rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(cfg.id)}
                      className="p-1.5 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Jira Config Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-md shadow-xl">
            <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-800">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                {editingConfig ? 'Jira Yapılandırmasını Düzenle' : 'Jira Yapılandırması Ekle'}
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
                { label: 'Ad', value: name, set: setName, placeholder: 'Üretim Jira', required: true },
                { label: 'Base URL', value: baseUrl, set: setBaseUrl, placeholder: 'https://myco.atlassian.net', required: true },
                { label: 'E-posta', value: email, set: setEmail, placeholder: 'admin@myco.com', required: true },
                { label: `API Token${editingConfig ? ' (boş bırakın = değiştirme)' : ''}`, value: apiToken, set: setApiToken, placeholder: '••••••••', required: !editingConfig },
                { label: 'Proje Anahtarı', value: projectKey, set: setProjectKey, placeholder: 'MYCO', required: true },
              ].map(({ label, value, set, placeholder, required }) => (
                <div key={label}>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{label}</label>
                  <input
                    type={label.startsWith('API') ? 'password' : 'text'}
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
                  {createConfig.isPending || updateConfig.isPending ? t('common.loading') : t('common.save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
