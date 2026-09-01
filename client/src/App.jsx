import { useEffect, useMemo, useRef, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import {
  Archive,
  CheckCircle2,
  Download,
  FileArchive,
  FileImage,
  FileSpreadsheet,
  FileText,
  LoaderCircle,
  LockOpen,
  Minimize2,
  Moon,
  RotateCw,
  ScanSearch,
  Scissors,
  ShieldAlert,
  Smartphone,
  Split,
  Sun,
  UploadCloud,
  WandSparkles,
  XCircle,
} from "lucide-react";

const API_BASE = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");
const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;

const THEMES = [
  { value: "midnight", label: "Midnight", icon: Moon, title: "Midnight Orange - dark, high contrast" },
  { value: "white", label: "White", icon: Sun, title: "Total White - light, clean" },
  { value: "amoled", label: "AMOLED", icon: Smartphone, title: "AMOLED Dark - pure black, battery friendly" },
];

function getInitialTheme() {
  try {
    const saved = localStorage.getItem("dr-docs-theme");
    if (saved && THEMES.some((t) => t.value === saved)) return saved;
  } catch {}
  return "midnight";
}

const TOOL_ITEMS = [
  {
    value: "unlock",
    label: "Unlock",
    help: "Remove restriction-based protections only",
    detail:
      "Unlock removes edit and copy restrictions where supported. Strong encryption and passwords are never bypassed.",
    icon: LockOpen,
  },
  {
    value: "convert",
    label: "Convert",
    help: "Convert many files at once",
    detail:
      "Batch convert supports Office and image workflows, including PDF to DOCX/PPTX/XLSX where supported by LibreOffice.",
    icon: WandSparkles,
  },
  {
    value: "merge",
    label: "Merge",
    help: "Merge mixed files into one final document",
    detail:
      "Merge can combine PDF, DOCX, PPTX, XLSX, JPG, and PNG into one final PDF or DOCX output.",
    icon: Split,
  },
  {
    value: "split",
    label: "Split",
    help: "Split one PDF into multiple files",
    detail:
      "Split exports real PDF files (not ZIP-only packaging), and each output can be downloaded individually.",
    icon: Scissors,
  },
  {
    value: "ocr",
    label: "OCR",
    help: "Extract text from multiple files",
    detail:
      "OCR/text extraction supports bulk processing and returns individual TXT outputs per file.",
    icon: ScanSearch,
  },
  {
    value: "rotate",
    label: "Rotate",
    help: "Rotate PDF pages 90/180/270",
    detail:
      "Fix sideways phone scans - rotate all pages or select pages like 1,3-5. Encrypted PDFs never bypassed.",
    icon: RotateCw,
  },
  {
    value: "compress",
    label: "Compress",
    help: "Lossless optimize - shrink without quality loss",
    detail:
      "Optimize (lossless): linearizes, dedupes, compresses streams via qpdf. Text 10-40%, scans 5-10% - Phase2 lossy coming. Encrypted never bypassed.",
    icon: Minimize2 || Archive,
  },
];

const CONVERSION_TARGETS = {
  ".pdf": ["docx", "pptx", "xlsx", "odt", "rtf", "txt", "html"],
  ".docx": ["pdf", "odt", "rtf", "txt", "html", "doc", "epub", "pptx"],
  ".pptx": ["pdf", "docx", "odp", "ppt", "html", "txt"],
  ".xlsx": ["pdf", "ods", "xls", "csv", "html", "txt"],
  ".jpg": ["pdf", "png", "webp", "avif", "tiff"],
  ".jpeg": ["pdf", "png", "webp", "avif", "tiff"],
  ".png": ["pdf", "jpg", "jpeg", "webp", "avif", "tiff"],
};

const MERGE_TARGETS = ["pdf", "docx"];

function getExtension(fileName) {
  const splitName = fileName.toLowerCase().split(".");
  return splitName.length > 1 ? `.${splitName.pop()}` : "";
}

function formatBytes(value) {
  if (value === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const sizeIndex = Math.min(
    Math.floor(Math.log(value) / Math.log(1024)),
    units.length - 1,
  );
  const sizedValue = value / 1024 ** sizeIndex;
  return `${sizedValue.toFixed(sizeIndex === 0 ? 0 : 2)} ${units[sizeIndex]}`;
}

function buildEndpoint(pathname) {
  return API_BASE ? `${API_BASE}${pathname}` : pathname;
}

function FileTypeIcon({ extension }) {
  if ([".jpg", ".jpeg", ".png"].includes(extension)) {
    return <FileImage className="h-8 w-8 text-muted" />;
  }
  if (extension === ".xlsx") {
    return <FileSpreadsheet className="h-8 w-8 text-muted" />;
  }
  if (extension === ".zip") {
    return <FileArchive className="h-8 w-8 text-muted" />;
  }
  return <FileText className="h-8 w-8 text-muted" />;
}

function HomePage() {
  const fileInputRef = useRef(null);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [dragActive, setDragActive] = useState(false);
  const [operation, setOperation] = useState("unlock");
  const [theme, setTheme] = useState(() => getInitialTheme());
  const [hoveredOperation, setHoveredOperation] = useState("");
  const [targetFormat, setTargetFormat] = useState("");
  const [pageRanges, setPageRanges] = useState("");
  const [rotationAngle, setRotationAngle] = useState("90");
  const [pages, setPages] = useState("all");
  const [isProcessing, setIsProcessing] = useState(false);
  const [status, setStatus] = useState(null);

  // theme effect - apply data-theme and persist
  useEffect(() => {
    try {
      document.documentElement.setAttribute("data-theme", theme);
      localStorage.setItem("dr-docs-theme", theme);
    } catch {}
  }, [theme]);

  const currentTool = useMemo(
    () => TOOL_ITEMS.find((item) => item.value === operation) || TOOL_ITEMS[0],
    [operation],
  );

  const activeHoverTool = useMemo(
    () =>
      TOOL_ITEMS.find((item) => item.value === hoveredOperation) || currentTool,
    [hoveredOperation, currentTool],
  );

  const convertTargetOptions = useMemo(() => {
    if (operation !== "convert" || selectedFiles.length === 0) {
      return [];
    }

    const targetSets = selectedFiles.map(
      (file) => CONVERSION_TARGETS[getExtension(file.name)] || [],
    );

    if (targetSets.some((set) => set.length === 0)) {
      return [];
    }

    return targetSets.reduce((accumulator, currentSet) =>
      accumulator.filter((value) => currentSet.includes(value)),
    );
  }, [operation, selectedFiles]);

  function setFailure(message, reason) {
    setStatus({
      kind: "failed",
      message,
      reason,
      results: [],
      batchDownloadUrl: "",
    });
  }

  function onOperationChange(nextOperation) {
    setOperation(nextOperation);
    setStatus(null);
    setPageRanges("");
    setRotationAngle("90");
    setPages("all");

    if (nextOperation === "merge") {
      setTargetFormat("pdf");
      return;
    }

    if (nextOperation === "convert") {
      if (selectedFiles.length > 0) {
        const targetSets = selectedFiles.map(
          (file) => CONVERSION_TARGETS[getExtension(file.name)] || [],
        );
        if (targetSets.some((set) => set.length === 0)) {
          setTargetFormat("");
          return;
        }

        const intersection = targetSets.reduce((accumulator, currentSet) =>
          accumulator.filter((value) => currentSet.includes(value)),
        );
        setTargetFormat(intersection[0] || "");
      } else {
        setTargetFormat("");
      }
      return;
    }

    setTargetFormat("");

    if (
      (nextOperation === "split" || nextOperation === "rotate") &&
      selectedFiles.length > 1
    ) {
      setSelectedFiles([selectedFiles[0]]);
    }
  }

  function onPickFiles(fileList) {
    const incomingFiles = Array.from(fileList || []);
    if (incomingFiles.length === 0) return;

    for (const file of incomingFiles) {
      if (file.size > MAX_FILE_SIZE_BYTES) {
        setFailure("Processing failed", "Each file must be 50MB or less");
        return;
      }
    }

    const normalizedFiles =
      operation === "split" || operation === "rotate"
        ? incomingFiles.slice(0, 1)
        : incomingFiles;

    setSelectedFiles(normalizedFiles);
    setStatus(null);

    if (operation === "merge") {
      setTargetFormat("pdf");
      return;
    }

    if (operation === "convert") {
      const targetSets = normalizedFiles.map(
        (file) => CONVERSION_TARGETS[getExtension(file.name)] || [],
      );

      if (targetSets.some((set) => set.length === 0)) {
        setTargetFormat("");
        return;
      }

      const intersection = targetSets.reduce((accumulator, currentSet) =>
        accumulator.filter((value) => currentSet.includes(value)),
      );
      setTargetFormat(intersection[0] || "");
    }
  }

  function onDrop(event) {
    event.preventDefault();
    setDragActive(false);
    onPickFiles(event.dataTransfer.files);
  }

  async function handleSubmit() {
    if (isProcessing) return;
    if (selectedFiles.length === 0) {
      setFailure("Unsupported file", "Please upload file(s) first");
      return;
    }

    if (operation === "merge") {
      if (selectedFiles.length < 2) {
        setFailure("Unsupported file", "Merge requires at least two files");
        return;
      }

      if (!["pdf", "docx"].includes((targetFormat || "").toLowerCase())) {
        setFailure("Unsupported file", "Merge output must be PDF or DOCX");
        return;
      }
    }

    if (operation === "split") {
      if (
        selectedFiles.length !== 1 ||
        getExtension(selectedFiles[0].name) !== ".pdf"
      ) {
        setFailure("Unsupported file", "Split requires exactly one PDF file");
        return;
      }
    }

    if (operation === "convert") {
      if (!targetFormat) {
        setFailure(
          "Unsupported file",
          "No valid conversion target for selected files",
        );
        return;
      }
    }

    if (operation === "rotate") {
      if (
        selectedFiles.length !== 1 ||
        getExtension(selectedFiles[0].name) !== ".pdf"
      ) {
        setFailure("Unsupported file", "Rotate requires exactly one PDF file.");
        return;
      }

      if (!["90", "180", "270"].includes(String(rotationAngle))) {
        setFailure(
          "Unsupported file",
          "Invalid rotation angle. Supported angles are 90, 180, 270.",
        );
        return;
      }

      const pagesTrimmed = pages.trim();
      if (
        pagesTrimmed &&
        pagesTrimmed.toLowerCase() !== "all" &&
        !/^(\d+(-\d+)?)(\s*,\s*\d+(-\d+)?)*$/.test(pagesTrimmed)
      ) {
        setFailure(
          "Unsupported file",
          'Invalid pages value. Use "all" or "1,3-5,8".',
        );
        return;
      }
    }

    if (operation === "compress") {
      const allPdf = selectedFiles.every(
        (file) => getExtension(file.name) === ".pdf",
      );
      if (!allPdf) {
        setFailure("Unsupported file", "Compress supports PDF files only.");
        return;
      }
    }

    setIsProcessing(true);
    setStatus(null);

    try {
      const formData = new FormData();
      formData.append("operation", operation);

      if (operation === "convert" || operation === "merge") {
        formData.append("targetFormat", targetFormat);
      }

      if (operation === "split" && pageRanges.trim()) {
        formData.append("pageRanges", pageRanges.trim());
      }

      if (operation === "rotate") {
        formData.append("rotationAngle", String(rotationAngle));
        formData.append("pages", pages.trim() || "all");
      }

      selectedFiles.forEach((file) => {
        formData.append("files", file);
      });

      const response = await fetch(buildEndpoint("/process"), {
        method: "POST",
        body: formData,
      });

      let payload = {};
      try {
        payload = await response.json();
      } catch {
        payload = {};
      }

      if (!response.ok || payload.status === "failed") {
        setFailure(
          payload.message || "Processing failed",
          payload.reason || "Unknown error",
        );
        return;
      }

      setStatus({
        kind: "success",
        message: payload.message || "Files processed successfully",
        reason:
          payload.results?.length > 0
            ? `${payload.results.length} output file(s) ready`
            : "",
        results: payload.results || [],
        batchDownloadUrl: payload.batchDownloadUrl
          ? buildEndpoint(payload.batchDownloadUrl)
          : "",
      });
    } catch (error) {
      setFailure("Processing failed", error.message || "Network error");
    } finally {
      setIsProcessing(false);
    }
  }

  return (
    <div className="min-h-screen bg-ink text-white">
      {/* Top Navigation - Midnight Orange spec: Ink Black #0B0B0B, 56-64px, border #333333 */}
      <header className="sticky top-0 z-30 border-b border-borderDark bg-ink">
        <div className="mx-auto flex h-[60px] max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-[5px] bg-orange text-sm font-bold text-black">
              D
            </div>
            <div>
              <p className="font-display text-[15px] font-bold leading-none tracking-tight text-white">
                Dr.Docs
              </p>
              <p className="font-mono text-[11px] font-normal leading-none text-muted">
                {theme === "white" ? "TOTAL WHITE" : theme === "amoled" ? "AMOLED DARK" : "MIDNIGHT ORANGE"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center rounded-full border border-borderDark bg-panel p-1">
              {THEMES.map((t) => {
                const Icon = t.icon;
                const isActive = theme === t.value;
                return (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setTheme(t.value)}
                    title={t.title}
                    aria-label={t.title}
                    aria-pressed={isActive}
                    className={
                      "inline-flex h-7 w-7 items-center justify-center rounded-full transition " +
                      (isActive
                        ? "bg-orange text-black"
                        : "text-muted hover:bg-elevated hover:text-white")
                    }
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Tool Navigation - tabs style */}
        <div className="border-t border-borderDark bg-ink">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <nav className="flex items-center gap-1 overflow-x-auto py-2 scrollbar-thin">
              {TOOL_ITEMS.map((item) => {
                const Icon = item.icon;
                const isActive = operation === item.value;
                return (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => onOperationChange(item.value)}
                    onMouseEnter={() => setHoveredOperation(item.value)}
                    onMouseLeave={() => setHoveredOperation("")}
                    onFocus={() => setHoveredOperation(item.value)}
                    onBlur={() => setHoveredOperation("")}
                    className={
                      "inline-flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-[13px] font-bold leading-none transition " +
                      (isActive
                        ? "border-orange bg-panel text-orange"
                        : "border-transparent text-muted hover:bg-panel hover:text-white")
                    }
                    title={item.help}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </button>
                );
              })}
            </nav>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
          {/* Left Column */}
          <div className="space-y-4">
            {/* Tool header card */}
            <section className="rounded-[6px] border border-borderDark bg-panel p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h1 className="font-display text-[20px] font-bold leading-tight text-white">
                    {currentTool.label}
                  </h1>
                  <p className="mt-1 font-body text-[13px] font-medium leading-normal text-offWhite">
                    {currentTool.help}
                  </p>
                </div>
                <span className="shrink-0 rounded-full border border-orange/30 bg-orange/10 px-2.5 py-1 font-mono text-[11px] font-semibold text-orange">
                  {TOOL_ITEMS.findIndex((t) => t.value === operation) + 1} / {TOOL_ITEMS.length}
                </span>
              </div>

              <div className="mt-4 rounded-[5px] border border-borderDark bg-deep p-3">
                <p className="font-display text-[12px] font-semibold uppercase tracking-[0.08em] text-muted">
                  Tool details
                </p>
                <p className="mt-2 font-body text-[13px] leading-[1.5] text-offWhite">
                  {activeHoverTool.detail}
                </p>
                <p className="mt-3 flex items-center gap-2 font-mono text-[11px] leading-none text-muted">
                  <ShieldAlert className="h-3.5 w-3.5 shrink-0 text-muted" />
                  Security boundary: strong encryption never bypassed.
                </p>
              </div>
            </section>

            {/* Drop zone - Midnight Orange inputs spec */}
            <section
              onDragOver={(event) => {
                event.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
              className={
                "cursor-pointer rounded-[6px] border-2 border-dashed p-8 text-center transition " +
                (dragActive
                  ? "border-orange bg-elevated"
                  : "border-borderStrong bg-deep hover:border-[#666666] hover:bg-panel")
              }
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple={operation !== "split" && operation !== "rotate"}
                className="hidden"
                onChange={(event) => onPickFiles(event.target.files)}
              />
              <UploadCloud
                className={"mx-auto h-10 w-10 " + (dragActive ? "text-orange" : "text-muted")}
              />
              <p className="mx-auto mt-4 max-w-[28ch] font-display text-[15px] font-bold leading-tight text-white">
                {operation === "split" || operation === "rotate"
                  ? "Drop one PDF file, or click to upload"
                  : "Drag and drop file(s), or click to upload"}
              </p>
              <p className="mt-2 font-body text-[13px] text-muted">
                Supported: PDF, DOCX, PPTX, XLSX, JPG, PNG, ZIP (max 50MB each)
              </p>
              <p className="mt-3 inline-flex items-center gap-2 rounded-full border border-borderDark bg-panel px-3 py-1 font-mono text-[11px] text-muted">
                Click to browse - Batch up to 200 files
              </p>
            </section>

            {/* Selected files */}
            {selectedFiles.length > 0 && (
              <section className="rounded-[6px] border border-borderDark bg-panel p-4">
                <div className="mb-3 flex items-center justify-between">
                  <p className="font-display text-[12px] font-semibold uppercase tracking-[0.08em] text-muted">
                    Selected files - {selectedFiles.length}
                  </p>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedFiles([]);
                      setStatus(null);
                    }}
                    className="rounded-[5px] border border-borderStrong bg-deep px-2.5 py-1 font-body text-xs font-semibold text-offWhite hover:bg-elevated hover:text-white"
                  >
                    Clear
                  </button>
                </div>
                <div className="space-y-0 divide-y divide-borderDark">
                  {selectedFiles.map((file) => (
                    <div
                      key={`${file.name}-${file.size}`}
                      className="flex items-start gap-3 py-3 first:pt-0 last:pb-0"
                    >
                      <FileTypeIcon extension={getExtension(file.name)} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-body text-[13px] font-semibold leading-tight text-white">
                          {file.name}
                        </p>
                        <p className="mt-1 font-mono text-[11px] leading-none text-muted">
                          {formatBytes(file.size)} - {file.type || "Unknown MIME"}
                        </p>
                      </div>
                      <span className="shrink-0 rounded-full bg-deep px-2 py-1 font-mono text-[11px] text-muted">
                        {getExtension(file.name).replace(".", "").toUpperCase() || "FILE"}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>

          {/* Right Column - Controls */}
          <aside className="space-y-4">
            {operation === "convert" && (
              <section className="rounded-[6px] border border-borderDark bg-panel p-4">
                <p className="font-display text-[12px] font-semibold uppercase tracking-[0.08em] text-muted">
                  Convert Target
                </p>
                <select
                  value={targetFormat}
                  onChange={(event) => setTargetFormat(event.target.value)}
                  disabled={convertTargetOptions.length === 0}
                  className="mt-3 w-full rounded-[5px] border border-borderStrong bg-deep px-3 py-2.5 font-body text-[14px] text-white outline-none transition placeholder:text-[#777777] hover:border-[#666666] focus:border-orange focus:ring-2 focus:ring-orange/20 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {convertTargetOptions.length === 0 && (
                    <option value="">Not available - select supported files</option>
                  )}
                  {convertTargetOptions.map((target) => (
                    <option key={target} value={target}>
                      .{target}
                    </option>
                  ))}
                </select>
                {convertTargetOptions.length === 0 && (
                  <p className="mt-2 font-body text-xs text-muted">
                    No common target for current files. Add compatible files.
                  </p>
                )}
              </section>
            )}

            {operation === "merge" && (
              <section className="rounded-[6px] border border-borderDark bg-panel p-4">
                <p className="font-display text-[12px] font-semibold uppercase tracking-[0.08em] text-muted">
                  Merge Output Format
                </p>
                <select
                  value={targetFormat}
                  onChange={(event) => setTargetFormat(event.target.value)}
                  className="mt-3 w-full rounded-[5px] border border-borderStrong bg-deep px-3 py-2.5 font-body text-[14px] text-white outline-none transition hover:border-[#666666] focus:border-orange focus:ring-2 focus:ring-orange/20"
                >
                  {MERGE_TARGETS.map((target) => (
                    <option key={target} value={target}>
                      .{target}
                    </option>
                  ))}
                </select>
                <p className="mt-2 font-body text-xs text-muted">
                  Mixed files merge into one PDF or DOCX.
                </p>
              </section>
            )}

            {operation === "split" && (
              <section className="rounded-[6px] border border-borderDark bg-panel p-4">
                <p className="font-display text-[12px] font-semibold uppercase tracking-[0.08em] text-muted">
                  Split Page Ranges
                </p>
                <input
                  type="text"
                  value={pageRanges}
                  onChange={(event) => setPageRanges(event.target.value)}
                  placeholder="Example: 1-3,5,7-10"
                  className="mt-3 w-full rounded-[5px] border border-borderStrong bg-deep px-3 py-2.5 font-body text-[14px] text-white outline-none transition placeholder:text-[#777777] hover:border-[#666666] focus:border-orange focus:ring-2 focus:ring-orange/20"
                />
                <p className="mt-2 font-body text-xs text-muted">
                  Leave empty to split all pages individually.
                </p>
              </section>
            )}

            {operation === "rotate" && (
              <section className="rounded-[6px] border border-borderDark bg-panel p-4">
                <p className="font-display text-[12px] font-semibold uppercase tracking-[0.08em] text-muted">
                  Rotate Options
                </p>
                <label className="mt-3 block font-display text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">
                  Rotation Angle
                </label>
                <select
                  value={rotationAngle}
                  onChange={(event) => setRotationAngle(event.target.value)}
                  className="mt-1.5 w-full rounded-[5px] border border-borderStrong bg-deep px-3 py-2.5 font-body text-[14px] text-white outline-none transition hover:border-[#666666] focus:border-orange focus:ring-2 focus:ring-orange/20"
                >
                  <option value="90">90deg - Quarter turn</option>
                  <option value="180">180deg - Half turn</option>
                  <option value="270">270deg - Three quarter</option>
                </select>
                <label className="mt-3 block font-display text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">
                  Pages
                </label>
                <input
                  type="text"
                  value={pages}
                  onChange={(event) => setPages(event.target.value)}
                  placeholder="all or 1,3-5,8"
                  className="mt-1.5 w-full rounded-[5px] border border-borderStrong bg-deep px-3 py-2.5 font-body text-[14px] text-white outline-none transition placeholder:text-[#777777] hover:border-[#666666] focus:border-orange focus:ring-2 focus:ring-orange/20"
                />
                <p className="mt-2 font-body text-xs text-muted">
                  Use "all" or list pages like 1,3-5,8.
                </p>
              </section>
            )}

            {operation === "compress" && (
              <section className="rounded-[6px] border border-borderDark bg-panel p-4">
                <p className="font-display text-[12px] font-semibold uppercase tracking-[0.08em] text-muted">
                  Compress PDF
                </p>
                <p className="mt-3 font-body text-[13px] leading-[1.5] text-offWhite">
                  Lossless optimize - linearizes, dedupes objects, and compresses streams via qpdf.
                  Text PDFs shrink 10-40%, scans 5-10% with no quality loss.
                </p>
                <div className="mt-3 rounded-[5px] border border-borderDark bg-deep p-3">
                  <p className="font-mono text-[11px] leading-[1.4] text-muted">
                    PDFs only - Batch supported (up to 200) - 50MB per file - Encrypted files are never
                    bypassed. Phase 2 lossy 60-72% coming.
                  </p>
                </div>
              </section>
            )}

            {operation === "unlock" && (
              <section className="rounded-[6px] border border-borderDark bg-panel p-4">
                <p className="font-display text-[12px] font-semibold uppercase tracking-[0.08em] text-muted">
                  Unlock
                </p>
                <p className="mt-2 font-body text-[13px] leading-[1.5] text-offWhite">
                  Removes edit and copy restrictions only. Password-protected and strongly encrypted files
                  are never bypassed.
                </p>
              </section>
            )}

            {operation === "ocr" && (
              <section className="rounded-[6px] border border-borderDark bg-panel p-4">
                <p className="font-display text-[12px] font-semibold uppercase tracking-[0.08em] text-muted">
                  OCR - Text Extraction
                </p>
                <p className="mt-2 font-body text-[13px] leading-[1.5] text-offWhite">
                  Extracts text from PDFs and images. Batch supported - returns one TXT per file.
                </p>
                <p className="mt-2 font-mono text-[11px] text-muted">
                  Uses Tesseract - English trained data included (eng.traineddata).
                </p>
              </section>
            )}

            {/* Primary CTA - Orange #FF9900 */}
            <button
              type="button"
              onClick={handleSubmit}
              disabled={selectedFiles.length === 0 || isProcessing}
              className="inline-flex w-full items-center justify-center gap-2 rounded-[5px] bg-orange px-5 py-3 font-display text-[13px] font-bold leading-none text-black transition hover:bg-orangeSoft active:bg-orangeDark disabled:cursor-not-allowed disabled:border disabled:border-borderDark disabled:bg-elevated disabled:text-muted"
            >
              {isProcessing ? (
                <>
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <WandSparkles className="h-4 w-4" />
                  Process Files
                </>
              )}
            </button>

            {status && (
              <section
                className={
                  "rounded-[6px] border p-4 " +
                  (status.kind === "success"
                    ? "border-success bg-successBg"
                    : "border-error bg-errorBg")
                }
              >
                <div className="flex items-start gap-3">
                  {status.kind === "success" ? (
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" />
                  ) : (
                    <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-error" />
                  )}
                  <div className="min-w-0 space-y-1">
                    <p
                      className={
                        "font-display text-[13px] font-bold leading-tight " +
                        (status.kind === "success" ? "text-successText" : "text-errorText")
                      }
                    >
                      {status.message}
                    </p>
                    {status.reason && (
                      <p
                        className={
                          "font-body text-[13px] leading-normal " +
                          (status.kind === "success" ? "text-successText/80" : "text-errorText/80")
                        }
                      >
                        {status.reason}
                      </p>
                    )}
                  </div>
                </div>

                {status.kind === "success" && status.batchDownloadUrl && (
                  <a
                    href={status.batchDownloadUrl}
                    download
                    className="mt-4 inline-flex items-center gap-2 rounded-[5px] bg-orange px-4 py-2 font-display text-[13px] font-bold text-black transition hover:bg-orangeSoft"
                  >
                    <Download className="h-4 w-4" />
                    Download All
                  </a>
                )}

                {status.kind === "success" && status.results?.length > 0 && (
                  <div className="mt-4 space-y-2">
                    {status.results.map((item) => (
                      <div
                        key={item.downloadId}
                        className="flex items-center justify-between gap-3 rounded-[5px] border border-success/30 bg-ink/40 px-3 py-2.5"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-body text-xs font-semibold text-white">
                            {item.downloadName}
                          </p>
                          <p className="truncate font-mono text-[11px] text-successText/70">
                            {item.message}
                          </p>
                        </div>
                        <a
                          href={buildEndpoint(item.downloadUrl)}
                          download={item.downloadName}
                          className="ml-2 inline-flex shrink-0 items-center gap-1 rounded-[5px] bg-success px-2.5 py-1.5 font-display text-xs font-bold text-black hover:bg-[#1a9c4a]"
                        >
                          <Download className="h-3 w-3" />
                          Download
                        </a>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}

            <section className="rounded-[6px] border border-warning/30 bg-warningBg p-3">
              <p className="flex items-start gap-2 font-body text-[13px] font-medium leading-[1.4] text-warningText">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                Security policy: strong encryption, password protection, and DRM are never bypassed.
              </p>
            </section>

            <section className="rounded-[6px] border border-borderDark bg-panel p-3">
              <p className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted">
                Limits
              </p>
              <div className="mt-2 grid grid-cols-3 gap-2">
                <div className="rounded-[5px] bg-deep px-2 py-2 text-center">
                  <p className="font-display text-sm font-bold text-orange">50 MB</p>
                  <p className="font-mono text-[11px] text-muted">per file</p>
                </div>
                <div className="rounded-[5px] bg-deep px-2 py-2 text-center">
                  <p className="font-display text-sm font-bold text-white">200</p>
                  <p className="font-mono text-[11px] text-muted">max files</p>
                </div>
                <div className="rounded-[5px] bg-deep px-2 py-2 text-center">
                  <p className="font-display text-sm font-bold text-white">2</p>
                  <p className="font-mono text-[11px] text-muted">concurrent</p>
                </div>
              </div>
            </section>
          </aside>
        </div>

        <footer className="mt-8 border-t border-borderDark pt-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="font-mono text-[11px] text-muted">
              Dr.Docs - Midnight Orange - Black structure + white content + gray hierarchy + orange
              action
            </p>
            <p className="font-mono text-[11px] text-muted">
              DESIGN.md / THEME.md is the single source of truth
            </p>
          </div>
        </footer>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
