import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App, { ErrorBoundary } from "./App.tsx";
import "./index.css";
import { SAMPLE_DATE } from "./preview/sampleData";

localStorage.setItem("office_auth", "true");
localStorage.setItem("office_view_mode", "unpaid");
localStorage.setItem("office_selected_date", SAMPLE_DATE);

const rootElement = document.getElementById("root");
if (rootElement) {
  createRoot(rootElement).render(
    <StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </StrictMode>,
  );
}
