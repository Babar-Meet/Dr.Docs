import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import cors from "cors";
import fs from "fs-extra";
import filesRouter from "./routes/files.js";
import { ensureRuntimeDirectories, PORT } from "./config.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import { startDownloadCleanupScheduler } from "./services/downloadStore.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CLIENT_DIST_DIR = path.resolve(__dirname, "../../client/dist");
const CLIENT_INDEX_HTML = path.join(CLIENT_DIST_DIR, "index.html");

const app = express();

app.disable("x-powered-by");
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/health", (_req, res) => {
  res.status(200).json({
    status: "ok",
    service: "dr-docs",
  });
});

app.use(filesRouter);

const hasClientBuild = await fs.pathExists(CLIENT_INDEX_HTML);

if (hasClientBuild) {
  app.use(express.static(CLIENT_DIST_DIR));

  app.get("*", (req, res, next) => {
    if (
      req.path.startsWith("/process") ||
      req.path.startsWith("/download") ||
      req.path === "/health"
    ) {
      next();
      return;
    }

    res.sendFile(CLIENT_INDEX_HTML);
  });
} else {
  app.get("/", (_req, res) => {
    res.status(200).json({
      status: "ok",
      service: "dr-docs",
      message:
        "Frontend build not found. In development, open http://localhost:5173. For production, run npm run build -w client first.",
    });
  });
}

app.use(notFoundHandler);
app.use(errorHandler);

await ensureRuntimeDirectories();
startDownloadCleanupScheduler();

app.listen(PORT, () => {
  console.log(`Dr.Docs API listening on port ${PORT}`);
});
