import { DashboardPage } from './pages/DashboardPage'
import { ErrorBoundary } from './components/ErrorBoundary'

export function App() {
  return (
    <ErrorBoundary>
      <DashboardPage />
    </ErrorBoundary>
  )
}

export default App
