
import { createRoot, hydrateRoot } from "react-dom/client";
import App from "./app/App.tsx";
// Design-system base styles (tokens + theme + utilities + @font-face) come from
// the package. Fonts are served from this app's own /public/fonts.
import "@hirobius/design-system/tokens.css";

const rootElement = document.documentElement;
rootElement.dataset['inputModality'] = "keyboard";

window.addEventListener("pointerdown", () => {
  rootElement.dataset['inputModality'] = "pointer";
}, { passive: true });

window.addEventListener("keydown", (event) => {
  if (event.metaKey || event.altKey || event.ctrlKey) return;
  rootElement.dataset['inputModality'] = "keyboard";
});

const container = document.getElementById("root")!;
if (container.firstChild) {
  hydrateRoot(container, <App />);
} else {
  createRoot(container).render(<App />);
}
