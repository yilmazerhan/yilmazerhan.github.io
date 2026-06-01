import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import apiClient from '@/api/client'

const IDLE_TIMEOUT_MS = 12 * 60 * 60 * 1000  // 12 hours
const THROTTLE_MS = 30_000                     // update lastActivityAt at most every 30s
const CHECK_INTERVAL_MS = 60_000               // check for idleness every 60s

const ACTIVITY_EVENTS = [
  'mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click', 'wheel',
] as const

export function useIdleTimer() {
  const navigate = useNavigate()
  const lastThrottledUpdate = useRef(0)

  useEffect(() => {
    const { updateActivity, logout, isAuthenticated } = useAuthStore.getState()

    if (!isAuthenticated()) return

    function handleActivity() {
      const now = Date.now()
      if (now - lastThrottledUpdate.current >= THROTTLE_MS) {
        lastThrottledUpdate.current = now
        updateActivity()
      }
    }

    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, handleActivity, { passive: true })
    }

    const intervalId = setInterval(() => {
      const state = useAuthStore.getState()
      if (!state.isAuthenticated()) return

      const { lastActivityAt } = state
      if (lastActivityAt === null) return

      const idleMs = Date.now() - lastActivityAt
      if (idleMs >= IDLE_TIMEOUT_MS) {
        clearInterval(intervalId)
        // Fire-and-forget logout request; proceed with local cleanup regardless
        apiClient.post('/auth/logout').catch(() => {})
        logout()
        navigate('/login?reason=idle', { replace: true })
      }
    }, CHECK_INTERVAL_MS)

    return () => {
      for (const event of ACTIVITY_EVENTS) {
        window.removeEventListener(event, handleActivity)
      }
      clearInterval(intervalId)
    }
  }, [navigate])
}
