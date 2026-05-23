import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Menu, Moon, Sun, Globe, LogOut, KeyRound, Search, Bell } from 'lucide-react'
import { useThemeStore } from '@/store/themeStore'
import { useAuthStore } from '@/store/authStore'
import apiClient from '@/api/client'
import i18n from '@/i18n'
import ChangePasswordModal from '@/components/users/ChangePasswordModal'
import { useNotifications, useMarkAllRead, useMarkRead } from '@/api/notifications'
import { formatDistanceToNow } from 'date-fns'

interface TopbarProps {
  onMenuToggle: () => void
  onSearchOpen: () => void
}

function getInitials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

export default function Topbar({ onMenuToggle, onSearchOpen }: TopbarProps) {
  const { t } = useTranslation()
  const { theme, toggleTheme } = useThemeStore()
  const { user, logout } = useAuthStore()
  const [changePwOpen, setChangePwOpen] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)
  const { data: notifData } = useNotifications()
  const markRead = useMarkRead()
  const markAllRead = useMarkAllRead()
  const unreadCount = notifData?.unread_count ?? 0

  async function handleLogout() {
    await apiClient.post('/auth/logout').catch(() => {})
    logout()
    window.location.href = '/login'
  }

  function toggleLanguage() {
    const next = i18n.language === 'tr' ? 'en' : 'tr'
    i18n.changeLanguage(next)
    localStorage.setItem('i18nextLng', next)
  }

  return (
    <>
      <header className="h-16 flex items-center justify-between px-4 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
        <div className="flex items-center gap-2">
          <button
            onClick={onMenuToggle}
            className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
            aria-label="Toggle menu"
          >
            <Menu className="h-5 w-5" />
          </button>

          {/* Search trigger */}
          <button
            onClick={onSearchOpen}
            className="hidden sm:flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg text-gray-400 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            title="Ctrl+K"
          >
            <Search className="h-4 w-4" />
            <span className="text-gray-400">{t('search.placeholder')}</span>
            <kbd className="ml-1 text-xs px-1.5 py-0.5 bg-white dark:bg-gray-700 rounded border border-gray-200 dark:border-gray-600 text-gray-400 font-mono">
              Ctrl K
            </kbd>
          </button>
        </div>

        <div className="flex items-center gap-2">
          {/* Language toggle */}
          <button
            onClick={toggleLanguage}
            className="flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
            title={t('profile.language')}
          >
            <Globe className="h-4 w-4" />
            <span className="uppercase font-medium">{i18n.language}</span>
          </button>

          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            className="p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
            title={theme === 'light' ? t('theme.dark') : t('theme.light')}
          >
            {theme === 'light' ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
          </button>

          {/* Notifications */}
          <div className="relative">
            <button
              onClick={() => setNotifOpen((v) => !v)}
              className="relative p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
              title={t('notifications.title')}
            >
              <Bell className="h-5 w-5" />
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>
            {notifOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setNotifOpen(false)} />
                <div className="absolute right-0 top-10 z-50 w-80 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xl overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
                    <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">{t('notifications.title')}</span>
                    {unreadCount > 0 && (
                      <button
                        onClick={() => markAllRead.mutate()}
                        className="text-xs text-primary-600 dark:text-primary-400 hover:underline"
                      >
                        {t('notifications.mark_all_read')}
                      </button>
                    )}
                  </div>
                  <div className="max-h-96 overflow-y-auto">
                    {!notifData?.items.length ? (
                      <p className="text-center text-sm text-gray-400 py-8">{t('notifications.empty')}</p>
                    ) : notifData.items.map((n) => (
                      <button
                        key={n.id}
                        onClick={() => { markRead.mutate(n.id); setNotifOpen(false) }}
                        className={`w-full text-left px-4 py-3 border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800 flex gap-3 ${!n.is_read ? 'bg-blue-50 dark:bg-blue-900/10' : ''}`}
                      >
                        <span className={`mt-1 w-2 h-2 rounded-full flex-shrink-0 ${n.type === 'task_assigned' ? 'bg-green-500' : n.type === 'mention' ? 'bg-purple-500' : 'bg-yellow-500'}`} />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{n.title}</p>
                          {n.body && <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{n.body}</p>}
                          <p className="text-xs text-gray-400 mt-0.5">
                            {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* User section */}
          <div className="flex items-center gap-1 pl-2 border-l border-gray-200 dark:border-gray-700">
            {/* Avatar → profile page */}
            <Link
              to="/profile"
              className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              title={t('profile.title')}
            >
              <div className="w-8 h-8 rounded-full bg-primary-500 flex items-center justify-center text-white text-xs font-bold select-none">
                {user?.full_name ? getInitials(user.full_name) : '?'}
              </div>
              <div className="hidden sm:block">
                <p className="text-sm font-medium text-gray-900 dark:text-white leading-none">
                  {user?.full_name}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 capitalize">{user?.role}</p>
              </div>
            </Link>

            <button
              onClick={() => setChangePwOpen(true)}
              className="p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
              title={t('auth.change_password')}
            >
              <KeyRound className="h-5 w-5" />
            </button>

            <button
              onClick={handleLogout}
              className="p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-red-600"
              title={t('auth.logout')}
            >
              <LogOut className="h-5 w-5" />
            </button>
          </div>
        </div>
      </header>

      {changePwOpen && <ChangePasswordModal onClose={() => setChangePwOpen(false)} />}
    </>
  )
}
