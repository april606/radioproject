import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "mapbox-gl/dist/mapbox-gl.css";
import "./styles.css";
import App from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App mapboxToken={import.meta.env.VITE_MAPBOX_ACCESS_TOKEN} />
  </StrictMode>,
);
