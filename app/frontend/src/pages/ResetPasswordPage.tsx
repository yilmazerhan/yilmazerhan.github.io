import { useState } from 'react'
import { useSearchParams, Link, useNavigate } from 'react-router-dom'
import { KeyRound, CheckCircle } from 'lucide-react'
import apiClient from '@/api/client'

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const token = searchParams.get('token') ?? ''

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (password.length < 8) { setError('Şifre en az 8 karakter olmalıdır.'); return }
    if (password !== confirm) { setError('Şifreler eşleşmiyor.'); return }

    setLoading(true)
    try {
      await apiClient.post('/auth/reset-password', { token, new_password: password })
      setDone(true)
      setTimeout(() => navigate('/login'), 3000)
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Şifre sıfırlama başarısız. Bağlantı geçersiz veya süresi dolmuş olabilir.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl p-8 w-full max-w-sm space-y-6">
        {done ? (
          <div className="text-center space-y-3">
            <CheckCircle className="h-12 w-12 text-green-500 mx-auto" />
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Şifre Güncellendi!</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">3 saniye içinde giriş sayfasına yönlendiriliyorsunuz...</p>
          </div>
        ) : (
          <>
            <div className="text-center">
              <div className="inline-flex p-3 bg-primary-50 dark:bg-primary-900/20 rounded-full mb-3">
                <KeyRound className="h-7 w-7 text-primary-600 dark:text-primary-400" />
              </div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">Yeni Şifre Belirle</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">En az 8 karakterli güçlü bir şifre seçin.</p>
            </div>

            {!token && (
              <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-3">
                <p className="text-sm text-red-600 dark:text-red-400">Geçersiz bağlantı. Lütfen e-postanızdaki bağlantıyı kullanın.</p>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 p-3 rounded-lg">{error}</p>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Yeni Şifre</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Şifre Tekrar</label>
                <input
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <button
                type="submit"
                disabled={loading || !token}
                className="w-full py-2.5 px-4 rounded-lg bg-primary-500 hover:bg-primary-600 text-white font-medium disabled:opacity-50"
              >
                {loading ? 'Kaydediliyor...' : 'Şifreyi Güncelle'}
              </button>
            </form>

            <div className="text-center">
              <Link to="/login" className="text-sm text-primary-600 dark:text-primary-400 hover:underline">
                Giriş sayfasına dön
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
