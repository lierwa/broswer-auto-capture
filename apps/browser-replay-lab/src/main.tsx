import React from "react"
import ReactDOM from "react-dom/client"
import "@radix-ui/themes/styles.css"
import { FixtureShell } from "./FixtureShell.js"
import { FrameDocument } from "./scenarios/overlays.js"
import { DTaskSurface } from "./DTaskSurface.js"
import "./styles.css"

const root = document.getElementById("root")
if (!root) throw new Error("fixture_root_missing")
ReactDOM.createRoot(root).render(<React.StrictMode>
  {location.pathname.startsWith("/frame/") ? <FrameDocument />
    : location.pathname === "/d-task" ? <DTaskSurface /> : <FixtureShell />}
</React.StrictMode>)
