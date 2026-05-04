import { HashRouter, Routes, Route } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
import { ProjectDashboard } from '@/pages/ProjectDashboard'
import { ProjectDetail } from '@/pages/ProjectDetail'
import { UploadPage } from '@/pages/UploadPage'
import { TooltipProvider } from '@/components/ui/tooltip'

function App() {
  return (
    <TooltipProvider>
      <HashRouter>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/" element={<ProjectDashboard />} />
            <Route path="/projects/:id" element={<ProjectDetail />} />
            <Route path="/projects/:id/upload" element={<UploadPage />} />
          </Route>
        </Routes>
      </HashRouter>
    </TooltipProvider>
  )
}

export default App
