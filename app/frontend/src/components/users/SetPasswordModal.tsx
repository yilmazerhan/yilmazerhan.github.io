import { useState } from 'react'
import { X, KeyRound } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useSetUserPassword, type User } from '@/api/users'

interface Props {
  user: User
  onClose: () => void
}

function validatePassword(pw: string, t: (k: string) => string): string {
  if (pw.length < 8) return t('auth.password_min_length')
  if (!/[A-Z]/.test(pw)) return t('auth.password_uppercase')
  if (!/[a-z]/.test(pw)) return t('auth.password_lowercase')
  if (!/\d/.test(pw)) return t('auth.password_digit')
  return ''
}

export default function SetPasswordModal({ user, onClose }: Props) {
  const { t } = useTranslation()
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const setPassword = useSetUserPassword()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    const validationErr = validatePassword(newPw, t)
    if (validationErr) { setError(validationErr); return }
    if (newPw !== confirmPw) { setError(t('auth.password_mismatch')); return }

    try {
      await setPassword.mutateAsync({ userId: user.id, new_password: newPw })
      setSuccess(true)
    } catch (err: any) {
      setError(err.response?.data?.detail || t('common.error'))
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-sm shadow-xl">
        <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-800">
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-gray-500" />
            <div>
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">
                {t('users.set_password')}
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">{user.full_name}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        {success ? (
          <div className="p-5 text-center space-y-3">
            <p className="text-sm text-green-600 dark:text-green-400 font-medium">
              {t('auth.password_set')}
            </p>
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-primary-500 hover:bg-primary-600 text-white text-sm font-medium"
            >
              {t('common.close')}
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-5 space-y-4">
            {error && (
              <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 p-3 rounded-lg">
                {error}
              </p>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {t('auth.new_password')}
              </label>
              <input
                type="password"
                value={newPw}
                onChange={(e) => setNewPw(e.target.value)}
                required
                autoComplete="new-password"
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {t('auth.confirm_password')}
              </label>
              <input
                type="password"
                value={confirmPw}
                onChange={(e) => setConfirmPw(e.target.value)}
                required
                autoComplete="new-password"
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>

            <p className="text-xs text-gray-400 dark:text-gray-500">
              {t('auth.password_rules')}
            </p>

            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-2 px-4 rounded-lg border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 text-sm font-medium"
              >
                {t('common.cancel')}
              </button>
              <button
                type="submit"
                disabled={setPassword.isPending}
                className="flex-1 py-2 px-4 rounded-lg bg-primary-500 hover:bg-primary-600 text-white text-sm font-medium disabled:opacity-50"
              >
                {setPassword.isPending ? t('common.saving') : t('common.save')}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
