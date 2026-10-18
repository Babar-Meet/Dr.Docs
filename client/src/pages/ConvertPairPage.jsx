import { Navigate, useParams } from "react-router-dom";
import ToolPage from "./ToolPage";
import { findPairTool } from "../lib/conversionsHub";

// One specific screen per live conversion pair that has no dedicated tool
// page: the title and badges say the pair, the target is locked, and no
// format picker shows. Unknown pair slugs fall back to the hub.
export default function ConvertPairPage() {
  const { pair } = useParams();
  const tool = findPairTool(pair);
  if (!tool) return <Navigate to="/convert" replace />;
  return <ToolPage tool={tool} />;
}
