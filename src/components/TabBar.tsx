import type { ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'

type TabId = 'home' | 'teams' | 'pitchers' | 'games' | 'settings'

function activeTab(pathname: string): TabId | null {
  if (pathname === '/' || pathname === '/new-game') return 'home'
  if (pathname.startsWith('/teams') || pathname.startsWith('/opponent') || pathname.startsWith('/batter')) return 'teams'
  if (pathname.startsWith('/pitcher')) return 'pitchers'
  if (pathname === '/games' || pathname.startsWith('/games/')) return 'games'
  if (pathname.startsWith('/settings')) return 'settings'
  return null
}

const tabs: Array<{ id: TabId; to: string; label: string; icon: ReactNode }> = [
  {
    id: 'home',
    to: '/',
    label: 'Home',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8" />
        <path d="M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      </svg>
    ),
  },
  {
    id: 'teams',
    to: '/teams',
    label: 'Teams',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
  {
    id: 'pitchers',
    to: '/pitchers',
    label: 'Pitchers',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="9" />
        <path d="M7.2 5.8c2.2 2 3.3 4.5 3.3 6.2s-1.1 4.2-3.3 6.2" />
        <path d="M16.8 5.8c-2.2 2-3.3 4.5-3.3 6.2s1.1 4.2 3.3 6.2" />
      </svg>
    ),
  },
  {
    id: 'games',
    to: '/games',
    label: 'Games',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M8 2v4" />
        <path d="M16 2v4" />
        <rect width="18" height="18" x="3" y="4" rx="2" />
        <path d="M3 10h18" />
      </svg>
    ),
  },
  {
    id: 'settings',
    to: '/settings',
    label: 'Settings',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    ),
  },
]

export default function TabBar() {
  const { pathname } = useLocation()
  const current = activeTab(pathname)

  return (
    <nav className="tabbar" aria-label="Main">
      {tabs.map((tab) => (
        <Link
          key={tab.id}
          to={tab.to}
          className={current === tab.id ? 'tab active' : 'tab'}
          aria-current={current === tab.id ? 'page' : undefined}
        >
          {tab.icon}
          {tab.label}
        </Link>
      ))}
    </nav>
  )
}
