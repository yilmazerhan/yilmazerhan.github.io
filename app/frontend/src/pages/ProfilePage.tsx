import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Mail, Globe, Save, KeyRound } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { useUpdateMyProfile } from '@/api/users'
import { toast } from '@/store/toastStore'
import ChangePasswordModal from '@/components/users/ChangePasswordModal'
import i18n from '@/i18n'

function getInitials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

export default function ProfilePage() {
  const { t } = useTranslation()
  const { user, updateUser } = useAuthStore()
  const updateMutation = useUpdateMyProfile()

  const [fullName, setFullName] = useState(user?.full_name ?? '')
  const [language, setLanguage] = useState(user?.preferred_language ?? 'tr')
  const [changePwOpen, setChangePwOpen] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    try {
      const updated = await updateMutation.mutateAsync({
        full_name: fullName,
        preferred_language: language,
      })
      updateUser({ full_name: updated.full_name, preferred_language: updated.preferred_language })
      i18n.changeLanguage(language)
      localStorage.setItem('i18nextLng', language)
      toast.success(t('profile.saved'))
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || t('common.error'))
    }
  }

  return (
    <>
      <div className="space-y-6 max-w-xl">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('profile.title')}</h1>

        {/* Avatar + info */}
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-primary-500 flex items-center justify-center text-white text-xl font-bold select-none">
            {user?.full_name ? getInitials(user.full_name) : '?'}
          </div>
          <div>
            <p className="font-semibold text-gray-900 dark:text-white text-lg">{user?.full_name}</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">{user?.email}</p>
            <span className={`inline-block mt-1 text-xs px-2 py-0.5 rounded font-medium capitalize ${
              user?.role === 'superadmin' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300' :
              user?.role === 'team_manager' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' :
              'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300'
            }`}>
              {user?.role}
            </span>
          </div>
        </div>

        {/* Edit form */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Email (readonly) */}
            <div>
              <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                <Mail className="h-4 w-4" />
                {t('auth.email')}
              </label>
              <input
                value={user?.email ?? ''}
                disabled
                className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-400 dark:text-gray-500 text-sm cursor-not-allowed"
              />
            </div>

            {/* Full name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {t('auth.full_name')}
              </label>
              <input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>

            {/* Language */}
            <div>
              <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                <Globe className="h-4 w-4" />
                {t('profile.language')}
              </label>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="tr">{t('language.tr')}</option>
                <option value="en">{t('language.en')}</option>
              </select>
            </div>

            <div className="flex gap-3 pt-1">
              <button
                type="submit"
                disabled={updateMutation.isPending}
                className="flex items-center gap-2 px-5 py-2 bg-primary-500 hover:bg-primary-600 text-white text-sm font-medium rounded-lg disabled:opacity-50"
              >
                <Save className="h-4 w-4" />
                {updateMutation.isPending ? t('common.saving') : t('common.save')}
              </button>
            </div>
          </form>
        </div>

        {/* Password section */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
          <h2 className="font-medium text-gray-900 dark:text-white mb-1">{t('auth.change_password')}</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">{t('profile.password_hint')}</p>
          <button
            onClick={() => setChangePwOpen(true)}
            className="flex items-center gap-2 px-4 py-2 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            <KeyRound className="h-4 w-4" />
            {t('auth.change_password')}
          </button>
        </div>
      </div>

      {changePwOpen && <ChangePasswordModal onClose={() => setChangePwOpen(false)} />}
    </>
  )
}
