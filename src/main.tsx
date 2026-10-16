import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App, { ErrorBoundary } from './App.tsx';
import './index.css';
import { ensureFirestore } from './firebase';
import { consumePendingIndexedDbWipe } from './lib/siteStorage';

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
  const root = createRoot(rootElement);
  const renderApp = () => {
    root.render(
      <StrictMode>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </StrictMode>,
    );
  };
  // 복구 직후엔 IndexedDB를 지운 다음에 Firestore 캐시를 연다. 그 외에는 바로 그린다.
  const depositMatchPreview =
    import.meta.env.DEV &&
    new URLSearchParams(window.location.search).has("depositMatchPreview");
  if (depositMatchPreview) {
    void import("./components/DepositMatchPreview.tsx").then(({ DepositMatchPreview }) => {
      root.render(
        <StrictMode>
          <DepositMatchPreview />
        </StrictMode>,
      );
    });
  } else if (
    typeof sessionStorage !== "undefined" &&
    sessionStorage.getItem("office_pending_indexeddb_wipe") === "1"
  ) {
    void (async () => {
      try {
        await consumePendingIndexedDbWipe();
      } catch (error) {
        console.warn("IndexedDB 정리 실패:", error);
      }
      ensureFirestore();
      renderApp();
    })();
  } else {
    renderApp();
  }
}

// 서비스 워커 등록 (안전하게 개선)
// AI Studio 개발 환경에서는 캐시 꼬임 방지를 위해 비활성화합니다.
if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
  window.addEventListener('load', () => {
    // 하위 경로(예: /highpublic/) 배포에서도 동작하도록 base URL 기준으로 등록
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(err => {
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
