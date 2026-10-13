import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from './lib/auth';
import { I18nProvider } from './lib/i18n';
import { ThemeProvider } from './lib/theme';
import App from './App';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: (count, err) => count < 2 && !(err?.response?.status >= 400 && err?.response?.status < 500),
    },
  },
});

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ThemeProvider>
        <I18nProvider>
          <AuthProvider>
            <App />
            <Toaster position="top-center" toastOptions={{ style: { borderRadius: '2px', fontSize: '14px', background: 'var(--color-white)', color: 'var(--color-ink)' } }} />
          </AuthProvider>
        </I18nProvider>
        </ThemeProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
