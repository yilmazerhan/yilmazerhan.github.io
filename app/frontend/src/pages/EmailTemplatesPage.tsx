import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Eye, Lock, Pencil, Plus, Trash2 } from 'lucide-react'
import Editor from '@monaco-editor/react'
import type * as Monaco from 'monaco-editor'
import {
  useEmailTemplates,
  useCreateEmailTemplate,
  useUpdateEmailTemplate,
  useDeleteEmailTemplate,
  usePreviewEmailTemplate,
  type EmailTemplate,
} from '@/api/email'
import { useThemeStore } from '@/store/themeStore'

export default function EmailTemplatesPage() {
  const { t } = useTranslation()
  const theme = useThemeStore((s) => s.theme)

  const { data: templates = [], isLoading } = useEmailTemplates()
  const createTemplate = useCreateEmailTemplate()
  const updateTemplate = useUpdateEmailTemplate()
  const deleteTemplate = useDeleteEmailTemplate()
  const previewTemplate = usePreviewEmailTemplate()

  const [editing, setEditing] = useState<EmailTemplate | null>(null)
  const [isNew, setIsNew] = useState(false)
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [subject, setSubject] = useState('')
  const [htmlBody, setHtmlBody] = useState('')
  const [previewHtml, setPreviewHtml] = useState<string | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [error, setError] = useState('')

  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null)
  const isEditorOpen = editing !== null || isNew
  const isEditMode = editing !== null

  function openCreate() {
    setEditing(null); setIsNew(true)
    setName(''); setSlug(''); setSubject('')
    setHtmlBody('<!DOCTYPE html>\n<html>\n<body>\n<p>Hello {{ full_name }},</p>\n</body>\n</html>')
    setPreviewHtml(null); setError('')
  }

  function openEdit(tmpl: EmailTemplate) {
    setEditing(tmpl); setIsNew(false)
    setName(tmpl.name); setSlug(tmpl.slug); setSubject(tmpl.subject); setHtmlBody(tmpl.html_body)
    setPreviewHtml(null); setError('')
  }

  function closeEditor() {
    setEditing(null); setIsNew(false)
    setPreviewHtml(null); setError('')
  }

  async function handleSave() {
    setError('')
    if (!name.trim()) { setError(t('email.name_required')); return }
    if (!isEditMode && !slug.trim()) { setError(t('email.slug_required')); return }
    try {
      if (isEditMode && editing) {
        await updateTemplate.mutateAsync({ id: editing.id, name, subject, html_body: htmlBody })
      } else {
        await createTemplate.mutateAsync({ name, slug, subject, html_body: htmlBody })
      }
      closeEditor()
    } catch (err: any) {
      setError(err.response?.data?.detail || t('common.error'))
    }
  }

  async function handlePreview() {
    if (!isEditMode) {
      setPreviewHtml(htmlBody)
      return
    }
    setPreviewLoading(true)
    try {
      const result = await previewTemplate.mutateAsync({ id: editing!.id, variables: {} })
      setPreviewHtml(result.html)
    } catch {
      setPreviewHtml(htmlBody)
    } finally {
      setPreviewLoading(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm(t('email.confirm_delete'))) return
    try { await deleteTemplate.mutateAsync(id) }
    catch (err: any) { alert(err.response?.data?.detail || t('email.delete_failed')) }
  }

  function insertVariable(varName: string) {
    const editor = editorRef.current
    if (!editor) return
    editor.trigger('keyboard', 'type', { text: `{{ ${varName} }}` })
    editor.focus()
  }

  const availableVars = editing?.available_vars ?? null
  const isSaving = createTemplate.isPending || updateTemplate.isPending

  if (isEditorOpen) {
    return (
      <div className="flex flex-col -m-6" style={{ height: 'calc(100vh - 4rem)' }}>
        {/* Top bar */}
        <div className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 flex-shrink-0">
          <button
            onClick={closeEditor}
            className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white whitespace-nowrap"
          >
            <ArrowLeft className="h-4 w-4" />
            {t('common.back')}
          </button>

          <div className="flex-1 flex items-center gap-2 min-w-0">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('email.name_placeholder')}
              className="px-2 py-1.5 rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 w-40"
            />
            <input
              value={slug}
              disabled={isEditMode}
              placeholder="task-due-soon"
              onChange={(e) => setSlug(e.target.value)}
              className="px-2 py-1.5 rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm font-mono text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-primary-500 w-36 disabled:opacity-50"
            />
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder={t('email.subject_placeholder')}
              className="px-2 py-1.5 rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 flex-1 min-w-0"
            />
          </div>

          {error && <span className="text-xs text-red-500 whitespace-nowrap">{error}</span>}

          <button
            onClick={handlePreview}
            disabled={previewLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-700 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 whitespace-nowrap"
          >
            <Eye className="h-4 w-4" />
            {t('email.preview')}
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="px-4 py-1.5 rounded-lg bg-primary-500 hover:bg-primary-600 text-white text-sm font-medium disabled:opacity-50 whitespace-nowrap"
          >
            {isSaving ? t('common.saving') : t('common.save')}
          </button>
        </div>

        {/* Split pane */}
        <div className="flex flex-1 min-h-0">
          {/* Editor */}
          <div className="flex flex-col w-1/2 border-r border-gray-200 dark:border-gray-800 min-h-0">
            {availableVars && Object.keys(availableVars).length > 0 && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-800 flex-shrink-0 flex-wrap">
                <span className="text-xs text-gray-500 dark:text-gray-400 mr-1">{t('email.variables_label')}:</span>
                {Object.entries(availableVars).map(([key, desc]) => (
                  <button
                    key={key}
                    onClick={() => insertVariable(key)}
                    title={String(desc)}
                    className="px-1.5 py-0.5 rounded text-xs font-mono bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 hover:bg-primary-200 dark:hover:bg-primary-800/40"
                  >
                    {'{{ ' + key + ' }}'}
                  </button>
                ))}
              </div>
            )}
            <div className="flex-1 min-h-0">
              <Editor
                height="100%"
                language="html"
                value={htmlBody}
                theme={theme === 'dark' ? 'vs-dark' : 'vs'}
                onChange={(val) => setHtmlBody(val ?? '')}
                onMount={(editor) => { editorRef.current = editor }}
                options={{
                  minimap: { enabled: false },
                  fontSize: 13,
                  wordWrap: 'on',
                  lineNumbers: 'on',
                  scrollBeyondLastLine: false,
                  padding: { top: 8 },
                  automaticLayout: true,
                }}
              />
            </div>
          </div>

          {/* Preview */}
          <div className="flex flex-col w-1/2 min-h-0">
            <div className="px-3 py-1.5 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-800 flex-shrink-0">
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{t('email.preview_panel')}</span>
            </div>
            {previewHtml ? (
              <iframe
                srcDoc={previewHtml}
                className="flex-1 w-full bg-white"
                sandbox="allow-same-origin"
                title="template-preview"
              />
            ) : (
              <div className="flex-1 flex items-center justify-center">
                <p className="text-sm text-gray-400 dark:text-gray-500 text-center px-4">
                  {t('email.preview_hint')}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('email.templates_title')}</h1>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-lg text-sm font-medium"
        >
          <Plus className="h-4 w-4" /> {t('email.add_template')}
        </button>
      </div>

      {isLoading ? (
        <p className="text-gray-400">{t('common.loading')}</p>
      ) : (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
                <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">{t('email.name_label')}</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">{t('email.slug_label')}</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">{t('email.subject_label')}</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600 dark:text-gray-400">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {templates.map((tmpl) => (
                <tr key={tmpl.id} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/30">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {tmpl.is_system && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400">
                          <Lock className="h-3 w-3" /> {t('email.system_badge')}
                        </span>
                      )}
                      <span className="font-medium text-gray-900 dark:text-white">{tmpl.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-500 dark:text-gray-400">{tmpl.slug}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400 max-w-xs truncate">{tmpl.subject}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => openEdit(tmpl)}
                        className="p-1.5 rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                        title={t('common.edit')}
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      {!tmpl.is_system && (
                        <button
                          onClick={() => handleDelete(tmpl.id)}
                          className="p-1.5 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
                          title={t('common.delete')}
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
    </div>
  )
}
