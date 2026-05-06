import { X, CheckCircle2, AlertCircle, Info, AlertTriangle } from 'lucide-react'
import { useToastStore, type ToastType } from '@/stores/toastStore'

const icons: Record<ToastType, typeof CheckCircle2> = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
  warning: AlertTriangle,
}

const styles: Record<ToastType, { container: string; icon: string }> = {
  success: {
    container: 'border-success/20 bg-success/10 text-success',
    icon: 'text-success',
  },
  error: {
    container: 'border-destructive/20 bg-destructive/10 text-destructive',
    icon: 'text-destructive',
  },
  info: {
    container: 'border-primary/20 bg-primary/5 text-foreground',
    icon: 'text-primary',
  },
  warning: {
    container: 'border-muted-foreground/20 bg-muted text-foreground',
    icon: 'text-muted-foreground',
  },
}

export function Toaster() {
  const toasts = useToastStore((s) => s.toasts)
  const removeToast = useToastStore((s) => s.removeToast)

  if (toasts.length === 0) return null

  return (
    <div className="pointer-events-none fixed right-4 top-4 z-50 flex flex-col gap-2">
      {toasts.map((toast) => {
        const Icon = icons[toast.type]
        const s = styles[toast.type]
        return (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-start gap-3 rounded-lg border p-3 shadow-lg backdrop-blur transition-all duration-200 ${s.container}`}
            style={{ minWidth: 280, maxWidth: 420 }}
          >
            <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${s.icon}`} />
            <p className="flex-1 text-sm leading-relaxed">{toast.message}</p>
            <button
              onClick={() => removeToast(toast.id)}
              className="shrink-0 rounded-md p-0.5 opacity-60 transition-all hover:bg-black/10 hover:opacity-100"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
