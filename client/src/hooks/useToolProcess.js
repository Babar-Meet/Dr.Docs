import { useMemo, useRef, useState } from "react";
import { buildEndpoint, submitProcess } from "../lib/api";
import { CONVERSION_TARGETS } from "../lib/conversionTargets";
import { getExtension, MAX_FILE_SIZE_BYTES } from "../lib/fileUtils";

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
  const [dragActive, setDragActive] = useState(false);
  const [targetFormat, setTargetFormat] = useState(() => tool.targetFormat || "");
  const [pageRanges, setPageRanges] = useState("");
  const [rotationAngle, setRotationAngle] = useState("90");
  const [pages, setPages] = useState("all");
  const [isProcessing, setIsProcessing] = useState(false);
  const [status, setStatus] = useState(null);

  // A pair page carries its target in the tool record; the generic convert hub
  // picks one from the selected files instead.
  const targetFormatLocked = tool.operation === "convert" && Boolean(tool.targetFormat);

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

    setSelectedFiles(normalizedFiles);
    setStatus(null);

    if (tool.operation === "merge") {
      setTargetFormat("pdf");
      return;
    }

    if (tool.operation === "convert") {
      if (targetFormatLocked) return;
      setTargetFormat(commonConvertTargets(normalizedFiles)[0] || "");
    }
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
    setSelectedFiles([]);
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

  return {
    selectedFiles,
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
    canSubmit: selectedFiles.length > 0 && !isProcessing,
    onPickFiles,
    onDrop,
    onDragOver,
    onDragLeave,
    clearFiles,
    submit,
  };
}
