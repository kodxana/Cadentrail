import React from "react";
import { createRoot } from "react-dom/client";
import App, { Boundary } from "./App";
import OptionalModelDialog from "./OptionalModelDialog";
import { HelpProvider } from "./Help";
import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/500.css";
import "@fontsource/dm-sans/600.css";
import "@fontsource/manrope/500.css";
import "@fontsource/manrope/600.css";
import "@fontsource/manrope/700.css";
import "./theme.css";
import "./style.css";
import "./redesign.css";
import "./library.css";
import "./liveLyrics.css";
import "./experience.css";
import "./components.css";
import "./radio.css";
import "./help.css";
import "./generation.css";
createRoot(document.getElementById("root")!).render(
  <Boundary>
    <HelpProvider>
      <App />
      <OptionalModelDialog />
    </HelpProvider>
  </Boundary>,
);
