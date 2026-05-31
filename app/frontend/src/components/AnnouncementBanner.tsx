import { useState, useEffect } from 'react'
import { X, Info, AlertTriangle, AlertCircle, CheckCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useActiveAnnouncements, type Announcement } from '@/api/announcements'

function localizedText(tr: string, en: string | null, lang: string): string {
  if (lang === 'en') return en?.trim() || tr
  return tr
}

const STORAGE_KEY = 'dismissed_announcements'

function getDismissed(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return new Set(raw ? JSON.parse(raw) : [])
  } catch {
    return new Set()
  }
}

function saveDismissed(ids: Set<string>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]))
}

const typeConfig = {
  info: {
    bg: 'bg-blue-50 dark:bg-blue-900/30',
    border: 'border-blue-200 dark:border-blue-700',
    text: 'text-blue-800 dark:text-blue-200',
    icon: Info,
    iconClass: 'text-blue-500',
  },
  warning: {
    bg: 'bg-amber-50 dark:bg-amber-900/30',
    border: 'border-amber-200 dark:border-amber-700',
    text: 'text-amber-800 dark:text-amber-200',
    icon: AlertTriangle,
    iconClass: 'text-amber-500',
  },
  error: {
    bg: 'bg-red-50 dark:bg-red-900/30',
    border: 'border-red-200 dark:border-red-700',
    text: 'text-red-800 dark:text-red-200',
    icon: AlertCircle,
    iconClass: 'text-red-500',
  },
  success: {
    bg: 'bg-green-50 dark:bg-green-900/30',
    border: 'border-green-200 dark:border-green-700',
    text: 'text-green-800 dark:text-green-200',
    icon: CheckCircle,
    iconClass: 'text-green-500',
  },
}

function AnnouncementItem({
  ann,
  onDismiss,
}: {
  ann: Announcement
  onDismiss: (id: string) => void
}) {
  const { t, i18n } = useTranslation()
  const cfg = typeConfig[ann.type] ?? typeConfig.info
  const Icon = cfg.icon
  const displayTitle = localizedText(ann.title, ann.title_en, i18n.language)
  const displayMessage = localizedText(ann.message, ann.message_en, i18n.language)

  return (
    <div
      className={`flex items-start gap-3 px-4 py-3 border-b last:border-b-0 ${cfg.bg} ${cfg.border} ${cfg.text}`}
    >
      <Icon className={`h-4 w-4 mt-0.5 flex-shrink-0 ${cfg.iconClass}`} />
      <div className="flex-1 min-w-0">
        {displayTitle && (
          <span className="font-semibold mr-2">{displayTitle}:</span>
        )}
        <span className="text-sm">{displayMessage}</span>
      </div>
      <button
        onClick={() => onDismiss(ann.id)}
        title={t('common.dismiss')}
        className={`flex-shrink-0 p-0.5 rounded hover:opacity-70 ${cfg.text}`}
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}

export default function AnnouncementBanner() {
  const { data: announcements = [] } = useActiveAnnouncements()
  const [dismissed, setDismissed] = useState<Set<string>>(getDismissed)

  // Clean up stale dismissed IDs when new announcements arrive
  useEffect(() => {
    if (announcements.length === 0) return
    const activeIds = new Set(announcements.map((a) => a.id))
    const cleaned = new Set([...dismissed].filter((id) => activeIds.has(id)))
    if (cleaned.size !== dismissed.size) {
      setDismissed(cleaned)
      saveDismissed(cleaned)
    }
  }, [announcements]) // eslint-disable-line react-hooks/exhaustive-deps

  const visible = announcements.filter((a) => !dismissed.has(a.id))

  if (visible.length === 0) return null

  function dismiss(id: string) {
    const next = new Set(dismissed)
    next.add(id)
    setDismissed(next)
    saveDismissed(next)
  }

  return (
    <div className="border-b border-gray-200 dark:border-gray-800">
      {visible.map((ann) => (
        <AnnouncementItem key={ann.id} ann={ann} onDismiss={dismiss} />
      ))}
    </div>
  )
}
