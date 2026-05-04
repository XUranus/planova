import { useTranslation } from 'react-i18next'
import { useNavigate, useLocation } from 'react-router-dom'
import { LayoutDashboard, Settings, Globe } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

export function Sidebar() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()

  const navItems = [
    { icon: LayoutDashboard, label: t('nav.dashboard'), path: '/' },
  ]

  const changeLanguage = (lng: string) => {
    i18n.changeLanguage(lng)
  }

  return (
    <aside className="flex h-full w-[240px] flex-col border-r bg-background">
      {/* Logo */}
      <div className="flex h-14 items-center gap-2 px-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold text-sm">
          P
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-semibold leading-tight">{t('app.name')}</span>
          <span className="text-[10px] text-muted-foreground leading-tight">{t('app.tagline')}</span>
        </div>
      </div>

      <Separator />

      {/* Navigation */}
      <nav className="flex-1 space-y-1 p-2">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path
          return (
            <Button
              key={item.path}
              variant={isActive ? 'secondary' : 'ghost'}
              className={cn('w-full justify-start gap-2', isActive && 'bg-secondary')}
              onClick={() => navigate(item.path)}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Button>
          )
        })}
      </nav>

      <Separator />

      {/* Footer */}
      <div className="space-y-1 p-2">
        {/* Language Switcher */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="w-full justify-start gap-2">
              <Globe className="h-4 w-4" />
              {t('common.language')}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" side="right">
            <DropdownMenuItem onClick={() => changeLanguage('en-US')}>
              English
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => changeLanguage('zh-CN')}>
              中文
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Settings */}
        <Button
          variant={location.pathname === '/settings' ? 'secondary' : 'ghost'}
          className="w-full justify-start gap-2"
          onClick={() => navigate('/settings')}
        >
          <Settings className="h-4 w-4" />
          {t('nav.settings')}
        </Button>
      </div>
    </aside>
  )
}
