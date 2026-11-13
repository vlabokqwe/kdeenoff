import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AdminApp } from "./AdminApp";

const rootEl = document.getElementById("root");
if (!rootEl) {
  throw new Error("Missing #root element in admin/index.html");
}

createRoot(rootEl).render(
  <StrictMode>
    <AdminApp />
  </StrictMode>,
);
