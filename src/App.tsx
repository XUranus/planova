import { lazy, Suspense } from 'react'
import { HashRouter, Routes, Route } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Toaster } from '@/components/ui/toaster'

const ProjectDashboard = lazy(() => import('@/pages/ProjectDashboard').then((m) => ({ default: m.ProjectDashboard })))
const ProjectDetail = lazy(() => import('@/pages/ProjectDetail').then((m) => ({ default: m.ProjectDetail })))
const UploadPage = lazy(() => import('@/pages/UploadPage').then((m) => ({ default: m.UploadPage })))
const SettingsPage = lazy(() => import('@/pages/SettingsPage').then((m) => ({ default: m.SettingsPage })))

function App() {
  return (
    <TooltipProvider>
      <HashRouter>
        <Suspense fallback={null}>
          <Routes>
            <Route element={<AppShell />}>
              <Route path="/" element={<ProjectDashboard />} />
              <Route path="/projects/:id" element={<ProjectDetail />} />
              <Route path="/projects/:id/upload" element={<UploadPage />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Route>
          </Routes>
        </Suspense>
      </HashRouter>
      <Toaster />
    </TooltipProvider>
  )
}

export default App
