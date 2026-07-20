import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createHashRouter, RouterProvider } from 'react-router-dom'
import './index.css'
import App from './App'
import Home from './pages/Home'
import Roster from './pages/Roster'
import Pitchers from './pages/Pitchers'
import PitcherReport from './pages/PitcherReport'
import NewGame from './pages/NewGame'
import LiveGame from './pages/LiveGame'
import Games from './pages/Games'
import GameDetail from './pages/GameDetail'
import BatterReport from './pages/BatterReport'
import Settings from './pages/Settings'

const router = createHashRouter([
  {
    path: '/',
    element: <App />,
    children: [
      { index: true, element: <Home /> },
      { path: 'opponent/:id', element: <Roster /> },
      { path: 'pitchers', element: <Pitchers /> },
      { path: 'pitcher/:id', element: <PitcherReport /> },
      { path: 'new-game', element: <NewGame /> },
      { path: 'game/:id', element: <LiveGame /> },
      { path: 'games', element: <Games /> },
      { path: 'games/:id', element: <GameDetail /> },
      { path: 'batter/:id', element: <BatterReport /> },
      { path: 'settings', element: <Settings /> },
    ],
  },
])

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
