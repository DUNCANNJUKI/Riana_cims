import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { installAuthenticatedFetch } from "./lib/authenticatedFetch";

installAuthenticatedFetch();
createRoot(document.getElementById("root")!).render(<App />);
