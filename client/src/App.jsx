import { Navigate, Route, Routes } from "react-router-dom";
import { ThemeProvider } from "./theme/ThemeProvider.jsx";
import SiteLayout from "./layouts/SiteLayout.jsx";
import LandingPage from "./pages/LandingPage.jsx";
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
          {/* The convert hub is not a TOOLS row, so it is registered explicitly. */}
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
