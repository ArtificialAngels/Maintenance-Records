import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from './App';
import { useAuthStore } from './stores/authStore';
import { ToastHost } from './components/Toaster';
import { ConfirmHost } from './components/ConfirmDialog';
import './styles.css';

useAuthStore.getState().hydrate();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { refetchOnWindowFocus: false, retry: 1 },
  },
});

const root = createRoot(document.getElementById('root')!);
root.render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
        <ToastHost />
        <ConfirmHost />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);