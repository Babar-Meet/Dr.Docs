// Pure per-tool rules: validation, request-value transforms, wire-field
// selection and the primary-button gate. No React, no fetch, no FormData
// dependency inside the logic itself (tests may build FormData around it).
// A new option lands its UI in the options component, one value transform
// in buildRequestOptionValues, one wire entry in FIELDS, one validation in
// FAILURE_CHECKS. The hook and api.js stay untouched.
import { getExtension } from "./fileUtils.js";

export function describeExtensions(extensions) {
  return extensions
    .map((extension) => extension.replace(".", "").toUpperCase())
    .join(", ");
}

function everyFileIsPdf(files) {
  return files.every((file) => getExtension(file.name) === ".pdf");
}

// Per-operation submit-time validation. Each check returns a refusal reason
// ("" when clean). The strings are frozen UI behavior.
function mergeTargetValid(targetFormat) {
  return ["pdf", "docx"].includes((targetFormat || "").toLowerCase());
}

export const FAILURE_CHECKS = {
  merge({ files, state }) {
    if (files.length < 2) return "Merge requires at least two files";
    if (!mergeTargetValid(state.targetFormat)) {
      return "Merge output must be PDF or DOCX";
    }
    return "";
  },

  split({ files }) {
    if (files.length !== 1 || getExtension(files[0].name) !== ".pdf") {
      return "Split requires exactly one PDF file";
    }
    return "";
  },

  convert({ files, tool, state }) {
    if (
      tool.sourceExtensions &&
      !files.every((file) =>
        tool.sourceExtensions.includes(getExtension(file.name)),
      )
    ) {
      return `${tool.label} accepts ${describeExtensions(tool.sourceExtensions)} files only`;
    }
    if (!state.targetFormat) {
      return "No valid conversion target for selected files";
    }
    return "";
  },

  rotate({ files, flags }) {
    if (files.length !== 1 || getExtension(files[0].name) !== ".pdf") {
      return "Rotate requires exactly one PDF file.";
    }
    if (!flags.rotateRunnable) {
      return "Rotate at least one page before processing.";
    }
    return "";
  },

  compress({ files }) {
    if (!everyFileIsPdf(files)) return "Compress supports PDF files only.";
    return "";
  },

  protect({ files, state }) {
    if (!everyFileIsPdf(files)) return "Protect supports PDF files only.";
    if (!state.password.trim()) {
      return "Enter a password to protect the PDF.";
    }
    return "";
  },

  watermark({ files, state }) {
    if (!everyFileIsPdf(files)) return "Watermark supports PDF files only.";
    if (!state.watermarkText.trim()) {
      return "Enter text to watermark the PDF.";
    }
    return "";
  },

  pagenumbers({ files }) {
    if (!everyFileIsPdf(files)) return "Page numbers supports PDF files only.";
    return "";
  },
};

// Returns "" when the tool state is clean to run, otherwise the refusal
// reason that shows as the failure message.
export function validateToolState({ operation, tool, files, state, flags }) {
  const check = FAILURE_CHECKS[operation];
  return check ? check({ files, tool, state, flags }) : "";
}

// Per-operation request values, built from the hook's state. Every transform
// here (mode switches, trimming, percent to fraction, rotate payload shapes)
// is frozen request behavior.
export function buildRequestOptionValues({ operation, state }) {
  switch (operation) {
    case "rotate": {
      const perPageMode = state.rotateMode === "pages";
      const rotationsPayload = perPageMode
        ? Object.keys(state.pageRotations)
            .map(Number)
            .sort((a, b) => a - b)
            .map((page) => `${page}:${state.pageRotations[page]}`)
            .join(",")
        : "";
      return {
        targetFormat: "",
        pageRanges: "",
        splitEvery: "",
        rotationAngle: String(state.rotateAllDelta || "90"),
        pages: "all",
        password: "",
        rotations: rotationsPayload,
        watermarkText: "",
        watermarkAngle: "",
        watermarkOpacity: "",
        watermarkType: "",
        pageNumberPosition: "",
        pageNumberMargin: "",
      };
    }

    case "split":
      return {
        targetFormat: "",
        pageRanges: state.pageRanges,
        splitEvery: state.splitMode === "fixed" ? state.splitEvery : "",
        rotationAngle: "",
        pages: "",
        password: "",
        rotations: "",
        watermarkText: "",
        watermarkAngle: "",
        watermarkOpacity: "",
        watermarkType: "",
        pageNumberPosition: "",
        pageNumberMargin: "",
      };

    case "convert":
    case "merge":
      return {
        targetFormat: state.targetFormat,
        pageRanges: "",
        splitEvery: "",
        rotationAngle: "",
        pages: "",
        password: "",
        rotations: "",
        watermarkText: "",
        watermarkAngle: "",
        watermarkOpacity: "",
        watermarkType: "",
        pageNumberPosition: "",
        pageNumberMargin: "",
      };

    case "protect":
      return {
        targetFormat: "",
        pageRanges: "",
        splitEvery: "",
        rotationAngle: "",
        pages: "",
        password: state.password.trim() || "",
        rotations: "",
        watermarkText: "",
        watermarkAngle: "",
        watermarkOpacity: "",
        watermarkType: "",
        pageNumberPosition: "",
        pageNumberMargin: "",
      };

    case "unlock":
      return {
        targetFormat: "",
        pageRanges: "",
        splitEvery: "",
        rotationAngle: "",
        pages: "",
        password: state.password.trim() || "",
        rotations: "",
        watermarkText: "",
        watermarkAngle: "",
        watermarkOpacity: "",
        watermarkType: "",
        pageNumberPosition: "",
        pageNumberMargin: "",
      };

    case "watermark":
      return {
        targetFormat: "",
        pageRanges: "",
        splitEvery: "",
        rotationAngle: "",
        pages: "",
        password: "",
        rotations: "",
        watermarkText: state.watermarkText.trim(),
        watermarkAngle: state.watermarkAngle,
        watermarkOpacity: String(Number(state.watermarkOpacity) / 100),
        watermarkType: state.watermarkType,
        pageNumberPosition: "",
        pageNumberMargin: "",
      };

    case "pagenumbers":
      return {
        targetFormat: "",
        pageRanges: "",
        splitEvery: "",
        rotationAngle: "",
        pages: "",
        password: "",
        rotations: "",
        watermarkText: "",
        watermarkAngle: "",
        watermarkOpacity: "",
        watermarkType: "",
        pageNumberPosition: state.pageNumberPosition,
        pageNumberMargin: state.pageNumberMargin,
      };

    default:
      // compress, ocr, repair: files only, no option fields on the wire.
      return {
        targetFormat: "",
        pageRanges: "",
        splitEvery: "",
        rotationAngle: "",
        pages: "",
        password: "",
        rotations: "",
        watermarkText: "",
        watermarkAngle: "",
        watermarkOpacity: "",
        watermarkType: "",
        pageNumberPosition: "",
        pageNumberMargin: "",
      };
  }
}

// Wire-field table, per operation. mode "always" appends the field even when
// the value is empty (frozen request bodies); mode "truthy" appends only when
// the value survives String(value).trim().
const FIELDS = {
  convert: [{ name: "targetFormat", mode: "always" }],
  merge: [{ name: "targetFormat", mode: "always" }],
  split: [
    { name: "pageRanges", mode: "truthy" },
    { name: "splitEvery", mode: "truthy" },
  ],
  rotate: [
    { name: "rotationAngle", mode: "always" },
    { name: "pages", mode: "always", fallback: "all" },
    { name: "rotations", mode: "truthy" },
  ],
  unlock: [{ name: "password", mode: "truthy" }],
  protect: [{ name: "password", mode: "always" }],
  watermark: [
    { name: "watermarkText", mode: "always" },
    { name: "watermarkAngle", mode: "always" },
    { name: "watermarkOpacity", mode: "always" },
    { name: "watermarkType", mode: "always" },
  ],
  pagenumbers: [
    { name: "pageNumberPosition", mode: "always" },
    { name: "pageNumberMargin", mode: "always" },
  ],
};

// Adds the operation's wire fields to FormData in the frozen order.
export function appendOptionFields(formData, { operation, values }) {
  const specs = FIELDS[operation] || [];
  for (const spec of specs) {
    const raw = `${values[spec.name]}`;
    if (spec.mode === "truthy" && raw.trim() === "") {
      continue;
    }
    // Truthy fields travelled trimmed on the wire long before the table
    // existed; keep that exact byte shape.
    const value = spec.fallback
      ? raw.trim() || spec.fallback
      : spec.mode === "truthy"
        ? raw.trim()
        : raw;
    formData.append(spec.name, value);
  }
  return formData;
}

// The extra option gate for the primary button, beyond "has files, none
// rejected, not running". Per-operation, same strings as the validations.
export function requiredOptionMet({ operation, values }) {
  switch (operation) {
    case "protect":
      return values.password.trim() !== "";
    case "watermark":
      return values.watermarkText.trim() !== "";
    case "rotate":
      return values.rotateRunnable === true;
    default:
      return true;
  }
}
