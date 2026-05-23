import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import axios from 'axios'
import apiClient from '@/api/client'
import { useAuthStore } from '@/store/authStore'

export default function LoginPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { setAuth } = useAuthStore()

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const { data: branding } = useQuery({
    queryKey: ['branding'],
    queryFn: () => axios.get('/api/v1/public/branding').then((r) => r.data),
    staleTime: Infinity,
  })

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await apiClient.post('/auth/login', { username, password })
      const { access_token } = res.data

      const meRes = await apiClient.get('/auth/me', {
        headers: { Authorization: `Bearer ${access_token}` },
      })
      setAuth(meRes.data, access_token)
      navigate('/')
    } catch (err: any) {
      setError(err.response?.data?.detail || t('common.error'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 px-4">
      <div className="w-full max-w-md">
        {/* Branding */}
        <div className="text-center mb-8">
          {branding?.company_logo && (
            <img src={branding.company_logo} alt="Logo" className="h-16 mx-auto mb-4 object-contain" />
          )}
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            {branding?.company_name || t('app.name')}
          </h1>
        </div>

        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-800 p-8">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-6">{t('auth.login')}</h2>

          {error && (
            <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {t('auth.username')}
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoComplete="username"
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {t('auth.password')}
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2 px-4 bg-primary-500 hover:bg-primary-600 text-white font-medium rounded-lg text-sm transition-colors disabled:opacity-50"
            >
              {loading ? t('common.loading') : t('auth.login')}
            </button>
          </form>

          <div className="mt-4 text-center">
            <Link
              to="/forgot-password"
              className="text-sm text-primary-600 dark:text-primary-400 hover:underline"
            >
              {t('auth.forgot_password')}?
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
