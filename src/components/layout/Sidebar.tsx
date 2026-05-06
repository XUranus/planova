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
    <aside className="flex h-full w-[64px] flex-col border-r border-sidebar-border bg-sidebar">
      {/* Logo */}
      <div className="flex h-12 items-center justify-center">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold text-sm">
          P
        </div>
      </div>

      <Separator className="bg-sidebar-border" />

      {/* Navigation */}
      <nav className="flex-1 space-y-0.5 p-1.5">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path
          return (
            <Button
              key={item.path}
              variant="ghost"
              size="icon"
              className={cn(
                'h-9 w-full',
                isActive
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/50'
              )}
              onClick={() => navigate(item.path)}
              title={item.label}
            >
              <item.icon className="h-4 w-4" />
            </Button>
          )
        })}
      </nav>

      <Separator className="bg-sidebar-border" />

      {/* Footer */}
      <div className="p-1.5">
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            'h-9 w-full',
            location.pathname === '/settings'
              ? 'bg-sidebar-accent text-sidebar-accent-foreground'
              : 'text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/50'
          )}
          onClick={() => navigate('/settings')}
          title={t('nav.settings')}
        >
          <Settings className="h-4 w-4" />
        </Button>
      </div>
    </aside>
  )
}
