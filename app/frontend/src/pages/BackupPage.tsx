import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Download, Database, AlertCircle } from 'lucide-react'
import apiClient from '@/api/client'

export default function BackupPage() {
  const { t } = useTranslation()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleDownload() {
    setLoading(true)
    setError('')
    try {
      const response = await apiClient.get('/admin/backup/download', { responseType: 'blob' })
      const contentDisposition = response.headers['content-disposition'] ?? ''
      const match = contentDisposition.match(/filename="?([^"]+)"?/)
      const filename = match ? match[1] : 'backup.sql'
      const url = URL.createObjectURL(new Blob([response.data]))
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
    } catch (err: any) {
      if (err.response?.status === 501) {
        setError(t('backup.error_no_pgdump'))
      } else {
        setError(t('backup.error_failed'))
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('backup.title')}</h1>

      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 space-y-5">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center flex-shrink-0">
            <Database className="h-6 w-6 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200">{t('backup.section_title')}</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{t('backup.description')}</p>
          </div>
        </div>

        <ul className="space-y-1.5 text-sm text-gray-600 dark:text-gray-400 border-l-2 border-gray-200 dark:border-gray-700 pl-4">
          <li>{t('backup.note_format')}</li>
          <li>{t('backup.note_includes')}</li>
          <li>{t('backup.note_restore')}</li>
        </ul>

        {error && (
          <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 text-sm">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            {error}
          </div>
        )}

        <button
          onClick={handleDownload}
          disabled={loading}
          className="flex items-center gap-2 px-5 py-2.5 bg-primary-500 hover:bg-primary-600 disabled:opacity-60 text-white rounded-lg text-sm font-medium"
        >
          <Download className="h-4 w-4" />
          {loading ? t('backup.downloading') : t('backup.download')}
        </button>
      </div>
    </div>
  )
}
