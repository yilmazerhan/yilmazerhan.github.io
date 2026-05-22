import { useState } from 'react'
import { Plus, Pencil, Trash2, Eye, Lock } from 'lucide-react'
import {
  useEmailTemplates,
  useCreateEmailTemplate,
  useUpdateEmailTemplate,
  useDeleteEmailTemplate,
  usePreviewEmailTemplate,
  type EmailTemplate,
} from '@/api/email'

export default function EmailTemplatesPage() {
  const { data: templates = [], isLoading } = useEmailTemplates()
  const createTemplate = useCreateEmailTemplate()
  const updateTemplate = useUpdateEmailTemplate()
  const deleteTemplate = useDeleteEmailTemplate()
  const previewTemplate = usePreviewEmailTemplate()

  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<EmailTemplate | null>(null)
  const [previewHtml, setPreviewHtml] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [subject, setSubject] = useState('')
  const [htmlBody, setHtmlBody] = useState('')
  const [error, setError] = useState('')

  function openCreate() {
    setEditing(null); setName(''); setSlug(''); setSubject(''); setHtmlBody(''); setError('')
    setShowForm(true)
  }

  function openEdit(tmpl: EmailTemplate) {
    setEditing(tmpl); setName(tmpl.name); setSlug(tmpl.slug); setSubject(tmpl.subject); setHtmlBody(tmpl.html_body); setError('')
    setShowForm(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setError('')
    try {
      if (editing) {
        await updateTemplate.mutateAsync({ id: editing.id, name, subject, html_body: htmlBody })
      } else {
        await createTemplate.mutateAsync({ name, slug, subject, html_body: htmlBody })
      }
      setShowForm(false)
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Bir hata oluştu.')
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Bu şablonu silmek istediğinizden emin misiniz?')) return
    try { await deleteTemplate.mutateAsync(id) }
    catch (err: any) { alert(err.response?.data?.detail || 'Silinemedi.') }
  }

  async function handlePreview(tmpl: EmailTemplate) {
    const result = await previewTemplate.mutateAsync({ id: tmpl.id, variables: {} })
    setPreviewHtml(result.html)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">E-posta Şablonları</h1>
        <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-lg text-sm font-medium">
          <Plus className="h-4 w-4" /> Şablon Ekle
        </button>
      </div>

      {isLoading ? (
        <p className="text-gray-400">Yükleniyor...</p>
      ) : (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
                <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Ad</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Slug</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Konu</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600 dark:text-gray-400">İşlemler</th>
              </tr>
            </thead>
            <tbody>
              {templates.map((tmpl) => (
                <tr key={tmpl.id} className="border-b border-gray-100 dark:border-gray-800">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {tmpl.is_system && <Lock className="h-3.5 w-3.5 text-gray-400" title="Sistem şablonu" />}
                      <span className="font-medium text-gray-900 dark:text-white">{tmpl.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-500 dark:text-gray-400">{tmpl.slug}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400 max-w-xs truncate">{tmpl.subject}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => handlePreview(tmpl)} className="p-1.5 rounded text-gray-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20" title="Önizle">
                        <Eye className="h-4 w-4" />
                      </button>
                      <button onClick={() => openEdit(tmpl)} className="p-1.5 rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20">
                        <Pencil className="h-4 w-4" />
                      </button>
                      {!tmpl.is_system && (
                        <button onClick={() => handleDelete(tmpl.id)} className="p-1.5 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20">
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

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-2xl shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-800">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{editing ? 'Şablonu Düzenle' : 'Şablon Ekle'}</h2>
              <button onClick={() => setShowForm(false)} className="p-1 rounded text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {error && <p className="text-sm text-red-600 bg-red-50 dark:bg-red-900/20 p-3 rounded-lg">{error}</p>}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Ad *</label>
                  <input value={name} onChange={(e) => setName(e.target.value)} required className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Slug *</label>
                  <input value={slug} onChange={(e) => setSlug(e.target.value)} required disabled={!!editing} placeholder="task-due-soon" className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-60" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Konu (Jinja2 şablonu) *</label>
                <input value={subject} onChange={(e) => setSubject(e.target.value)} required placeholder="Görev yaklaşıyor: {{ task_title }}" className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">HTML Gövde (Jinja2 şablonu) *</label>
                <textarea
                  value={htmlBody}
                  onChange={(e) => setHtmlBody(e.target.value)}
                  required
                  rows={10}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm font-mono text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 resize-y"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="flex-1 py-2 px-4 rounded-lg border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 text-sm font-medium">İptal</button>
                <button type="submit" disabled={createTemplate.isPending || updateTemplate.isPending} className="flex-1 py-2 px-4 rounded-lg bg-primary-500 hover:bg-primary-600 text-white text-sm font-medium disabled:opacity-50">
                  {createTemplate.isPending || updateTemplate.isPending ? 'Kaydediliyor...' : 'Kaydet'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Preview Modal */}
      {previewHtml !== null && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-2xl shadow-xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-800">
              <h3 className="font-semibold text-gray-900 dark:text-white">Şablon Önizleme</h3>
              <button onClick={() => setPreviewHtml(null)} className="p-1 rounded text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <iframe
              srcDoc={previewHtml}
              className="flex-1 w-full"
              sandbox="allow-same-origin"
              title="template-preview"
            />
          </div>
        </div>
      )}
    </div>
  )
}
