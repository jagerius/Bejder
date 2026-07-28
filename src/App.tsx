tsx
import { Provider } from 'react-redux';
import { store, useAppSelector } from './app/store';
import Dashboard from './features/dashboard/Dashboard';
import EditorLayout from './features/editor/EditorLayout';
import { ErrorBoundary } from './shared/ui/ErrorBoundary';

function AppContent() {
  const activeProjectId = useAppSelector(
    (state) => state.projects.activeProjectId
  );

  if (activeProjectId === null) {
    return <Dashboard />;
  }
  return <EditorLayout projectId={activeProjectId} />;
}

export default function App() {
  return (
    <ErrorBoundary>
      <Provider store={store}>
        <AppContent />
      </Provider>
    </ErrorBoundary>
  );
}