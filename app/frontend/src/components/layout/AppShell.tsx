import { Outlet } from 'react-router-dom'
import { useState } from 'react'
import Sidebar from './Sidebar'
import Topbar from './Topbar'
import Toaster from '@/components/ui/Toast'
import CommandPalette from '@/components/ui/CommandPalette'
import ShortcutsHelp from '@/components/ui/ShortcutsHelp'
import AnnouncementBanner from '@/components/AnnouncementBanner'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'

export default function AppShell() {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)

  useKeyboardShortcuts({
    onSearch: () => setPaletteOpen(true),
    onHelp: () => setHelpOpen(true),
  })

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50 dark:bg-gray-950">
      <Sidebar open={sidebarOpen} onShortcutsOpen={() => setHelpOpen(true)} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar
          onMenuToggle={() => setSidebarOpen((o) => !o)}
          onSearchOpen={() => setPaletteOpen(true)}
        />
        <AnnouncementBanner />
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      <ShortcutsHelp open={helpOpen} onClose={() => setHelpOpen(false)} />
      <Toaster />
    </div>
  )
}
