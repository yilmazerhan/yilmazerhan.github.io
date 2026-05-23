import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'

interface Options {
  onSearch: () => void
  onHelp: () => void
}

export function useKeyboardShortcuts({ onSearch, onHelp }: Options) {
  const navigate = useNavigate()
  const onSearchRef = useRef(onSearch)
  const onHelpRef = useRef(onHelp)
  const gPressed = useRef(false)
  const gTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => { onSearchRef.current = onSearch }, [onSearch])
  useEffect(() => { onHelpRef.current = onHelp }, [onHelp])

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName
      const isInput =
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(tag) ||
        (e.target as HTMLElement).isContentEditable

      // Cmd+K / Ctrl+K → search
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        onSearchRef.current()
        return
      }

      if (isInput) return

      // ? → help
      if (e.key === '?') {
        onHelpRef.current()
        return
      }

      // g + X navigation (sequential key chord)
      if (e.key === 'g') {
        gPressed.current = true
        if (gTimer.current) clearTimeout(gTimer.current)
        gTimer.current = setTimeout(() => { gPressed.current = false }, 1000)
        return
      }

      if (gPressed.current) {
        gPressed.current = false
        if (gTimer.current) clearTimeout(gTimer.current)
        switch (e.key) {
          case 'd': navigate('/'); break
          case 'w': navigate('/worklog'); break
          case 'k': navigate('/kanban'); break
          case 'r': navigate('/reports'); break
          case 'p': navigate('/profile'); break
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      if (gTimer.current) clearTimeout(gTimer.current)
    }
  }, [navigate])
}
