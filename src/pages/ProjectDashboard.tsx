import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { Plus, Trash2, FolderOpen, Box } from 'lucide-react'
import { ask } from '@tauri-apps/plugin-dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useProjectStore } from '@/stores/projectStore'
import type { ProjectStyle } from '@/types/project'
import { PROJECT_STYLES } from '@/types/project'
import { DEMO_PROJECTS } from '@/data/demoProjects'

export function ProjectDashboard() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { projects, fetchProjects, syncCreateProject, syncDeleteProject } = useProjectStore()

  const [createOpen, setCreateOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [newStyle, setNewStyle] = useState<ProjectStyle>('modern_luxury')

  useEffect(() => {
    fetchProjects()
  }, [fetchProjects])

  const handleCreate = async () => {
    if (!newName.trim()) return
    try {
      const project = await syncCreateProject({
        name: newName.trim(),
        description: newDesc.trim(),
        style: newStyle,
      })
      setNewName('')
      setNewDesc('')
      setNewStyle('modern_luxury')
      setCreateOpen(false)
      navigate(`/projects/${project.id}`)
    } catch {
      // Error handled by UI
    }
  }

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    const confirmed = await ask(t('dashboard.delete_confirm'), { title: 'Planova', kind: 'warning' })
    if (confirmed) {
      await syncDeleteProject(id)
    }
  }

  return (
    <div className="flex-1 space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t('dashboard.title')}</h1>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              {t('dashboard.create_project')}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('create_dialog.title')}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <label className="text-sm font-medium">{t('create_dialog.name_label')}</label>
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder={t('create_dialog.name_placeholder')}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">{t('create_dialog.description_label')}</label>
                <Textarea
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder={t('create_dialog.description_placeholder')}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">{t('create_dialog.style_label')}</label>
                <div className="grid grid-cols-3 gap-2">
                  {PROJECT_STYLES.map((style) => (
                    <button
                      key={style.value}
                      onClick={() => setNewStyle(style.value)}
                      className={`rounded-md border px-3 py-2 text-xs font-medium transition-colors cursor-pointer ${
                        newStyle === style.value
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-input hover:bg-accent'
                      }`}
                    >
                      {t(style.labelKey)}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>
                {t('common.cancel')}
              </Button>
              <Button onClick={handleCreate} disabled={!newName.trim()}>
                {t('create_dialog.create')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Demo Scenes — always visible, not deletable */}
      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Box className="h-4 w-4" />
          {t('demo.section_title')}
        </h2>
        <div className="grid grid-cols-2 gap-4">
          {DEMO_PROJECTS.map((demo) => (
            <Card
              key={demo.id}
              className="cursor-pointer transition-all hover:border-foreground/10 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => navigate(`/projects/${demo.id}`)}
            >
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-base">{t(`demo.${demo.id === 'test_studio' ? 'studio' : 'two_bedroom'}`)}</CardTitle>
                    <CardDescription className="mt-1">
                      {t(`styles.${demo.style}`)}
                    </CardDescription>
                  </div>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                    {t('demo.badge')}
                  </span>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{t('demo.built_in_desc')}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* User Projects */}
      {projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <FolderOpen className="mb-4 h-16 w-16 text-muted-foreground" />
          <h2 className="mb-2 text-lg font-semibold">{t('dashboard.empty_title')}</h2>
          <p className="mb-6 text-sm text-muted-foreground">{t('dashboard.empty_description')}</p>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            {t('dashboard.create_project')}
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {projects.map((project) => (
            <Card
              key={project.id}
              className="cursor-pointer transition-all hover:border-foreground/10 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => navigate(`/projects/${project.id}`)}
            >
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-base">{project.name}</CardTitle>
                    <CardDescription className="mt-1">
                      {t(`styles.${project.style}`)}
                    </CardDescription>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={(e) => handleDelete(e, project.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {project.description && (
                  <p className="mb-3 text-sm text-muted-foreground line-clamp-2">
                    {project.description}
                  </p>
                )}
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className={`rounded-full px-2 py-0.5 ${
                    project.status === 'completed'
                      ? 'bg-success/10 text-success'
                      : project.status === 'generating'
                        ? 'bg-primary/10 text-primary'
                        : project.status === 'error'
                          ? 'bg-destructive/10 text-destructive'
                          : 'bg-muted text-muted-foreground'
                  }`}>
                    {t(`status.${project.status}`)}
                  </span>
                  <span>{new Date(project.createdAt).toLocaleDateString()}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
