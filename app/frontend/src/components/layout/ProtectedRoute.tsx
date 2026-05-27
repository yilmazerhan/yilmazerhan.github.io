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
      // User profile is in localStorage but access token is missing (page reload).
      // Attempt a silent refresh using the httpOnly refresh cookie.
      //
      // AbortController: React 18 StrictMode double-invokes effects in development
      // (mount → cleanup → remount). The cleanup aborts the first in-flight request
      // before the browser sends it to the server, so only the second (real)
      // invocation actually rotates the refresh token. Without this guard,
      // two concurrent refresh calls would cause a token-rotation race that logs
      // the user out.
      const controller = new AbortController()

      axios
        .post(`${BASE_URL}/api/v1/auth/refresh`, {}, {
          withCredentials: true,
          signal: controller.signal,
        })
        .then((res) => {
          setToken(res.data.access_token)
          setChecking(false)
        })
        .catch((_err) => {
          // AbortError means this effect was superseded by StrictMode remount.
          // The remounted effect will issue a fresh request — do nothing here.
          if (controller.signal.aborted) return
          logout()
          setChecking(false)
        })

      // Return cleanup: abort the in-flight request on unmount (StrictMode remount).
      return () => { controller.abort() }
    }
    // If user is already authenticated (accessToken present) or fully logged out
    // (no user), nothing to do — the render path below handles it.
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
