import { Link, Outlet } from 'react-router-dom'

export default function App() {
  return (
    <>
      <header className="topbar">
        <Link to="/" className="brand">🥎 Pitch Tracker</Link>
        <nav>
          <Link to="/games">Games</Link>
          <Link to="/pitchers">Pitchers</Link>
          <Link to="/settings">Settings</Link>
        </nav>
      </header>
      <Outlet />
    </>
  )
}
