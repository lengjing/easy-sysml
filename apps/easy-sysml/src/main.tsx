import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { ApiKeyAdminPage } from './components/ApiKeyAdminPage.tsx';
import './index.css';

const pathname = window.location.pathname.replace(/\/+$/, '') || '/';
const isApiKeyAdminRoute = pathname === '/admin/api-keys';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isApiKeyAdminRoute ? <ApiKeyAdminPage /> : <App />}
  </StrictMode>,
);
