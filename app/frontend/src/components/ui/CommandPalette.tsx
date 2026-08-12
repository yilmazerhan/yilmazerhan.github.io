import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  Search, LayoutDashboard, ClipboardList, Kanban, Users, Users2,
  Settings, BarChart3, ShieldCheck, Mail, ScrollText, UserCircle,
} from 'lucide-react'
import { useAuthStore } from '@/store/authStore'

interface CommandItem {
  id: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  action: () => void
  adminOnly?: boolean
}

interface Props {
  open: boolean
  onClose: () => void
}

export default function CommandPalette({ open, onClose }: Props) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  function go(path: string) {
    navigate(path)
    onClose()
    setQuery('')
  }

  const ALL_ITEMS: CommandItem[] = [
    { id: 'dashboard', label: t('nav.dashboard'), icon: LayoutDashboard, action: () => go('/') },
    { id: 'worklog', label: t('nav.worklog'), icon: ClipboardList, action: () => go('/worklog') },
    { id: 'kanban', label: t('nav.kanban'), icon: Kanban, action: () => go('/kanban') },
    { id: 'reports', label: t('nav.reports'), icon: BarChart3, action: () => go('/reports') },
    { id: 'profile', label: t('profile.title'), icon: UserCircle, action: () => go('/profile') },
    { id: 'users', label: t('nav.users'), icon: Users, action: () => go('/users'), adminOnly: true },
    { id: 'teams', label: t('nav.teams'), icon: Users2, action: () => go('/teams'), adminOnly: true },
    { id: 'permissions', label: t('nav.permissions'), icon: ShieldCheck, action: () => go('/permissions'), adminOnly: true },
    { id: 'email', label: t('nav.email'), icon: Mail, action: () => go('/settings/email/workflows'), adminOnly: true },
    { id: 'settings', label: t('nav.settings'), icon: Settings, action: () => go('/settings'), adminOnly: true },
    { id: 'audit', label: t('nav.auditLogs'), icon: ScrollText, action: () => go('/admin/audit-logs'), adminOnly: true },
  ]

  const isSuperAdmin = user?.role === 'superadmin'
  const items = ALL_ITEMS
    .filter((i) => !i.adminOnly || isSuperAdmin)
    .filter((i) => !query || i.label.toLowerCase().includes(query.toLowerCase()))

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 30)
      setQuery('')
      setSelected(0)
    }
  }, [open])

  useEffect(() => { setSelected(0) }, [query])

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelected((s) => Math.min(s + 1, items.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSelected((s) => Math.max(s - 1, 0)) }
    else if (e.key === 'Enter' && items[selected]) items[selected].action()
    else if (e.key === 'Escape') onClose()
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center pt-[15vh]"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-lg mx-4 border border-gray-200 dark:border-gray-700 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200 dark:border-gray-800">
          <Search className="h-5 w-5 text-gray-400 flex-shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('search.placeholder')}
            className="flex-1 bg-transparent text-gray-900 dark:text-white placeholder-gray-400 text-sm outline-none"
          />
          <kbd className="text-xs px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-500 rounded border border-gray-200 dark:border-gray-700 font-mono">
            Esc
          </kbd>
        </div>

        {/* Results */}
        <div className="max-h-80 overflow-y-auto py-2">
          {items.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">{t('search.no_results')}</p>
          ) : (
            items.map((item, i) => {
              const Icon = item.icon
              return (
                <button
                  key={item.id}
                  onClick={item.action}
                  onMouseEnter={() => setSelected(i)}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left transition-colors ${
                    i === selected
                      ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300'
                      : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
                  }`}
                >
                  <Icon className="h-4 w-4 flex-shrink-0" />
                  <span className="font-medium">{item.label}</span>
                </button>
              )
            })
          )}
        </div>

        {/* Footer hints */}
        <div className="px-4 py-2 border-t border-gray-100 dark:border-gray-800 flex gap-4 text-xs text-gray-400">
          <span>
            <kbd className="bg-gray-100 dark:bg-gray-800 px-1 rounded font-mono">↑↓</kbd>{' '}
            {t('search.navigate')}
          </span>
          <span>
            <kbd className="bg-gray-100 dark:bg-gray-800 px-1 rounded font-mono">↵</kbd>{' '}
            {t('search.select')}
          </span>
          <span>
            <kbd className="bg-gray-100 dark:bg-gray-800 px-1 rounded font-mono">Esc</kbd>{' '}
            {t('search.close')}
          </span>
        </div>
      </div>
    </div>
  )
}
