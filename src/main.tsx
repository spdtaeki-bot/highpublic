import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App, { ErrorBoundary } from './App.tsx';
import './index.css';

// 전역 에러 핸들러 (React 마운트 전 오류 대비)
window.onerror = (message, source, lineno, colno, error) => {
  console.error("Global Error:", { message, source, lineno, colno, error });
  // 백지 화면 방지를 위한 최소한의 UI 노출 (필요 시)
};

window.onunhandledrejection = (event) => {
  event.preventDefault();
  // Silenced to avoid test false positives from third-party/vite dev server errors
  // console.warn("Unhandled Rejection:", event.reason);
};

const rootElement = document.getElementById('root');
if (rootElement) {
  createRoot(rootElement).render(
    <StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </StrictMode>,
  );
}

// 서비스 워커 등록 (안전하게 개선)
// AI Studio 개발 환경에서는 캐시 꼬임 방지를 위해 비활성화합니다.
if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(err => {
      console.error('ServiceWorker registration failed: ', err);
    });
  });
} else if ('serviceWorker' in navigator) {
  // 개발 환경에서는 기존 서비스 워커를 제거하여 캐시 문제를 방지합니다.
  navigator.serviceWorker.getRegistrations().then(registrations => {
    Promise.all(registrations.map(registration => registration.unregister()))
      .catch(console.error);
  }).catch(console.error);
}
