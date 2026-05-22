import { useEffect, useState } from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import axios from 'axios'
import { useAuthStore } from '@/store/authStore'

const BASE_URL = import.meta.env.VITE_API_BASE_URL || ''

export default function ProtectedRoute() {
  const { user, accessToken, setToken, logout } = useAuthStore()
  const [checking, setChecking] = useState(!accessToken && !!user)

  useEffect(() => {
    if (!accessToken && user) {
      // User is in localStorage but token is missing (e.g. after page reload with expired token).
      // Attempt a silent refresh using the httpOnly refresh cookie.
      axios
        .post(`${BASE_URL}/api/v1/auth/refresh`, {}, { withCredentials: true })
        .then((res) => {
          setToken(res.data.access_token)
        })
        .catch(() => {
          logout()
        })
        .finally(() => {
          setChecking(false)
        })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white dark:bg-gray-950">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500" />
      </div>
    )
  }

  if (!user || !accessToken) {
    return <Navigate to="/login" replace />
  }

  return <Outlet />
}
