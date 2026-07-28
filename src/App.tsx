tsx
import React, { useState, useEffect } from 'react';
import { Provider } from 'react-redux';
import { store } from './app/store';
import Dashboard from './features/dashboard/Dashboard';
import EditorLayout from './features/editor/EditorLayout';
import { useAppSelector } from './app/store';

function AppContent() {
  const activeProjectId = useAppSelector(
    (state) => state.projects.activeProjectId
  );

  if (!activeProjectId) {
    return <Dashboard />;
  }
  return <EditorLayout projectId={activeProjectId} />;
}

export default function App() {
  return (
    <Provider store={store}>
      <AppContent />
    </Provider>
  );
}