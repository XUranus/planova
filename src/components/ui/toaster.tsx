import { X, CheckCircle2, AlertCircle, Info, AlertTriangle } from 'lucide-react'
import { useToastStore, type ToastType } from '@/stores/toastStore'

const icons: Record<ToastType, typeof CheckCircle2> = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
  warning: AlertTriangle,
}

const colors: Record<ToastType, string> = {
  success: 'border-green-500/30 bg-green-50 text-green-800',
  error: 'border-red-500/30 bg-red-50 text-red-800',
  info: 'border-blue-500/30 bg-blue-50 text-blue-800',
  warning: 'border-yellow-500/30 bg-yellow-50 text-yellow-800',
}

const iconColors: Record<ToastType, string> = {
  success: 'text-green-600',
  error: 'text-red-600',
  info: 'text-blue-600',
  warning: 'text-yellow-600',
}

export function Toaster() {
  const toasts = useToastStore((s) => s.toasts)
  const removeToast = useToastStore((s) => s.removeToast)

  if (toasts.length === 0) return null

  return (
    <div className="pointer-events-none fixed right-4 top-4 z-50 flex flex-col gap-2">
      {toasts.map((toast) => {
        const Icon = icons[toast.type]
        return (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-start gap-3 rounded-lg border p-3 shadow-lg backdrop-blur transition-all duration-200 ${colors[toast.type]}`}
            style={{ minWidth: 280, maxWidth: 420 }}
          >
            <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${iconColors[toast.type]}`} />
            <p className="flex-1 text-sm leading-relaxed">{toast.message}</p>
            <button
              onClick={() => removeToast(toast.id)}
              className="shrink-0 opacity-60 hover:opacity-100"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
