import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi, describe, it, expect } from 'vitest'
import Sidebar from '@/components/layout/Sidebar'

// Stub out the branding query so Sidebar renders without a network call
vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>()
  return {
    ...actual,
    useQuery: () => ({ data: undefined }),
  }
})

// Auth store: minimal stub
vi.mock('@/store/authStore', () => ({
  useAuthStore: () => ({ role: 'user' }),
}))

// i18n: return the key as-is
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}))

// vite env constant
vi.stubGlobal('__APP_VERSION__', '2026.06.01.0000')

function renderSidebar(onShortcutsOpen?: () => void) {
  return render(
    <MemoryRouter>
      <Sidebar open={true} onShortcutsOpen={onShortcutsOpen} />
    </MemoryRouter>,
  )
}

describe('Sidebar shortcuts button', () => {
  it('renders a clickable button with the keyboard icon label', () => {
    renderSidebar()
    const btn = screen.getByRole('button', { name: /shortcuts\.hint/i })
    expect(btn).toBeInTheDocument()
  })

  it('calls onShortcutsOpen when clicked', () => {
    const handler = vi.fn()
    renderSidebar(handler)
    const btn = screen.getByRole('button', { name: /shortcuts\.hint/i })
    fireEvent.click(btn)
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('does not throw when onShortcutsOpen is not provided', () => {
    renderSidebar(undefined)
    const btn = screen.getByRole('button', { name: /shortcuts\.hint/i })
    expect(() => fireEvent.click(btn)).not.toThrow()
  })
})
