import { Link, Outlet } from 'react-router-dom'

export default function App() {
  return (
    <>
      <header className="topbar">
        <Link to="/" className="brand" aria-label="Home">
          <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true" style={{ display: 'block' }}>
            <path d="M4 3.5 h16 v7.5 l-8 9 -8 -9 z" fill="#ffffff" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
          </svg>
        </Link>
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
