import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import App from "@/App";

import "@/utils/serialization";

import "@galaxy-io/dls/styles.css";
import "@galaxy-io/dls/tokens.css";
import "@galaxy-io/dls/fonts.css";

import { GalaxyTheme } from "@galaxy-io/dls/theme/enums";
import GalaxyProvider from "@galaxy-io/dls/theme/GalaxyProvider";

import TransportQueryClientProvider from "@/api/TransportQueryClientProvider";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Root element not found");
}
const root = createRoot(rootElement);
root.render(
  <StrictMode>
    <GalaxyProvider theme={GalaxyTheme.SYSTEM}>
      <TransportQueryClientProvider>
        <App />
      </TransportQueryClientProvider>
    </GalaxyProvider>
  </StrictMode>,
);
