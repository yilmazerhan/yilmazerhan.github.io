import { useQuery } from '@tanstack/react-query'
import axios from 'axios'
import { ExternalLink } from 'lucide-react'

function useJiraBaseUrl(): string {
  const { data } = useQuery({
    queryKey: ['branding'],
    queryFn: () => axios.get('/api/v1/public/branding').then((r) => r.data),
    staleTime: 5 * 60 * 1000,
  })
  return (data?.jira_base_url as string | undefined) ?? ''
}

/**
 * Renders a Jira ticket ID as a clickable link when jira_base_url is configured,
 * or as plain text otherwise. Handles comma-separated ticket lists.
 */
interface JiraTicketLinkProps {
  ticket: string | null | undefined
}

export function JiraTicketLink({ ticket }: JiraTicketLinkProps) {
  const baseUrl = useJiraBaseUrl()

  if (!ticket) return <span className="text-gray-300 dark:text-gray-700">—</span>

  const base = baseUrl.endsWith('/') ? baseUrl : baseUrl ? baseUrl + '/' : ''

  const parts = ticket
    .split(/[\s,]+/)
    .map((t) => t.trim())
    .filter(Boolean)

  if (parts.length === 0) return <span className="text-gray-300 dark:text-gray-700">—</span>

  return (
    <span className="flex flex-wrap gap-1">
      {parts.map((id) =>
        base ? (
          <a
            key={id}
            href={`${base}${id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-0.5 text-blue-600 dark:text-blue-400 hover:underline whitespace-nowrap"
          >
            {id}
            <ExternalLink className="h-3 w-3 flex-shrink-0" />
          </a>
        ) : (
          <span key={id} className="text-gray-600 dark:text-gray-400 whitespace-nowrap">
            {id}
          </span>
        ),
      )}
    </span>
  )
}
