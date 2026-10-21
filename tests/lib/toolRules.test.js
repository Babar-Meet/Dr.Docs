// Pins for client/src/lib/toolRules.js: the per-operation validation strings,
// the request-value transforms, the FormData wire fields in their frozen
// order, and the primary-button gate. These mirror what the browser sends so
// a registry change that breaks request behavior fails here first.
import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import {
  appendOptionFields,
  buildRequestOptionValues,
  describeExtensions,
  requiredOptionMet,
  validateToolState,
} from "../../client/src/lib/toolRules.js";

function pdfFile(name = "a.pdf") {
  return { name, size: 1 };
}
function docxFile(name = "b.docx") {
  return { name, size: 1 };
}

function baseState(overrides = {}) {
  return {
    targetFormat: "",
    pageRanges: "",
    splitMode: "parts",
    splitEvery: "",
    rotateMode: "pages",
    rotateAllDelta: 0,
    pageRotations: {},
    password: "",
    watermarkText: "",
    watermarkAngle: "45",
    watermarkOpacity: "35",
    watermarkType: "standard",
    pageNumberPosition: "bottom-center",
    pageNumberMargin: "24",
    organizeOrder: "",
    ...overrides,
  };
}

// What the request-value builders emit for every field they do not fill.
function zeroedState(overrides = {}) {
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
    organizePages: "",
    ...overrides,
  };
}

let formDataFactory;
before(() => {
  // Runs in Node where FormData is a global; assert it once so a missing
  // global fails loudly instead of producing false passes.
  formDataFactory = () => {
    assert.equal(typeof FormData, "function");
    return new FormData();
  };
});

describe("validateToolState: refusal strings", () => {
  it("merge wants two files and a pdf or docx target", () => {
    const files = [pdfFile()];
    assert.equal(
      validateToolState({
        operation: "merge",
        tool: { operation: "merge" },
        files,
        state: baseState({ targetFormat: "pdf" }),
        flags: {},
      }),
      "Merge requires at least two files",
    );
    assert.equal(
      validateToolState({
        operation: "merge",
        tool: { operation: "merge" },
        files: [pdfFile(), docxFile()],
        state: baseState({ targetFormat: "zip" }),
        flags: {},
      }),
      "Merge output must be PDF or DOCX",
    );
    assert.equal(
      validateToolState({
        operation: "merge",
        tool: { operation: "merge" },
        files: [pdfFile(), docxFile()],
        state: baseState({ targetFormat: "PDF" }),
        flags: {},
      }),
      "",
    );
  });

  it("split accepts exactly one PDF", () => {
    const base = { operation: "split", tool: { operation: "split" }, state: baseState(), flags: {} };
    assert.equal(
      validateToolState({ ...base, files: [pdfFile(), pdfFile("c.pdf")] }),
      "Split requires exactly one PDF file",
    );
    assert.equal(
      validateToolState({ ...base, files: [docxFile()] }),
      "Split requires exactly one PDF file",
    );
    assert.equal(validateToolState({ ...base, files: [pdfFile()] }), "");
  });

  it("convert checks source extensions and a target", () => {
    const tool = {
      operation: "convert",
      label: "PDF to Word",
      sourceExtensions: [".pdf"],
    };
    const base = { operation: "convert", tool, state: baseState({ targetFormat: "docx" }), flags: {} };
    assert.equal(
      validateToolState({ ...base, files: [docxFile()] }),
      "PDF to Word accepts PDF files only",
    );
    const noTarget = { ...base, state: baseState({ targetFormat: "" }) };
    assert.equal(
      validateToolState({ ...noTarget, files: [pdfFile()] }),
      "No valid conversion target for selected files",
    );
    assert.equal(validateToolState({ ...base, files: [] }), "");
  });

  it("rotate blocks when nothing is turned", () => {
    const base = { operation: "rotate", tool: { operation: "rotate" }, state: baseState(), files: [pdfFile()] };
    assert.equal(
      validateToolState({ ...base, flags: { rotateRunnable: false } }),
      "Rotate at least one page before processing.",
    );
    assert.equal(
      validateToolState({ ...base, flags: { rotateRunnable: true } }),
      "",
    );
  });

  it("pdf-only tools name themselves", () => {
    for (const [operation, reason] of [
      ["compress", "Compress supports PDF files only."],
      ["protect", "Protect supports PDF files only."],
      ["watermark", "Watermark supports PDF files only."],
      ["pagenumbers", "Page numbers supports PDF files only."],
    ]) {
      assert.equal(
        validateToolState({
          operation,
          tool: { operation },
          files: [docxFile()],
          state: baseState(),
          flags: {},
        }),
        reason,
      );
    }
  });

  it("protect and watermark require their option values", () => {
    assert.equal(
      validateToolState({
        operation: "protect",
        tool: { operation: "protect" },
        files: [pdfFile()],
        state: baseState({ password: "   " }),
        flags: {},
      }),
      "Enter a password to protect the PDF.",
    );
    assert.equal(
      validateToolState({
        operation: "watermark",
        tool: { operation: "watermark" },
        files: [pdfFile()],
        state: baseState({ watermarkText: "  " }),
        flags: {},
      }),
      "Enter text to watermark the PDF.",
    );
  });

  it("unlock, repair and ocr never add extra failures", () => {
    for (const operation of ["unlock", "repair", "ocr"]) {
      assert.equal(
        validateToolState({
          operation,
          tool: { operation },
          files: [pdfFile()],
          state: baseState(),
          flags: {},
        }),
        "",
      );
    }
  });

  it("organize accepts exactly one PDF with a non-empty arrangement", () => {
    const base = { operation: "organize", tool: { operation: "organize" }, state: baseState(), flags: {} };
    assert.equal(
      validateToolState({ ...base, files: [pdfFile(), pdfFile("c.pdf")] }),
      "Organize requires exactly one PDF file.",
    );
    assert.equal(
      validateToolState({ ...base, files: [docxFile()] }),
      "Organize requires exactly one PDF file.",
    );
    assert.equal(
      validateToolState({ ...base, files: [pdfFile()] }),
      "Choose how to arrange the pages before organizing.",
    );
    assert.equal(
      validateToolState({ ...base, files: [pdfFile()], state: baseState({ organizeOrder: "   " }) }),
      "Choose how to arrange the pages before organizing.",
    );
    assert.equal(
      validateToolState({ ...base, files: [pdfFile()], state: baseState({ organizeOrder: "3,1,2" }) }),
      "",
    );
  });
});

describe("buildRequestOptionValues: frozen transforms", () => {
  it("rotate maps the accumulate-all delta and sorted per-page tokens", () => {
    assert.deepEqual(
      buildRequestOptionValues({
        operation: "rotate",
        state: baseState({ rotateMode: "all", rotateAllDelta: 270 }),
      }),
      zeroedState({ rotationAngle: "270", pages: "all" }),
    );
    assert.deepEqual(
      buildRequestOptionValues({
        operation: "rotate",
        state: baseState({ rotateAllDelta: 180, pageRotations: { 2: 270, 1: 90 } }),
      }),
      zeroedState({
        rotationAngle: "180",
        pages: "all",
        rotations: "1:90,2:270",
      }),
    );
    const allMode = buildRequestOptionValues({
      operation: "rotate",
      state: baseState({ rotateMode: "all", rotateAllDelta: 0 }),
    });
    assert.equal(allMode.rotationAngle, "90");
    assert.equal(allMode.rotations, "");
  });

  it("rotate rejects a non-PDF selection with the frozen wording", () => {
    assert.equal(
      validateToolState({
        operation: "rotate",
        tool: { operation: "rotate" },
        files: [docxFile()],
        state: baseState(),
        flags: { rotateRunnable: true },
      }),
      "Rotate requires exactly one PDF file.",
    );
  });

  it("split sends the editor string, and splitEvery only in fixed mode", () => {
    assert.deepEqual(
      buildRequestOptionValues({
        operation: "split",
        state: baseState({ pageRanges: "1-3,5", splitMode: "fixed", splitEvery: "2" }),
      }),
      zeroedState({ pageRanges: "1-3,5", splitEvery: "2" }),
    );
    const partsMode = buildRequestOptionValues({
      operation: "split",
      state: baseState({ pageRanges: "1-3", splitEvery: "9" }),
    });
    assert.equal(partsMode.pageRanges, "1-3");
    assert.equal(partsMode.splitEvery, "");
  });

  it("watermark trims text and converts the percent to a fraction", () => {
    const values = buildRequestOptionValues({
      operation: "watermark",
      state: baseState({ watermarkText: " Do Not Copy ", watermarkOpacity: "90" }),
    });
    assert.equal(values.watermarkText, "Do Not Copy");
    assert.equal(values.watermarkOpacity, "0.9");
    assert.equal(values.watermarkAngle, "45");
    assert.equal(values.watermarkType, "standard");
  });

  it("password tools send the trimmed password or empty string", () => {
    for (const operation of ["unlock", "protect"]) {
      const values = buildRequestOptionValues({
        operation,
        state: baseState({ password: "  secret  " }),
      });
      assert.equal(values.password, "secret");
      assert.equal(
        buildRequestOptionValues({
          operation,
          state: baseState({ password: "   " }),
        }).password,
        "",
      );
    }
  });

  it("pagenumbers forwards position and margin", () => {
    const values = buildRequestOptionValues({
      operation: "pagenumbers",
      state: baseState(),
    });
    assert.equal(values.pageNumberPosition, "bottom-center");
    assert.equal(values.pageNumberMargin, "24");
  });

  it("compress, ocr and repair carry no option values", () => {
    for (const operation of ["compress", "ocr", "repair"]) {
      const values = buildRequestOptionValues({ operation, state: baseState({ watermarkText: "x", password: "y" }) });
      assert.equal(values.watermarkText, "");
      assert.equal(values.rotationAngle, "");
      assert.equal(values.password, "");
      assert.equal(values.pageRanges, "");
    }
  });

  it("organize sends the trimmed arrangement and nothing else", () => {
    assert.deepEqual(
      buildRequestOptionValues({
        operation: "organize",
        state: baseState({ organizeOrder: " 3,1,2 " }),
      }),
      zeroedState({ organizePages: "3,1,2" }),
    );
    const empty = buildRequestOptionValues({
      operation: "organize",
      state: baseState(),
    });
    assert.equal(empty.organizePages, "");
    assert.equal(empty.pageRanges, "");
    assert.equal(empty.password, "");
  });
});

describe("appendOptionFields: frozen wire fields", () => {
  it("convert and merge always append the target format", () => {
    for (const operation of ["convert", "merge"]) {
      const form = formDataFactory();
      appendOptionFields(form, { operation, values: { targetFormat: "docx" } });
      assert.equal(form.get("targetFormat"), "docx");
    }
    const emptyForm = formDataFactory();
    appendOptionFields(emptyForm, { operation: "convert", values: { targetFormat: "" } });
    assert.equal(emptyForm.get("targetFormat"), "");
  });

  it("split appends trimmed ranges and optional fixed size, skipping empties", () => {
    const both = formDataFactory();
    appendOptionFields(both, {
      operation: "split",
      values: { pageRanges: "  5-10  ", splitEvery: " 2 " },
    });
    assert.equal(both.get("pageRanges"), "5-10");
    assert.equal(both.get("splitEvery"), "2");

    const none = formDataFactory();
    appendOptionFields(none, { operation: "split", values: { pageRanges: "", splitEvery: "" } });
    assert.equal(none.get("pageRanges"), null);
    assert.equal(none.get("splitEvery"), null);
  });

  it("rotate keeps angle and pages always, rotations only when present", () => {
    const form = formDataFactory();
    appendOptionFields(form, {
      operation: "rotate",
      values: { rotationAngle: "270", pages: "all", rotations: "" },
    });
    assert.equal(form.get("rotationAngle"), "270");
    assert.equal(form.get("pages"), "all");
    assert.equal(form.get("rotations"), null);

    const withRotations = formDataFactory();
    appendOptionFields(withRotations, {
      operation: "rotate",
      values: { rotationAngle: "90", pages: "all", rotations: "1:90,2:270" },
    });
    assert.equal(withRotations.get("rotations"), "1:90,2:270");
  });

  it("unlock appends password only when set, protect always appends it", () => {
    const emptyUnlock = formDataFactory();
    appendOptionFields(emptyUnlock, { operation: "unlock", values: { password: "" } });
    assert.equal(emptyUnlock.get("password"), null);

    const setUnlock = formDataFactory();
    appendOptionFields(setUnlock, { operation: "unlock", values: { password: "abc" } });
    assert.equal(setUnlock.get("password"), "abc");

    const emptyProtect = formDataFactory();
    appendOptionFields(emptyProtect, { operation: "protect", values: { password: "" } });
    assert.equal(emptyProtect.get("password"), "");
  });

  it("watermark and pagenumbers append their field set", () => {
    const wm = formDataFactory();
    appendOptionFields(wm, {
      operation: "watermark",
      values: {
        watermarkText: "x",
        watermarkAngle: "45",
        watermarkOpacity: "0.35",
        watermarkType: "standard",
      },
    });
    assert.equal(wm.get("watermarkText"), "x");
    assert.equal(wm.get("watermarkAngle"), "45");
    assert.equal(wm.get("watermarkOpacity"), "0.35");
    assert.equal(wm.get("watermarkType"), "standard");

    const pn = formDataFactory();
    appendOptionFields(pn, {
      operation: "pagenumbers",
      values: { pageNumberPosition: "top-right", pageNumberMargin: "40" },
    });
    assert.equal(pn.get("pageNumberPosition"), "top-right");
    assert.equal(pn.get("pageNumberMargin"), "40");
  });

  it("compress, ocr, repair and unlock append no option fields", () => {
    for (const operation of ["compress", "ocr", "repair", "unlock"]) {
      const form = formDataFactory();
      appendOptionFields(form, {
        operation,
        values: {
          targetFormat: "pdf",
          pageRanges: "1",
          rotationAngle: "90",
          password: "",
        },
      });
      assert.equal([...form].length, 0);
    }
  });

  it("organize always appends organizePages, empty or not", () => {
    const arranged = formDataFactory();
    appendOptionFields(arranged, {
      operation: "organize",
      values: { organizePages: "3,1,2" },
    });
    assert.equal(arranged.get("organizePages"), "3,1,2");
    assert.equal([...arranged].length, 1);

    const empty = formDataFactory();
    appendOptionFields(empty, {
      operation: "organize",
      values: { organizePages: "" },
    });
    assert.equal(empty.get("organizePages"), "");
  });
});

describe("requiredOptionMet and describeExtensions", () => {
  it("gates protect, watermark and rotate on their extra state", () => {
    assert.equal(
      requiredOptionMet({ operation: "protect", values: { password: " x " } }),
      true,
    );
    assert.equal(
      requiredOptionMet({ operation: "protect", values: { password: "" } }),
      false,
    );
    assert.equal(
      requiredOptionMet({ operation: "watermark", values: { watermarkText: "" } }),
      false,
    );
    assert.equal(
      requiredOptionMet({ operation: "rotate", values: { rotateRunnable: true } }),
      true,
    );
    assert.equal(
      requiredOptionMet({ operation: "rotate", values: { rotateRunnable: false } }),
      false,
    );
    for (const operation of ["unlock", "compress", "merge", "split", "convert", "ocr", "repair", "pagenumbers"]) {
      assert.equal(requiredOptionMet({ operation, values: {} }), true);
    }
    assert.equal(
      requiredOptionMet({ operation: "organize", values: { organizeOrder: " 3,1,2 " } }),
      true,
    );
    assert.equal(
      requiredOptionMet({ operation: "organize", values: { organizeOrder: "" } }),
      false,
    );
    assert.equal(
      requiredOptionMet({ operation: "organize", values: { organizeOrder: "   " } }),
      false,
    );
  });

  it("describeExtensions renders uppercase comma text", () => {
    assert.equal(describeExtensions([".pdf", ".docx"]), "PDF, DOCX");
  });
});
