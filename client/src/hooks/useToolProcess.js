import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buildEndpoint, submitProcess } from "../lib/api";
import { CONVERSION_TARGETS } from "../lib/conversionTargets";
import { fileKey, getExtension, MAX_FILE_SIZE_BYTES } from "../lib/fileUtils";
import { inspectFile, KNOWN_EXTENSIONS } from "../lib/fileInspect";

const ROTATION_ANGLES = ["90", "180", "270"];
const PAGE_RANGE_PATTERN = /^(\d+(-\d+)?)(\s*,\s*\d+(-\d+)?)*$/;

// Ordered intersection of the selected files' conversion targets. An empty list
// means either no files, or at least one file with no known target set.
function commonConvertTargets(files) {
  const targetSets = files.map(
    (file) => CONVERSION_TARGETS[getExtension(file.name)] || [],
  );

  if (targetSets.some((set) => set.length === 0)) {
    return [];
  }

  return targetSets.reduce((accumulator, currentSet) =>
    accumulator.filter((value) => currentSet.includes(value)),
  );
}

function describeExtensions(extensions) {
  return extensions.map((extension) => extension.replace(".", "").toUpperCase()).join(", ");
}

export default function useToolProcess(tool) {
  const fileInputRef = useRef(null);
  const [selectedFiles, setSelectedFiles] = useState([]);
  // Per-file client-side knowledge keyed by name-size, filled in by the
  // inspector as each file resolves.
  const [inspections, setInspections] = useState({});
  const [dragActive, setDragActive] = useState(false);
  const [targetFormat, setTargetFormat] = useState(() => tool.targetFormat || "");
  const [pageRanges, setPageRanges] = useState("");
  const [rotationAngle, setRotationAngle] = useState("90");
  const [pages, setPages] = useState("all");
  const [isProcessing, setIsProcessing] = useState(false);
  const [status, setStatus] = useState(null);

  // Object URLs created for image previews; revoked when the list changes.
  const liveUrlsRef = useRef([]);

  const revokeLiveUrls = useCallback(() => {
    for (const url of liveUrlsRef.current) URL.revokeObjectURL(url);
    liveUrlsRef.current = [];
  }, []);

  useEffect(() => {
    return () => {
      for (const url of liveUrlsRef.current) URL.revokeObjectURL(url);
    };
  }, []);

  // A pair page carries its target in the tool record; the generic convert hub
  // picks one from the selected files instead.
  const targetFormatLocked = tool.operation === "convert" && Boolean(tool.targetFormat);

  // The extension set this tool can work with, used to warn instantly about
  // files the tool will refuse instead of only failing after upload.
  const allowedExtensions = useMemo(() => {
    if (tool.accept) return new Set(tool.accept.split(","));
    if (tool.sourceExtensions) return new Set(tool.sourceExtensions);
    if (tool.operation === "convert") {
      return new Set(Object.keys(CONVERSION_TARGETS));
    }
    return KNOWN_EXTENSIONS;
  }, [tool.accept, tool.sourceExtensions, tool.operation]);

  const rejectedCount = useMemo(
    () =>
      selectedFiles.filter(
        (file) => inspections[fileKey(file)]?.rejected,
      ).length,
    [selectedFiles, inspections],
  );

  const convertTargetOptions = useMemo(() => {
    if (tool.operation !== "convert" || selectedFiles.length === 0) {
      return [];
    }
    return commonConvertTargets(selectedFiles);
  }, [tool.operation, selectedFiles]);

  function setFailure(message, reason) {
    setStatus({
      kind: "failed",
      message,
      reason,
      results: [],
      batchDownloadUrl: "",
    });
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

    const normalizedFiles = tool.multiple ? incomingFiles : incomingFiles.slice(0, 1);

    // Instant per-file verdicts: the tool's extension gate applied in the
    // browser, so the user sees what the tool will refuse before any run.
    const freshInspections = {};
    for (const file of normalizedFiles) {
      const allowed = allowedExtensions.has(getExtension(file.name));
      freshInspections[fileKey(file)] = {
        key: fileKey(file),
        objectUrl: "",
        pages: 0,
        encrypted: false,
        damaged: "",
        rejected: allowed ? "" : describeRejection(file),
      };
    }

    revokeLiveUrls();
    setSelectedFiles(normalizedFiles);
    setInspections(freshInspections);
    setStatus(null);

    // Thumbnails and page counts arrive asynchronously, one file at a time.
    for (const file of normalizedFiles) {
      const key = fileKey(file);
      inspectFile(file).then((info) => {
        if (info.objectUrl) liveUrlsRef.current.push(info.objectUrl);
        setInspections((current) => ({ ...current, [key]: { ...current[key], ...info } }));
      });
    }

    if (tool.operation === "merge") {
      setTargetFormat("pdf");
      return;
    }

    if (tool.operation === "convert") {
      if (targetFormatLocked) return;
      setTargetFormat(commonConvertTargets(normalizedFiles)[0] || "");
    }
  }

  function describeRejection(file) {
    if (tool.accept) {
      return `${tool.label} accepts this file type only: ${describeExtensions(tool.accept.split(","))}`;
    }
    if (tool.sourceExtensions) {
      return `${tool.label} accepts ${describeExtensions(tool.sourceExtensions)} files only`;
    }
    if (tool.operation === "convert") {
      return "No declared conversion target for this file type";
    }
    return "This file type is not accepted";
  }

  function reorderFiles(index, direction) {
    setSelectedFiles((current) => {
      const next = [...current];
      const target = index + direction;
      if (target < 0 || target >= next.length) return current;
      const [moved] = next.splice(index, 1);
      next.splice(target, 0, moved);
      return next;
    });
    setStatus(null);
  }

  function removeFile(index) {
    setSelectedFiles((current) => {
      const removedFile = current[index];
      if (removedFile) {
        const key = fileKey(removedFile);
        if (inspections[key]?.objectUrl) {
          URL.revokeObjectURL(inspections[key].objectUrl);
        }
      }
      const next = current.filter((_, position) => position !== index);
      return next;
    });
    setStatus(null);
  }

  function onDragOver(event) {
    event.preventDefault();
    setDragActive(true);
  }

  function onDragLeave() {
    setDragActive(false);
  }

  function onDrop(event) {
    event.preventDefault();
    setDragActive(false);
    onPickFiles(event.dataTransfer.files);
  }

  function clearFiles() {
    revokeLiveUrls();
    setSelectedFiles([]);
    setInspections({});
    setStatus(null);
  }

  async function submit() {
    if (isProcessing) return;

    if (selectedFiles.length === 0) {
      setFailure("Unsupported file", "Please upload file(s) first");
      return;
    }

    if (tool.operation === "merge") {
      if (selectedFiles.length < 2) {
        setFailure("Unsupported file", "Merge requires at least two files");
        return;
      }

      if (!["pdf", "docx"].includes((targetFormat || "").toLowerCase())) {
        setFailure("Unsupported file", "Merge output must be PDF or DOCX");
        return;
      }
    }

    if (tool.operation === "split") {
      if (
        selectedFiles.length !== 1 ||
        getExtension(selectedFiles[0].name) !== ".pdf"
      ) {
        setFailure("Unsupported file", "Split requires exactly one PDF file");
        return;
      }
    }

    if (tool.operation === "convert") {
      if (
        tool.sourceExtensions &&
        !selectedFiles.every((file) =>
          tool.sourceExtensions.includes(getExtension(file.name)),
        )
      ) {
        setFailure(
          "Unsupported file",
          `${tool.label} accepts ${describeExtensions(tool.sourceExtensions)} files only`,
        );
        return;
      }

      if (!targetFormat) {
        setFailure(
          "Unsupported file",
          "No valid conversion target for selected files",
        );
        return;
      }
    }

    if (tool.operation === "rotate") {
      if (
        selectedFiles.length !== 1 ||
        getExtension(selectedFiles[0].name) !== ".pdf"
      ) {
        setFailure("Unsupported file", "Rotate requires exactly one PDF file.");
        return;
      }

      if (!ROTATION_ANGLES.includes(String(rotationAngle))) {
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
        !PAGE_RANGE_PATTERN.test(pagesTrimmed)
      ) {
        setFailure(
          "Unsupported file",
          'Invalid pages value. Use "all" or "1,3-5,8".',
        );
        return;
      }
    }

    if (tool.operation === "compress") {
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
      const { ok, payload } = await submitProcess({
        operation: tool.operation,
        files: selectedFiles,
        targetFormat,
        pageRanges,
        rotationAngle,
        pages,
      });

      if (!ok) {
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

  // Page count of the single selected PDF, for the split and rotate inputs.
  const singlePdfPages = useMemo(() => {
    if (selectedFiles.length !== 1) return null;
    const [onlyFile] = selectedFiles;
    if (getExtension(onlyFile.name) !== ".pdf") return null;
    const count = inspections[fileKey(onlyFile)]?.pages;
    return count > 0 ? count : null;
  }, [selectedFiles, inspections]);

  return {
    selectedFiles,
    inspections,
    rejectedCount,
    singlePdfPages,
    dragActive,
    fileInputRef,
    targetFormat,
    setTargetFormat,
    pageRanges,
    setPageRanges,
    rotationAngle,
    setRotationAngle,
    pages,
    setPages,
    isProcessing,
    status,
    operation: tool.operation,
    targetFormatLocked,
    convertTargetOptions,
    canSubmit:
      selectedFiles.length > 0 && rejectedCount === 0 && !isProcessing,
    onPickFiles,
    onDrop,
    onDragOver,
    onDragLeave,
    clearFiles,
    reorderFiles,
    removeFile,
    submit,
  };
}
