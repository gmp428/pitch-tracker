import { Link, Outlet } from 'react-router-dom'

export default function App() {
  return (
    <>
      <header className="topbar">
        <Link to="/" className="brand" aria-label="Home">🥎</Link>
        <nav>
          <Link to="/teams">Teams</Link>
          <Link to="/pitchers">Pitchers</Link>
          <Link to="/games">Games</Link>
          <Link to="/settings">Settings</Link>
        </nav>
      </header>
      <Outlet />
    </>
  )
}
