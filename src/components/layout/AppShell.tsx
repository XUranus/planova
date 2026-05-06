import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'
import { StatusBar } from './StatusBar'

export function AppShell() {
  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar />
        <main className="flex-1 overflow-auto scrollbar-thin">
          <Outlet />
        </main>
        <StatusBar />
      </div>
    </div>
  )
}
