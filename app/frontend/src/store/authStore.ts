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
  accessToken: string | null
  setAuth: (user: CurrentUser, token: string) => void
  setToken: (token: string) => void
  updateUser: (updates: Partial<CurrentUser>) => void
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

      setAuth: (user, token) => set({ user, accessToken: token }),
      setToken: (token) => set({ accessToken: token }),
      updateUser: (updates) =>
        set((state) => ({
          user: state.user ? { ...state.user, ...updates } : null,
        })),
      logout: () => set({ user: null, accessToken: null }),

      isAuthenticated: () => !!get().accessToken && !!get().user,
      isSuperAdmin: () => get().user?.role === 'superadmin',
      isManagerOrAbove: () => ['superadmin', 'team_manager'].includes(get().user?.role ?? ''),
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({ user: state.user }),
    }
  )
)
