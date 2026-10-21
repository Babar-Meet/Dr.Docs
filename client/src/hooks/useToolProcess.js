import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buildEndpoint, submitProcess } from "../lib/api";
import { CONVERSION_TARGETS } from "../lib/conversionTargets";
import { fileKey, getExtension, MAX_FILE_SIZE_BYTES } from "../lib/fileUtils";
import { inspectFile, KNOWN_EXTENSIONS } from "../lib/fileInspect";
import {
  buildRequestOptionValues,
  describeExtensions,
  requiredOptionMet,
  validateToolState,
} from "../lib/toolRules";

// The rotate tool has two UI modes. "all" rotates every page in one press and
// maps to the frozen rotationAngle plus pages=all request fields. "pages" is
// the per-page preview: the browser tracks a rotation per page and maps it to
// the rotations field as page:angle pairs. Degrees are never shown in the UI.
// Validation, request-value shaping and wire-field selection live in
// lib/toolRules.js so a new option never has to edit this hook.

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

export default function useToolProcess(tool) {
  const fileInputRef = useRef(null);
  const [selectedFiles, setSelectedFiles] = useState([]);
  // Per-file client-side knowledge keyed by name-size, filled in by the
  // inspector as each file resolves.
  const [inspections, setInspections] = useState({});
  const [dragActive, setDragActive] = useState(false);
  const [targetFormat, setTargetFormat] = useState(() => tool.targetFormat || "");
  const [pageRanges, setPageRanges] = useState("");
  const [splitMode, setSplitMode] = useState("parts");
  const [splitEvery, setSplitEvery] = useState("");
  // Rotate tool state: UI mode plus one net rotation value per mode. Net
  // deltas are 0 (nothing) or 90, 180, 270 clockwise. LEFT maps to 270.
  // Preview mode is the default: most people turn individual pages, so the
  // live grid greets them first. "all" is one press away in the tabs.
  const [rotateMode, setRotateMode] = useState("pages");
  const [rotateAllDelta, setRotateAllDelta] = useState(0);
  const [pageRotations, setPageRotations] = useState({});
  const [password, setPassword] = useState("");
  const [watermarkText, setWatermarkText] = useState("");
  const [watermarkAngle, setWatermarkAngle] = useState("45");
  const [watermarkOpacity, setWatermarkOpacity] = useState("35");
  const [watermarkType, setWatermarkType] = useState("standard");
  const [pageNumberPosition, setPageNumberPosition] = useState("bottom-center");
  const [pageNumberMargin, setPageNumberMargin] = useState("24");
  // Organize tool state: the frozen organizePages wire string. The strip in
  // OrganizeOptions edits it through lib/organizeOrder.js; an empty string
  // means nothing arranged yet, which the server refuses.
  const [organizeOrder, setOrganizeOrder] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [status, setStatus] = useState(null);
  // Set on the first click of the post-run Download button. Downloads are
  // single-use on the server, so the button locks after it fires once.
  const [resultDownloaded, setResultDownloaded] = useState(false);

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

  function setFailure(message, reason, code = "") {
    setStatus({
      kind: "failed",
      message,
      reason,
      code,
      // The refusal for a password-locked file gets one plain hint so the
      // dead end ("enter the password") always has a box to type it in.
      hint:
        code === "PASSWORD_REQUIRED"
          ? tool.operation === "unlock"
            ? "Type the password in the Password box and process again."
            : "Have the password? Open Unlock PDF and enter it there."
          : "",
      results: [],
      batchDownloadUrl: "",
    });
  }

  function markResultDownloaded() {
    setResultDownloaded(true);
  }

  // One press turns every page a quarter turn. Left is counterclockwise, so
  // it is 270 net clockwise. Presses accumulate: right twice is a half turn.
  function pressRotateAll(direction) {
    setRotateAllDelta((current) => (current + (direction === "left" ? 270 : 90)) % 360);
  }

  // pageRotations only ever holds non-zero entries; storing a zero deletes.
  function setPageRotation(pageNumber, delta) {
    setPageRotations((current) => {
      const next = { ...current };
      if (delta) {
        next[pageNumber] = delta;
      } else {
        delete next[pageNumber];
      }
      return next;
    });
  }

  function resetPageRotations() {
    setPageRotations({});
  }

  function isRotateRunnable() {
    if (rotateMode === "pages") {
      return Object.keys(pageRotations).length > 0;
    }
    return rotateAllDelta !== 0;
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
    setResultDownloaded(false);
    setRotateAllDelta(0);
    setPageRotations({});
    setOrganizeOrder("");
    setPassword("");

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
    setResultDownloaded(false);
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
    setResultDownloaded(false);
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
    setResultDownloaded(false);
    setOrganizeOrder("");
    setPassword("");
  }

  async function submit() {
    if (isProcessing) return;

    if (selectedFiles.length === 0) {
      setFailure("Unsupported file", "Please upload file(s) first");
      return;
    }

    const optionState = {
      targetFormat,
      pageRanges,
      splitMode,
      splitEvery,
      rotateMode,
      rotateAllDelta,
      pageRotations,
      password,
      watermarkText,
      watermarkAngle,
      watermarkOpacity,
      watermarkType,
      pageNumberPosition,
      pageNumberMargin,
      organizeOrder,
    };

    const failureReason = validateToolState({
      operation: tool.operation,
      tool,
      files: selectedFiles,
      state: optionState,
      flags: { rotateRunnable: isRotateRunnable() },
    });
    if (failureReason) {
      setFailure("Unsupported file", failureReason);
      return;
    }

    setIsProcessing(true);
    setStatus(null);

    try {
      const { ok, payload } = await submitProcess({
        operation: tool.operation,
        files: selectedFiles,
        values: buildRequestOptionValues({
          operation: tool.operation,
          state: optionState,
        }),
      });

      if (!ok) {
        setFailure(
          payload.message || "Processing failed",
          payload.reason || "Unknown error",
          payload.code || "",
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
      setResultDownloaded(false);
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

  // Post-run download target for the transformed action button: the batch ZIP
  // when more than one output exists, otherwise the first output.
  const resultDownloadUrl = useMemo(() => {
    if (status?.kind !== "success") return "";
    if (status.batchDownloadUrl) return status.batchDownloadUrl;
    if (status.results?.length > 0) {
      return buildEndpoint(status.results[0].downloadUrl);
    }
    return "";
  }, [status]);

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
    splitMode,
    setSplitMode,
    splitEvery,
    setSplitEvery,
    rotateMode,
    setRotateMode,
    rotateAllDelta,
    pressRotateAll,
    pageRotations,
    setPageRotation,
    resetPageRotations,
    password,
    setPassword,
    watermarkText,
    setWatermarkText,
    watermarkAngle,
    setWatermarkAngle,
    watermarkOpacity,
    setWatermarkOpacity,
    watermarkType,
    setWatermarkType,
    pageNumberPosition,
    setPageNumberPosition,
    pageNumberMargin,
    setPageNumberMargin,
    organizeOrder,
    setOrganizeOrder,
    isProcessing,
    status,
    resultDownloaded,
    resultDownloadUrl,
    markResultDownloaded,
    operation: tool.operation,
    targetFormatLocked,
    convertTargetOptions,
    canSubmit:
      selectedFiles.length > 0 &&
      rejectedCount === 0 &&
      !isProcessing &&
      requiredOptionMet({
        operation: tool.operation,
        values: {
          password,
          watermarkText,
          rotateRunnable: isRotateRunnable(),
          organizeOrder,
        },
      }),
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
