import { renderHook } from '@testing-library/react'
import { fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi, describe, it, expect, beforeEach, type Mock } from 'vitest'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'

function wrapper({ children }: { children: React.ReactNode }) {
  return <MemoryRouter>{children}</MemoryRouter>
}

describe('useKeyboardShortcuts', () => {
  let onSearch: Mock<() => void>
  let onHelp: Mock<() => void>

  beforeEach(() => {
    onSearch = vi.fn<() => void>()
    onHelp = vi.fn<() => void>()
  })

  it('calls onHelp when ? key is pressed', () => {
    renderHook(() => useKeyboardShortcuts({ onSearch, onHelp }), { wrapper })
    fireEvent.keyDown(window, { key: '?' })
    expect(onHelp).toHaveBeenCalledTimes(1)
  })

  it('does not call onHelp when ? is pressed inside an input', () => {
    renderHook(() => useKeyboardShortcuts({ onSearch, onHelp }), { wrapper })
    const input = document.createElement('input')
    document.body.appendChild(input)
    fireEvent.keyDown(input, { key: '?' })
    document.body.removeChild(input)
    expect(onHelp).not.toHaveBeenCalled()
  })

  it('calls onSearch when Ctrl+K is pressed', () => {
    renderHook(() => useKeyboardShortcuts({ onSearch, onHelp }), { wrapper })
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true })
    expect(onSearch).toHaveBeenCalledTimes(1)
  })

  it('calls onSearch when Cmd+K is pressed', () => {
    renderHook(() => useKeyboardShortcuts({ onSearch, onHelp }), { wrapper })
    fireEvent.keyDown(window, { key: 'k', metaKey: true })
    expect(onSearch).toHaveBeenCalledTimes(1)
  })

  it('calls onSearch from inside an input (Ctrl+K is always active)', () => {
    renderHook(() => useKeyboardShortcuts({ onSearch, onHelp }), { wrapper })
    const input = document.createElement('input')
    document.body.appendChild(input)
    fireEvent.keyDown(input, { key: 'k', ctrlKey: true })
    document.body.removeChild(input)
    expect(onSearch).toHaveBeenCalledTimes(1)
  })
})
