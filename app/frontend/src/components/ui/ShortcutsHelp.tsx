import { X } from 'lucide-react'
import { useTranslation } from 'react-i18next'

interface Props {
  open: boolean
  onClose: () => void
}

export default function ShortcutsHelp({ open, onClose }: Props) {
  const { t } = useTranslation()

  if (!open) return null

  const shortcuts = [
    { keys: ['Ctrl', 'K'], action: t('shortcuts.search') },
    { keys: ['g', 'd'], action: t('nav.dashboard') },
    { keys: ['g', 'w'], action: t('nav.worklog') },
    { keys: ['g', 'k'], action: t('nav.kanban') },
    { keys: ['g', 'r'], action: t('nav.reports') },
    { keys: ['g', 'p'], action: t('profile.title') },
    { keys: ['?'], action: t('shortcuts.show_help') },
  ]

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-sm border border-gray-200 dark:border-gray-700 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-800">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">
            {t('shortcuts.title')}
          </h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-3">
          {shortcuts.map((s, i) => (
            <div key={i} className="flex items-center justify-between">
              <span className="text-sm text-gray-600 dark:text-gray-400">{s.action}</span>
              <div className="flex items-center gap-1">
                {s.keys.map((k, j) => (
                  <kbd
                    key={j}
                    className="px-2 py-0.5 text-xs bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded border border-gray-200 dark:border-gray-700 font-mono"
                  >
                    {k}
                  </kbd>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
