import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { CheckCircle, XCircle, Loader2 } from 'lucide-react'
import apiClient from '@/api/client'

export default function ActivateAccountPage() {
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!token) { setStatus('error'); setMessage('Geçersiz aktivasyon bağlantısı.'); return }

    apiClient.post(`/auth/activate/${token}`)
      .then(() => {
        setStatus('success')
        setMessage('Hesabınız başarıyla aktive edildi. Şimdi giriş yapabilirsiniz.')
        setTimeout(() => navigate('/login'), 3000)
      })
      .catch((err) => {
        setStatus('error')
        setMessage(err.response?.data?.detail || 'Aktivasyon başarısız. Bağlantı geçersiz veya süresi dolmuş olabilir.')
      })
  }, [token, navigate])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl p-8 w-full max-w-sm text-center space-y-4">
        {status === 'loading' && (
          <>
            <Loader2 className="h-12 w-12 animate-spin text-primary-500 mx-auto" />
            <p className="text-gray-700 dark:text-gray-300">Hesap aktive ediliyor...</p>
          </>
        )}
        {status === 'success' && (
          <>
            <CheckCircle className="h-12 w-12 text-green-500 mx-auto" />
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Aktivasyon Başarılı!</h2>
            <p className="text-gray-500 dark:text-gray-400 text-sm">{message}</p>
            <p className="text-xs text-gray-400">3 saniye içinde giriş sayfasına yönlendiriliyorsunuz...</p>
          </>
        )}
        {status === 'error' && (
          <>
            <XCircle className="h-12 w-12 text-red-500 mx-auto" />
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Aktivasyon Başarısız</h2>
            <p className="text-gray-500 dark:text-gray-400 text-sm">{message}</p>
            <Link to="/login" className="inline-block text-primary-600 dark:text-primary-400 text-sm hover:underline">
              Giriş sayfasına dön
            </Link>
          </>
        )}
      </div>
    </div>
  )
}
