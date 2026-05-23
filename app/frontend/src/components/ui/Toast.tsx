import { X, CheckCircle2, AlertCircle, Info } from 'lucide-react'
import { useToastStore, type Toast } from '@/store/toastStore'

const CONFIGS = {
  success: {
    icon: CheckCircle2,
    bg: 'bg-green-50 dark:bg-green-900/40',
    border: 'border-green-200 dark:border-green-700',
    text: 'text-green-800 dark:text-green-200',
    iconColor: 'text-green-500',
  },
  error: {
    icon: AlertCircle,
    bg: 'bg-red-50 dark:bg-red-900/40',
    border: 'border-red-200 dark:border-red-700',
    text: 'text-red-800 dark:text-red-200',
    iconColor: 'text-red-500',
  },
  info: {
    icon: Info,
    bg: 'bg-blue-50 dark:bg-blue-900/40',
    border: 'border-blue-200 dark:border-blue-700',
    text: 'text-blue-800 dark:text-blue-200',
    iconColor: 'text-blue-500',
  },
}

function ToastItem({ t }: { t: Toast }) {
  const remove = useToastStore((s) => s.remove)
  const cfg = CONFIGS[t.type]
  const Icon = cfg.icon

  return (
    <div className={`flex items-start gap-3 p-4 rounded-xl border shadow-lg min-w-72 max-w-sm ${cfg.bg} ${cfg.border}`}>
      <Icon className={`h-5 w-5 flex-shrink-0 mt-0.5 ${cfg.iconColor}`} />
      <p className={`text-sm font-medium flex-1 ${cfg.text}`}>{t.message}</p>
      <button
        onClick={() => remove(t.id)}
        className="flex-shrink-0 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}

export default function Toaster() {
  const toasts = useToastStore((s) => s.toasts)
  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2">
      {toasts.map((t) => (
        <ToastItem key={t.id} t={t} />
      ))}
    </div>
  )
}
