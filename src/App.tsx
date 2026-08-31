import { Link, Outlet, useLocation } from 'react-router-dom'
import TabBar from './components/TabBar'

function isLiveGame(pathname: string): boolean {
  return /^\/game\/[^/]+$/.test(pathname)
}

export default function App() {
  const { pathname } = useLocation()
  const live = isLiveGame(pathname)

  return (
    <div className={live ? 'layout layout-live' : 'layout'}>
      <header className="topbar">
        <Link to="/" className="brand">VeloSync</Link>
      </header>
      <Outlet />
      {!live && <TabBar />}
    </div>
  )
}
