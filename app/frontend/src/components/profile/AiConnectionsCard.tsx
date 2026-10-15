import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Bot, Copy, Check, Unplug } from 'lucide-react'
import { useAiConnections, useRevokeAiConnection } from '@/api/aiConnections'
import { toast } from '@/store/toastStore'

function CopyBlock({ text }: { text: string }) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      toast.error(t('common.error'))
    }
  }

  return (
    <div className="flex items-start gap-2">
      <pre className="flex-1 min-w-0 text-xs bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-200 border border-gray-200 dark:border-gray-700 rounded-lg p-3 overflow-x-auto whitespace-pre">
        {text}
      </pre>
      <button
        type="button"
        onClick={copy}
        title={t('ai_connections.copy')}
        aria-label={t('ai_connections.copy')}
        className="shrink-0 p-2 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-500 hover:text-gray-900 hover:bg-gray-100 dark:hover:text-white dark:hover:bg-gray-800"
      >
        {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
      </button>
    </div>
  )
}

export default function AiConnectionsCard() {
  const { t, i18n } = useTranslation()
  const { data: connections, isLoading } = useAiConnections()
  const revoke = useRevokeAiConnection()

  const mcpUrl = `${window.location.origin}/api/v1/mcp`
  const fmt = (iso: string) => new Date(iso).toLocaleString(i18n.language)

  async function handleRevoke(id: string, name: string) {
    if (!confirm(t('ai_connections.revoke_confirm', { name }))) return
    try {
      await revoke.mutateAsync(id)
      toast.success(t('ai_connections.revoked'))
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || t('common.error'))
    }
  }

  const clients = [
    {
      name: 'Claude Code',
      hint: t('ai_connections.claude_code_hint'),
      text: `claude mcp add --transport http teamapp ${mcpUrl}`,
    },
    {
      name: 'Claude Desktop',
      hint: t('ai_connections.claude_desktop_hint'),
      text: JSON.stringify(
        { mcpServers: { teamapp: { command: 'npx', args: ['-y', 'mcp-remote', mcpUrl] } } },
        null,
        2,
      ),
    },
    {
      name: 'Cursor',
      hint: t('ai_connections.cursor_hint'),
      text: JSON.stringify({ mcpServers: { teamapp: { url: mcpUrl } } }, null, 2),
    },
    {
      name: 'VS Code',
      hint: t('ai_connections.vscode_hint'),
      text: JSON.stringify({ servers: { teamapp: { type: 'http', url: mcpUrl } } }, null, 2),
    },
  ]

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 space-y-4">
      <div>
        <h2 className="flex items-center gap-2 font-medium text-gray-900 dark:text-white mb-1">
          <Bot className="h-4 w-4" />
          {t('ai_connections.title')}
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">{t('ai_connections.description')}</p>
      </div>

      <div>
        <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('ai_connections.server_url')}</p>
        <CopyBlock text={mcpUrl} />
      </div>

      <details className="group">
        <summary className="cursor-pointer text-sm font-medium text-primary-600 dark:text-primary-400 select-none">
          {t('ai_connections.setup')}
        </summary>
        <div className="mt-3 space-y-4">
          {clients.map((c) => (
            <div key={c.name}>
              <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{c.name}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{c.hint}</p>
              <CopyBlock text={c.text} />
            </div>
          ))}
          <p className="text-xs text-gray-500 dark:text-gray-400">{t('ai_connections.login_hint')}</p>
        </div>
      </details>

      <div>
        <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">{t('ai_connections.connected')}</p>
        {isLoading ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">{t('common.loading')}</p>
        ) : !connections?.length ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">{t('ai_connections.none')}</p>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-800 border border-gray-200 dark:border-gray-800 rounded-lg">
            {connections.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{c.client_name}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {t('ai_connections.connected_at', { date: fmt(c.created_at) })}
                    {c.last_used_at && ` · ${t('ai_connections.last_used', { date: fmt(c.last_used_at) })}`}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleRevoke(c.id, c.client_name)}
                  disabled={revoke.isPending}
                  className="flex items-center gap-1.5 shrink-0 px-3 py-1.5 text-xs font-medium rounded-lg border border-red-200 text-red-600 hover:bg-red-50 dark:border-red-900/50 dark:text-red-400 dark:hover:bg-red-900/20 disabled:opacity-50"
                >
                  <Unplug className="h-3.5 w-3.5" />
                  {t('ai_connections.revoke')}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
