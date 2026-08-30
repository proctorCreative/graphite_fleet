import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import GraphiteFleet from "./GraphiteFleet";
import "./globals.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <GraphiteFleet />
  </StrictMode>,
);
