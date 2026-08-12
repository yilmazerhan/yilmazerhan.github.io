import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { CheckCircle, XCircle, Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import apiClient from '@/api/client'

export default function ActivateAccountPage() {
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!token) {
      setStatus('error')
      setMessage(t('auth.activate_invalid_link'))
      return
    }

    apiClient.post(`/auth/activate/${token}`)
      .then(() => {
        setStatus('success')
        setMessage(t('auth.activate_success_msg'))
        setTimeout(() => navigate('/login'), 3000)
      })
      .catch((err) => {
        setStatus('error')
        setMessage(err.response?.data?.detail || t('auth.activate_error_default'))
      })
  }, [token, navigate, t])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl p-8 w-full max-w-sm text-center space-y-4">
        {status === 'loading' && (
          <>
            <Loader2 className="h-12 w-12 animate-spin text-primary-500 mx-auto" />
            <p className="text-gray-700 dark:text-gray-300">{t('auth.activate_loading')}</p>
          </>
        )}
        {status === 'success' && (
          <>
            <CheckCircle className="h-12 w-12 text-green-500 mx-auto" />
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">{t('auth.activate_success_title')}</h2>
            <p className="text-gray-500 dark:text-gray-400 text-sm">{message}</p>
            <p className="text-xs text-gray-400">{t('auth.activate_redirect')}</p>
          </>
        )}
        {status === 'error' && (
          <>
            <XCircle className="h-12 w-12 text-red-500 mx-auto" />
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">{t('auth.activate_error_title')}</h2>
            <p className="text-gray-500 dark:text-gray-400 text-sm">{message}</p>
            <Link to="/login" className="inline-block text-primary-600 dark:text-primary-400 text-sm hover:underline">
              {t('auth.go_to_login')}
            </Link>
          </>
        )}
      </div>
    </div>
  )
}
