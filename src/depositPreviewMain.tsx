import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { DepositMatchPreview } from "./components/DepositMatchPreview";

const rootElement = document.getElementById("root");
if (rootElement) {
  createRoot(rootElement).render(
    <StrictMode>
      <DepositMatchPreview />
    </StrictMode>,
  );
}
