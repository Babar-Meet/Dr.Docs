import { Navigate, Route, Routes } from "react-router-dom";
import { ThemeProvider } from "./theme/ThemeProvider.jsx";
import SiteLayout from "./layouts/SiteLayout.jsx";
import LandingPage from "./pages/LandingPage.jsx";
import ConversionsPage from "./pages/ConversionsPage.jsx";
import ToolPage from "./pages/ToolPage.jsx";
import { GENERIC_CONVERT, liveTools } from "./lib/toolConfig";

// One route per available tool, generated from the data. Unavailable tools get
// no route at all: a typed slug for one falls through to the catch-all.
const availableTools = liveTools();

export default function App() {
  return (
    <ThemeProvider>
      <Routes>
        <Route element={<SiteLayout />}>
          <Route path="/" element={<LandingPage />} />
          {/* The conversions page groups every pair by source format; a tile
              links to the tool behind it when one exists, and queued pairs
              show Coming soon. The convert hub is not a TOOLS row either, so
              both register explicitly. */}
          <Route path="/convert" element={<ConversionsPage />} />
          <Route path="/convert-pdf" element={<ToolPage tool={GENERIC_CONVERT} />} />
          {availableTools.map((tool) => (
            <Route
              key={tool.slug}
              path={tool.slug}
              element={<ToolPage tool={tool} />}
            />
          ))}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </ThemeProvider>
  );
}
