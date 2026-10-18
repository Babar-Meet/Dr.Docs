import { Navigate, Route, Routes } from "react-router-dom";
import { ThemeProvider } from "./theme/ThemeProvider.jsx";
import SiteLayout from "./layouts/SiteLayout.jsx";
import LandingPage from "./pages/LandingPage.jsx";
import ConversionsPage from "./pages/ConversionsPage.jsx";
import ConvertPairPage from "./pages/ConvertPairPage.jsx";
import ToolPage from "./pages/ToolPage.jsx";
import { liveTools } from "./lib/toolConfig";

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
          {/* Every live pair without a dedicated tool page opens its own
              screen: the title and badges carry the pair, the target is
              locked, and no format picker exists. Unknown pair slugs fall
              back to the hub. The old /convert-pdf generic page is gone, so
              its URL points at the hub. */}
          <Route path="/convert/:pair" element={<ConvertPairPage />} />
          <Route path="/convert-pdf" element={<Navigate to="/convert" replace />} />
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
