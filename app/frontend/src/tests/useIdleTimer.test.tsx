import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import React from 'react'

// Mock apiClient before importing the hook
vi.mock('@/api/client', () => ({
  default: { post: vi.fn().mockResolvedValue({}) },
}))

// Mock authStore
const mockLogout = vi.fn()
const mockUpdateActivity = vi.fn()
const mockNavigate = vi.fn()

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

vi.mock('@/store/authStore', () => {
  let lastActivityAt: number | null = Date.now()
  return {
    useAuthStore: {
      getState: () => ({
        isAuthenticated: () => true,
        updateActivity: mockUpdateActivity,
        logout: mockLogout,
        get lastActivityAt() { return lastActivityAt },
      }),
      // expose setter for test control
      _setLastActivityAt: (v: number | null) => { lastActivityAt = v },
    },
  }
})

import { useIdleTimer } from '@/hooks/useIdleTimer'
import { useAuthStore } from '@/store/authStore'

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <MemoryRouter>{children}</MemoryRouter>
)

describe('useIdleTimer', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mockLogout.mockClear()
    mockNavigate.mockClear()
    mockUpdateActivity.mockClear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('registers activity event listeners on mount', () => {
    const addSpy = vi.spyOn(window, 'addEventListener')
    renderHook(() => useIdleTimer(), { wrapper })
    // At least mousemove should be registered
    expect(addSpy).toHaveBeenCalledWith('mousemove', expect.any(Function), { passive: true })
  })

  it('calls updateActivity on DOM events (throttled)', () => {
    renderHook(() => useIdleTimer(), { wrapper })

    act(() => {
      window.dispatchEvent(new MouseEvent('mousemove'))
    })
    expect(mockUpdateActivity).toHaveBeenCalledTimes(1)

    // Second immediate event is throttled
    act(() => {
      window.dispatchEvent(new MouseEvent('mousemove'))
    })
    expect(mockUpdateActivity).toHaveBeenCalledTimes(1)
  })

  it('does not logout when activity is recent', () => {
    // lastActivityAt set to now by default
    renderHook(() => useIdleTimer(), { wrapper })

    act(() => {
      vi.advanceTimersByTime(60_000) // one check interval
    })

    expect(mockLogout).not.toHaveBeenCalled()
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('logs out and navigates when idle exceeds 12 hours', () => {
    // Set lastActivityAt to 13 hours ago
    const store = useAuthStore as any
    store._setLastActivityAt(Date.now() - 13 * 60 * 60 * 1000)

    renderHook(() => useIdleTimer(), { wrapper })

    act(() => {
      vi.advanceTimersByTime(60_000) // trigger interval check
    })

    expect(mockLogout).toHaveBeenCalledTimes(1)
    expect(mockNavigate).toHaveBeenCalledWith('/login?reason=idle', { replace: true })
  })

  it('removes event listeners on unmount', () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener')
    const { unmount } = renderHook(() => useIdleTimer(), { wrapper })
    unmount()
    expect(removeSpy).toHaveBeenCalledWith('mousemove', expect.any(Function))
  })
})
