import { Component, type ErrorInfo, type ReactNode, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.tsx';
import { ToastProvider } from './contexts/ToastContext.tsx';
import { WalletProvider } from './contexts/WalletContext.tsx';
import './index.css';

class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 24, fontFamily: 'system-ui, sans-serif', maxWidth: 720 }}>
          <h1 style={{ color: '#b91c1c', fontSize: '1.25rem' }}>This page failed to load</h1>
          <p style={{ color: '#374151', fontSize: 14 }}>
            Open the browser developer console (F12 → Console) for details. Error:
          </p>
          <pre
            style={{
              whiteSpace: 'pre-wrap',
              fontSize: 12,
              background: '#f3f4f6',
              padding: 12,
              borderRadius: 6,
            }}
          >
            {this.state.error.message}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}

const el = document.getElementById('root');
if (!el) {
  throw new Error('Missing #root element');
}

createRoot(el).render(
  <StrictMode>
    <BrowserRouter>
      <WalletProvider>
        <ToastProvider>
          <ErrorBoundary>
            <App />
          </ErrorBoundary>
        </ToastProvider>
      </WalletProvider>
    </BrowserRouter>
  </StrictMode>
);
