import { useTranslation } from 'react-i18next'
import { useNavigate, useLocation } from 'react-router-dom'
import { ChevronRight, Moon, Sun, Monitor } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useProjectStore } from '@/stores/projectStore'
import { useEffect, useState } from 'react'

type Theme = 'light' | 'dark' | 'system'

function getBreadcrumbs(pathname: string, projects: ReturnType<typeof useProjectStore.getState>['projects'], t: (key: string) => string) {
  const crumbs = [{ label: t('nav.dashboard'), path: '/' }]

  const projectMatch = pathname.match(/^\/projects\/([^/]+)/)
  if (projectMatch) {
    const project = projects.find((p) => p.id === projectMatch[1])
    crumbs.push({
      label: project?.name || 'Project',
      path: `/projects/${projectMatch[1]}`,
    })

    if (pathname.includes('/upload')) {
      crumbs.push({ label: t('project.upload'), path: `${crumbs[1].path}/upload` })
    }
  }

  return crumbs
}

export function Topbar() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const projects = useProjectStore((s) => s.projects)
  const [theme, setTheme] = useState<Theme>('system')

  useEffect(() => {
    const saved = localStorage.getItem('planova-theme') as Theme | null
    const initial = saved || 'system'
    setTheme(initial)
    applyTheme(initial)
  }, [])

  function applyTheme(t: Theme) {
    const root = document.documentElement
    if (t === 'dark') {
      root.classList.add('dark')
    } else if (t === 'light') {
      root.classList.remove('dark')
    } else {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
      root.classList.toggle('dark', prefersDark)
    }
  }

  function handleThemeChange(t: Theme) {
    setTheme(t)
    localStorage.setItem('planova-theme', t)
    applyTheme(t)
  }

  const breadcrumbs = getBreadcrumbs(location.pathname, projects, t)

  return (
    <header className="flex h-14 items-center justify-between border-b px-4">
      <nav className="flex items-center gap-1 text-sm text-muted-foreground">
        {breadcrumbs.map((crumb, i) => (
          <span key={crumb.path} className="flex items-center gap-1">
            {i > 0 && <ChevronRight className="h-3 w-3" />}
            {i === breadcrumbs.length - 1 ? (
              <span className="font-medium text-foreground">{crumb.label}</span>
            ) : (
              <button
                onClick={() => navigate(crumb.path)}
                className="cursor-pointer hover:text-foreground transition-colors"
              >
                {crumb.label}
              </button>
            )}
          </span>
        ))}
      </nav>

      <div className="flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon">
              {theme === 'dark' ? (
                <Moon className="h-4 w-4" />
              ) : theme === 'light' ? (
                <Sun className="h-4 w-4" />
              ) : (
                <Monitor className="h-4 w-4" />
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => handleThemeChange('light')}>
              <Sun className="mr-2 h-4 w-4" />
              {t('common.light')}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleThemeChange('dark')}>
              <Moon className="mr-2 h-4 w-4" />
              {t('common.dark')}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleThemeChange('system')}>
              <Monitor className="mr-2 h-4 w-4" />
              {t('common.system')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
