import { useTranslation } from 'react-i18next'
import { useNavigate, useLocation } from 'react-router-dom'
import { LayoutDashboard, Settings } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'

export function Sidebar() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()

  const navItems = [
    { icon: LayoutDashboard, label: t('nav.dashboard'), path: '/' },
  ]

  return (
    <aside className="flex h-full w-[240px] flex-col border-r border-sidebar-border bg-sidebar">
      {/* Logo */}
      <div className="flex h-14 items-center gap-2.5 px-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold text-sm">
          P
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-semibold leading-tight text-sidebar-foreground">{t('app.name')}</span>
          <span className="text-[11px] text-muted-foreground leading-tight">{t('app.tagline')}</span>
        </div>
      </div>

      <Separator className="bg-sidebar-border" />

      {/* Navigation */}
      <nav className="flex-1 space-y-0.5 p-2">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path
          return (
            <Button
              key={item.path}
              variant="ghost"
              className={cn(
                'w-full justify-start gap-2.5 h-9',
                isActive
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/50'
              )}
              onClick={() => navigate(item.path)}
            >
              <item.icon className="h-4 w-4" />
              <span className="text-sm">{item.label}</span>
            </Button>
          )
        })}
      </nav>

      <Separator className="bg-sidebar-border" />

      {/* Footer */}
      <div className="p-2">
        <Button
          variant="ghost"
          className={cn(
            'w-full justify-start gap-2.5 h-9',
            location.pathname === '/settings'
              ? 'bg-sidebar-accent text-sidebar-accent-foreground'
              : 'text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/50'
          )}
          onClick={() => navigate('/settings')}
        >
          <Settings className="h-4 w-4" />
          <span className="text-sm">{t('nav.settings')}</span>
        </Button>
      </div>
    </aside>
  )
}
