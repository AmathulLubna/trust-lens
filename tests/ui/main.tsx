import { ThemeProvider } from "../../src/components/ThemeProvider";
import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import UploadCheck from "../../src/components/dashboard/UploadCheck";
import LiveGuard from "../../src/components/dashboard/LiveGuard";
import History from "../../src/components/dashboard/History";
import MessageCheck from "../../src/components/dashboard/MessageCheck";
import NumberCheck from "../../src/components/dashboard/NumberCheck";
import Settings from "../../src/components/dashboard/Settings";
import Landing from "../../src/pages/Landing";
import "../../src/index.css";
const nativeFetch = window.fetch.bind(window);
window.fetch = async (input, init) =>
  String(input).includes("/audio/upload")
    ? Response.json({ storageId: "local-fixture-storage" })
    : nativeFetch(input, init);
function Harness() {
  const [tab, setTab] = useState("Upload");
  const components = {
    Upload: UploadCheck,
    Microphone: LiveGuard,
    History,
    Message: MessageCheck,
    Number: NumberCheck,
    Settings,
    Landing,
  };
  const Component = components[tab as keyof typeof components];
  return (
    <>
      <header className="border-b p-4">
        <strong>
          LOCAL UI TEST HARNESS · external services mocked · fixtures only
        </strong>
        <p>Not a production detection result.</p>
        <label>
          Fixture response{" "}
          <select id="fixture-mode">
            <option value="unavailable">Service unavailable</option>
            <option value="request">Hindi request</option>
            <option value="benign">No strong indicators</option>
          </select>
        </label>
        <nav className="flex flex-wrap gap-3 py-3">
          {Object.keys(components).map((key) => (
            <button
              key={key}
              className="rounded border p-2"
              onClick={() => setTab(key)}
            >
              {key}
            </button>
          ))}
        </nav>
      </header>
      <div className="p-6">
        <Component />
      </div>
    </>
  );
}
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <BrowserRouter>
        <Harness />
      </BrowserRouter>
    </ThemeProvider>
  </StrictMode>,
);
