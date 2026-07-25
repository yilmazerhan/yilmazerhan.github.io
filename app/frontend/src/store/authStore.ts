import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface CurrentUser {
  id: string
  email: string
  full_name: string
  role: 'superadmin' | 'team_manager' | 'user'
  team_id: string | null
  preferred_language: string
  preferred_theme: 'light' | 'dark'
  is_active: boolean
}

interface AuthState {
  user: CurrentUser | null
  // NOTE: accessToken is intentionally NOT persisted to localStorage to prevent
  // XSS-based token theft. The token lives only in memory and is refreshed via
  // the httpOnly refresh cookie on each page load (see api/client.ts).
  accessToken: string | null
  // Persisted so inactivity is tracked across page reloads.
  lastActivityAt: number | null
  setAuth: (user: CurrentUser, token: string) => void
  setToken: (token: string) => void
  updateUser: (updates: Partial<CurrentUser>) => void
  updateActivity: () => void
  logout: () => void
  isAuthenticated: () => boolean
  isSuperAdmin: () => boolean
  isManagerOrAbove: () => boolean
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      lastActivityAt: null,

      setAuth: (user, token) => set({ user, accessToken: token, lastActivityAt: Date.now() }),
      setToken: (token) => set({ accessToken: token }),
      updateUser: (updates) =>
        set((state) => ({
          user: state.user ? { ...state.user, ...updates } : null,
        })),
      updateActivity: () => set({ lastActivityAt: Date.now() }),
      logout: () => set({ user: null, accessToken: null, lastActivityAt: null }),

      isAuthenticated: () => !!get().accessToken && !!get().user,
      isSuperAdmin: () => get().user?.role === 'superadmin',
      isManagerOrAbove: () => ['superadmin', 'team_manager'].includes(get().user?.role ?? ''),
    }),
    {
      name: 'auth-storage',
      // Persist the user profile — NOT the access token. The access token stays in
      // memory only; the httpOnly refresh cookie is used to obtain a new one on page
      // load without exposing the JWT to JavaScript.
      //
      // NOTE: the persisted profile DOES include `role`, and it is editable in
      // localStorage. Treat it purely as a display/navigation cache — a tampered
      // role only reveals admin UI shells, because every privileged operation is
      // authorised server-side from the JWT (require_superadmin / role checks).
      // Never persist anything here that is trusted for an authorisation decision.
      partialize: (state) => ({ user: state.user, lastActivityAt: state.lastActivityAt }),
    }
  )
)
