import { useState, useRef, useEffect } from 'react'
import { Download, ChevronDown, FileText, FileSpreadsheet } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { ExportFormat } from '@/api/export'

interface Props {
  onExport: (format: ExportFormat) => Promise<void>
  label?: string
  disabled?: boolean
}

export default function ExportButton({ onExport, label, disabled }: Props) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  async function handleExport(format: ExportFormat) {
    setOpen(false)
    setLoading(true)
    try {
      await onExport(format)
    } catch (err: any) {
      alert(err?.response?.data?.detail || t('common.error'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div ref={ref} className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={disabled || loading}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 transition-colors"
      >
        {loading ? (
          <span className="animate-spin inline-block w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full" />
        ) : (
          <Download className="h-4 w-4" />
        )}
        {label ?? t('common.export')}
        <ChevronDown className="h-3 w-3 text-gray-400" />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-40 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-30 overflow-hidden">
          <button
            type="button"
            onClick={() => handleExport('csv')}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            <FileText className="h-4 w-4 text-gray-400" />
            CSV
          </button>
          <button
            type="button"
            onClick={() => handleExport('excel')}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            <FileSpreadsheet className="h-4 w-4 text-green-500" />
            Excel
          </button>
        </div>
      )}
    </div>
  )
}
