import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import AuthGate from "./auth";
import App from "./app";
import "./styles.css";
createRoot(document.getElementById("root")).render(
  <StrictMode>
    <AuthGate>
      <App />
    </AuthGate>
  </StrictMode>,
);
