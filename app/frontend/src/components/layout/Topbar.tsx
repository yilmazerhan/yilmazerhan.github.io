import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Menu, Moon, Sun, Globe, LogOut, User, KeyRound } from 'lucide-react'
import { useThemeStore } from '@/store/themeStore'
import { useAuthStore } from '@/store/authStore'
import apiClient from '@/api/client'
import i18n from '@/i18n'
import ChangePasswordModal from '@/components/users/ChangePasswordModal'

interface TopbarProps {
  onMenuToggle: () => void
}

export default function Topbar({ onMenuToggle }: TopbarProps) {
  const { t } = useTranslation()
  const { theme, toggleTheme } = useThemeStore()
  const { user, logout } = useAuthStore()
  const [changePwOpen, setChangePwOpen] = useState(false)

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
      <button
        onClick={onMenuToggle}
        className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
        aria-label="Toggle menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      <div className="flex items-center gap-2">
        {/* Language toggle */}
        <button
          onClick={toggleLanguage}
          className="flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
          title={t('theme.toggle')}
        >
          <Globe className="h-4 w-4" />
          <span className="uppercase font-medium">{i18n.language}</span>
        </button>

        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          className="p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
          aria-label={t('theme.toggle')}
          title={theme === 'light' ? t('theme.dark') : t('theme.light')}
        >
          {theme === 'light' ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
        </button>

        {/* User menu */}
        <div className="flex items-center gap-2 pl-2 border-l border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-primary-100 dark:bg-primary-700 flex items-center justify-center">
              <User className="h-4 w-4 text-primary-700 dark:text-primary-100" />
            </div>
            <div className="hidden sm:block">
              <p className="text-sm font-medium text-gray-900 dark:text-white leading-none">{user?.full_name}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 capitalize">{user?.role}</p>
            </div>
          </div>
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
            aria-label={t('auth.logout')}
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
