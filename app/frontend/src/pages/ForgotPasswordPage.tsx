import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import apiClient from '@/api/client'

export default function ForgotPasswordPage() {
  const { t } = useTranslation()
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      await apiClient.post('/auth/forgot-password', { email })
      setSent(true)
    } catch {
      setError(t('common.error'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 px-4">
      <div className="w-full max-w-md">
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-800 p-8">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">{t('auth.forgot_password')}</h2>
          {sent ? (
            <div className="text-sm text-gray-600 dark:text-gray-300 space-y-4">
              <p>Şifre sıfırlama bağlantısı email adresinize gönderildi (eğer kayıtlıysa).</p>
              <Link to="/login" className="text-primary-600 dark:text-primary-400 hover:underline block">
                Giriş sayfasına dön
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4 mt-4">
              {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('auth.email')}</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full py-2 px-4 bg-primary-500 hover:bg-primary-600 text-white font-medium rounded-lg text-sm transition-colors disabled:opacity-50"
              >
                {loading ? t('common.loading') : 'Gönder'}
              </button>
              <Link to="/login" className="block text-center text-sm text-primary-600 dark:text-primary-400 hover:underline">
                Giriş sayfasına dön
              </Link>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
