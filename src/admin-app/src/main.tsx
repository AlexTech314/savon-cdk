import { createRoot } from "react-dom/client";
import { configureAmplify } from "./lib/amplify-config";
import App from "./App.tsx";
import "./index.css";

// Configure Amplify before rendering
configureAmplify();

createRoot(document.getElementById("root")!).render(<App />);
