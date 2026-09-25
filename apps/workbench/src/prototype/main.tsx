import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@xyflow/react/dist/style.css";
import { ChainStagePrototype } from "./ChainStagePrototype.js";
import "./prototype.css";

createRoot(document.getElementById("root")!).render(<StrictMode><ChainStagePrototype /></StrictMode>);
