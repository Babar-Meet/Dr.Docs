import { Outlet } from "react-router-dom";
import Header from "../components/shell/Header.jsx";
import Footer from "../components/shell/Footer.jsx";
import Flashbang from "../components/shell/Flashbang.jsx";

// LandingPage and ToolPage each render their own <main> landmark, so the
// Outlet is deliberately not wrapped in a second one.
export default function SiteLayout() {
  return (
    <div className="min-h-screen bg-ink text-white">
      <Header />
      <Outlet />
      <Footer />
      <Flashbang />
    </div>
  );
}
