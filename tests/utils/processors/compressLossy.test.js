// Pins the compression-level contract from Temp/FIX_SPEC.md. Tier: Critical.
//
// The regression this suite exists for is silent colour corruption: a lossy
// re-encode that writes 3 channel sRGB JPEG bytes while the image dictionary
// still declares /DeviceGray or /DeviceCMYK. Every colour case below therefore
// reads the image XObject out of the real output PDF, decodes the real JPEG
// stream with sharp, and proves the declared colour space, the JPEG colour
// space and the channel count all agree.
//
// Also covered: the four level names, the frozen messages, the kept-original
// branch, the lossless byte-level guarantee, and the skip rule for images with
// a /Decode entry.

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import fs from "fs-extra";
import sharp from "sharp";
import {
  PDFArray,
  PDFDocument,
  PDFName,
  PDFNumber,
  PDFRawStream,
} from "pdf-lib";
import { compressPdf } from "../../../utils/processors/pdfProcessor.js";
import { processFile } from "../../../utils/processors/router.js";
import { QPDF_BIN } from "../../../server/src/config.js";
import { AppError } from "../../../utils/errors.js";

const TMP_ROOT = path.join(os.tmpdir(), `drdocs-compress-levels-${process.pid}-${Date.now()}`);
const OUTPUT_BASE = "compressed";

// A deterministic gradient produces plenty of DCT coefficients, so a lossy
// level has something real to remove. No randomness, no clock, no network.
function gradientPixels(width, height, channels) {
  const pixels = Buffer.alloc(width * height * channels);
  let offset = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const a = (x * 7 + y * 13) % 256;
      const b = (x * 3 + y * 5) % 256;
      const c = (x + y) % 256;
      const d = (x * 2 + y * 3) % 256;
      if (channels === 1) {
        pixels[offset] = a;
        offset += 1;
      } else if (channels === 3) {
        pixels[offset] = a;
        pixels[offset + 1] = b;
        pixels[offset + 2] = c;
        offset += 3;
      } else {
        pixels[offset] = a;
        pixels[offset + 1] = b;
        pixels[offset + 2] = c;
        pixels[offset + 3] = d;
        offset += 4;
      }
    }
  }
  return pixels;
}

async function makeJpeg(space, width = 900, height = 600) {
  const channels = space === "cmyk" ? 4 : space === "gray" ? 1 : 3;
  let image = sharp(gradientPixels(width, height, channels), {
    raw: { width, height, channels },
  });
  if (space === "cmyk") image = image.toColourspace("cmyk");
  if (space === "gray") image = image.toColourspace("b-w");
  return image.jpeg({ quality: 95 }).toBuffer();
}

async function makeImagePdf(dir, name, space, width = 900, height = 600) {
  const jpeg = await makeJpeg(space, width, height);
  const doc = await PDFDocument.create();
  const embedded = await doc.embedJpg(jpeg);
  const page = doc.addPage([width, height]);
  page.drawImage(embedded, { x: 0, y: 0, width, height });
  const filePath = path.join(dir, name);
  await fs.writeFile(filePath, await doc.save());
  return { filePath, jpeg };
}

async function makePlainPdf(dir, name = "plain.pdf") {
  const doc = await PDFDocument.create();
  doc.addPage([300, 400]);
  const filePath = path.join(dir, name);
  await fs.writeFile(filePath, await doc.save());
  return filePath;
}

function numberValue(doc, value) {
  const looked = doc.context.lookup(value);
  if (looked instanceof PDFNumber) return looked.asNumber();
  return Number(String(looked));
}

function filterNames(doc, value) {
  const looked = doc.context.lookup(value);
  if (looked instanceof PDFArray) {
    return looked.asArray().map((item) => String(doc.context.lookup(item)));
  }
  return looked ? [String(looked)] : [];
}

// Reads every image XObject reachable from a page resource dictionary. The
// stream bytes are the encoded bytes exactly as stored (DCTDecode stays a
// JPEG), so sharp can prove what the viewer will actually decode.
async function imageXObjects(pdfBytes) {
  const doc = await PDFDocument.load(pdfBytes);
  const images = [];
  const seen = new Set();
  for (const page of doc.getPages()) {
    const resources = page.node.Resources();
    if (!resources) continue;
    const xobjects = doc.context.lookup(resources.get(PDFName.of("XObject")));
    if (!xobjects || typeof xobjects.keys !== "function") continue;
    for (const key of xobjects.keys()) {
      const stream = doc.context.lookup(xobjects.get(key));
      if (!(stream instanceof PDFRawStream)) continue;
      if (seen.has(stream)) continue;
      seen.add(stream);
      const dict = stream.dict;
      const subtype = String(doc.context.lookup(dict.get(PDFName.of("Subtype"))));
      if (subtype !== "/Image") continue;
      images.push({
        subtype,
        filters: filterNames(doc, dict.get(PDFName.of("Filter"))),
        colorSpace: String(doc.context.lookup(dict.get(PDFName.of("ColorSpace")))),
        bitsPerComponent: numberValue(doc, dict.get(PDFName.of("BitsPerComponent"))),
        width: numberValue(doc, dict.get(PDFName.of("Width"))),
        height: numberValue(doc, dict.get(PDFName.of("Height"))),
        length: numberValue(doc, dict.get(PDFName.of("Length"))),
        hasDecode: Boolean(dict.get(PDFName.of("Decode"))),
        bytes: Buffer.from(stream.contents),
      });
    }
  }
  return images;
}

const COLOR_CASES = {
  rgb: { colorSpace: "/DeviceRGB", jpegSpace: "srgb", channels: 3 },
  gray: { colorSpace: "/DeviceGray", jpegSpace: "b-w", channels: 1 },
  cmyk: { colorSpace: "/DeviceCMYK", jpegSpace: "cmyk", channels: 4 },
};

// Builds a one image PDF whose image dictionary carries a shape the contract
// says to skip. The stream bytes are a real JPEG so a wrong implementation
// cannot fail the fixture before it fails the skip rule.
async function makeSkipImagePdf(dir, name, extraDict, { omitColorSpace = false } = {}) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([400, 300]);
  const jpeg = await makeJpeg("rgb", 400, 300);
  const dict = {
    Type: "XObject",
    Subtype: "Image",
    Width: 400,
    Height: 300,
    BitsPerComponent: 8,
    Filter: "DCTDecode",
    ...(omitColorSpace ? {} : { ColorSpace: "DeviceRGB" }),
    ...extraDict(doc),
  };
  const stream = doc.context.stream(jpeg, dict);
  page.node.newXObject("Extra", doc.context.register(stream));
  const filePath = path.join(dir, name);
  await fs.writeFile(filePath, await doc.save());
  return filePath;
}

async function assertColorSpaceAgrees(pdfBytes, expected, label) {
  const images = await imageXObjects(pdfBytes);
  assert.equal(images.length, 1, `${label}: expected exactly one image XObject`);
  const image = images[0];

  assert.equal(image.subtype, "/Image");
  assert.deepEqual(image.filters, ["/DCTDecode"], `${label}: the stream must stay a DCTDecode JPEG`);
  assert.equal(image.colorSpace, expected.colorSpace, `${label}: declared colour space changed`);
  assert.equal(image.bitsPerComponent, 8, `${label}: bits per component must stay 8`);

  const meta = await sharp(image.bytes).metadata();
  assert.equal(meta.format, "jpeg", `${label}: the stream must decode as a JPEG`);
  assert.equal(meta.space, expected.jpegSpace, `${label}: the JPEG stream colour space disagrees with the dictionary`);
  assert.equal(meta.channels, expected.channels, `${label}: the JPEG channel count disagrees with the dictionary`);

  assert.equal(image.width, meta.width, `${label}: /Width disagrees with the JPEG`);
  assert.equal(image.height, meta.height, `${label}: /Height disagrees with the JPEG`);
  assert.equal(image.length, image.bytes.length, `${label}: /Length disagrees with the stream bytes`);
}

function runProcess(options, workDir) {
  return processFile({
    qpdfBin: QPDF_BIN,
    libreOfficeBin: process.env.LIBREOFFICE_BIN || "soffice",
    workDir,
    outputBasePath: path.join(workDir, OUTPUT_BASE),
    ...options,
  });
}

function pdfInput(filePath) {
  return { path: filePath, originalName: path.basename(filePath), mimeType: "application/pdf" };
}

describe("compressPdf compression levels", () => {
  before(async () => {
    await fs.ensureDir(TMP_ROOT);
  });

  after(async () => {
    await fs.remove(TMP_ROOT);
  });

  describe("lossy colour fidelity (device colour space agrees with the JPEG stream)", () => {
    for (const [space, expected] of Object.entries(COLOR_CASES)) {
      it(`extreme re-encodes and keeps ${expected.colorSpace} with a ${expected.channels} channel JPEG`, async () => {
        const work = path.join(TMP_ROOT, `fidelity-${space}`);
        await fs.ensureDir(work);
        const { filePath: input, jpeg: inputJpeg } = await makeImagePdf(work, `${space}.pdf`, space);
        const output = path.join(work, `out-${space}.pdf`);
        const inputSize = (await fs.stat(input)).size;

        const result = await compressPdf({
          inputPath: input,
          outputPath: output,
          qpdfBin: QPDF_BIN,
          compressionLevel: "extreme",
        });

        assert.ok(await fs.pathExists(output));
        const bytes = await fs.readFile(output);
        const doc = await PDFDocument.load(bytes);
        assert.equal(doc.getPageCount(), 1);
        await assertColorSpaceAgrees(bytes, expected, `${space} extreme`);

        // Colour agreement must come from a real re-encode. A copy of the
        // input would agree with itself while never touching the image.
        const [image] = await imageXObjects(bytes);
        assert.notEqual(
          Buffer.compare(image.bytes, inputJpeg),
          0,
          `${space}: the image stream must be re-encoded, not copied`,
        );
        assert.equal(result?.keptOriginal, false, "an image-heavy input must be re-encoded, not kept");
        const outputSize = (await fs.stat(output)).size;
        assert.ok(
          outputSize < inputSize,
          `extreme output (${outputSize}) must be smaller than the input (${inputSize})`,
        );
      });
    }

    for (const level of ["recommended", "low"]) {
      it(`${level} keeps DeviceRGB and emits a 3 channel JPEG`, async () => {
        const work = path.join(TMP_ROOT, `fidelity-rgb-${level}`);
        await fs.ensureDir(work);
        const { filePath: input } = await makeImagePdf(work, "rgb.pdf", "rgb");
        const output = path.join(work, `out-${level}.pdf`);

        await compressPdf({
          inputPath: input,
          outputPath: output,
          qpdfBin: QPDF_BIN,
          compressionLevel: level,
        });

        await assertColorSpaceAgrees(await fs.readFile(output), COLOR_CASES.rgb, `rgb ${level}`);
      });
    }
  });

  describe("lossless", () => {
    for (const level of [undefined, "lossless"]) {
      it(`keeps the embedded JPEG bytes byte-for-byte unchanged (${level ?? "default"})`, async () => {
        const work = path.join(TMP_ROOT, `lossless-${level ?? "default"}`);
        await fs.ensureDir(work);
        const { filePath: input } = await makeImagePdf(work, "source.pdf", "rgb", 600, 400);
        const output = path.join(work, "out.pdf");

        const before = await imageXObjects(await fs.readFile(input));
        assert.equal(before.length, 1, "fixture must embed exactly one image");

        const result = await compressPdf({
          inputPath: input,
          outputPath: output,
          qpdfBin: QPDF_BIN,
          ...(level === undefined ? {} : { compressionLevel: level }),
        });

        assert.equal(typeof result?.keptOriginal, "boolean", "compressPdf must return { keptOriginal }");
        assert.ok(await fs.pathExists(output));
        const after = await imageXObjects(await fs.readFile(output));
        assert.equal(after.length, 1, "lossless compression must not drop the image");
        assert.equal(Buffer.compare(after[0].bytes, before[0].bytes), 0, "lossless must not re-encode the image");
        assert.equal(after[0].colorSpace, before[0].colorSpace);
        assert.equal(after[0].bitsPerComponent, before[0].bitsPerComponent);
        assert.deepEqual(after[0].filters, ["/DCTDecode"]);
        assert.equal(after[0].width, before[0].width);
        assert.equal(after[0].height, before[0].height);
      });
    }
  });

  describe("kept-original branch", () => {
    it("copies the input over the output and reports keptOriginal when lossy cannot shrink it", async () => {
      const work = path.join(TMP_ROOT, "kept-original");
      await fs.ensureDir(work);
      const input = await makePlainPdf(work);
      const output = path.join(work, "out.pdf");

      const result = await compressPdf({
        inputPath: input,
        outputPath: output,
        qpdfBin: QPDF_BIN,
        compressionLevel: "extreme",
      });

      assert.equal(result?.keptOriginal, true);
      assert.ok(await fs.pathExists(output));
      assert.equal(
        Buffer.compare(await fs.readFile(output), await fs.readFile(input)),
        0,
        "a kept-original result must be the input bytes",
      );
      const doc = await PDFDocument.load(await fs.readFile(output));
      assert.equal(doc.getPageCount(), 1);
    });
  });

  describe("skip rules", () => {
    it("leaves a DCTDecode image with a /Decode entry byte-for-byte unchanged and still compresses the rest", async () => {
      const work = path.join(TMP_ROOT, "skip-decode");
      await fs.ensureDir(work);

      const doc = await PDFDocument.create();
      const page = doc.addPage([700, 500]);

      // One ordinary DeviceRGB JPEG that lossy compression is allowed to touch.
      const normalJpeg = await makeJpeg("rgb", 700, 500);
      const embedded = await doc.embedJpg(normalJpeg);
      page.drawImage(embedded, { x: 0, y: 0, width: 700, height: 500 });

      // One DeviceRGB JPEG with a /Decode array, which the contract says to
      // skip. Registered on the page resources so the scanner can see it.
      const decodeJpeg = await makeJpeg("rgb", 400, 300);
      const decodeMeta = await sharp(decodeJpeg).metadata();
      const decodeStream = doc.context.stream(decodeJpeg, {
        Type: "XObject",
        Subtype: "Image",
        Width: decodeMeta.width,
        Height: decodeMeta.height,
        ColorSpace: "DeviceRGB",
        BitsPerComponent: 8,
        Filter: "DCTDecode",
        Decode: [0, 1, 0, 1, 0, 1],
      });
      page.node.newXObject("Skipped", doc.context.register(decodeStream));

      const input = path.join(work, "mixed.pdf");
      await fs.writeFile(input, await doc.save());
      const output = path.join(work, "out.pdf");

      const result = await compressPdf({
        inputPath: input,
        outputPath: output,
        qpdfBin: QPDF_BIN,
        compressionLevel: "extreme",
      });
      assert.equal(result?.keptOriginal, false);

      const before = await imageXObjects(await fs.readFile(input));
      const after = await imageXObjects(await fs.readFile(output));
      const skippedBefore = before.find((image) => image.hasDecode);
      const skippedAfter = after.find((image) => image.hasDecode);
      assert.ok(skippedBefore, "fixture must contain the /Decode image");
      assert.ok(skippedAfter, "output must still contain the /Decode image");
      assert.equal(
        Buffer.compare(skippedAfter.bytes, skippedBefore.bytes),
        0,
        "an image with /Decode must be skipped, not re-encoded",
      );

      const normalAfter = after.find((image) => !image.hasDecode);
      const normalBefore = before.find((image) => !image.hasDecode);
      assert.ok(normalAfter && normalBefore, "the ordinary image must survive");
      assert.notEqual(
        Buffer.compare(normalAfter.bytes, normalBefore.bytes),
        0,
        "the ordinary image must be re-encoded",
      );
    });

    // A truncated image stream whose bytes end on the APP14 marker prefix
    // (0xFF 0xEE) must be skipped, not crash the pass: the marker length field
    // would run past the buffer. This is the shape a hostile or damaged PDF
    // takes, and the request must still finish.
    it("skips a CMYK image whose bytes end on a truncated APP14 marker", async () => {
      const work = path.join(TMP_ROOT, "skip-truncated-app14");
      await fs.ensureDir(work);

      const doc = await PDFDocument.create();
      const page = doc.addPage([300, 300]);
      const truncated = Buffer.concat([
        Buffer.from("not-a-real-jpeg"),
        Buffer.from([0xff, 0xee]),
      ]);
      const stream = doc.context.stream(truncated, {
        Type: "XObject",
        Subtype: "Image",
        Width: 100,
        Height: 100,
        ColorSpace: "DeviceCMYK",
        BitsPerComponent: 8,
        Filter: "DCTDecode",
        Decode: [1, 0, 1, 0, 1, 0, 1, 0],
      });
      page.node.newXObject("Truncated", doc.context.register(stream));

      const input = path.join(work, "truncated.pdf");
      await fs.writeFile(input, await doc.save());
      const output = path.join(work, "out.pdf");

      const result = await compressPdf({
        inputPath: input,
        outputPath: output,
        qpdfBin: QPDF_BIN,
        compressionLevel: "extreme",
      });
      // Whether the result is smaller is not the point here: a tiny file can
      // legitimately keep its original bytes. The pass must finish either way.
      assert.ok(result);

      const after = await imageXObjects(await fs.readFile(output));
      const skipped = after.find((image) => image.hasDecode);
      assert.ok(skipped, "the truncated image must survive in the output");
      assert.equal(
        Buffer.compare(skipped.bytes, truncated),
        0,
        "an image that cannot be read is skipped, not re-encoded",
      );
    });

    // Every shape the contract names as "skip this image" must leave the
    // stream byte-for-byte untouched. A wrong implementation that re-encodes
    // one of these would also have to change the dictionary, which the
    // contract forbids under the existing name.
    const skipCases = [
      {
        name: "decode-parms",
        label: "a /DecodeParms entry",
        dict: () => ({ DecodeParms: { Predictor: 15 } }),
      },
      {
        name: "mask-array",
        label: "an array /Mask",
        dict: (doc) => {
          const mask = doc.context.register(doc.context.stream(Buffer.alloc(8), {}));
          return { Mask: [mask] };
        },
      },
      {
        name: "image-mask",
        label: "/ImageMask true",
        omitColorSpace: true,
        dict: () => ({ ImageMask: true }),
      },
      {
        name: "icc-based",
        label: "an ICCBased colour space",
        dict: (doc) => {
          const profile = doc.context.register(doc.context.stream(Buffer.alloc(32, 0), { N: 3 }));
          return { ColorSpace: ["ICCBased", profile] };
        },
      },
      {
        name: "indexed",
        label: "an Indexed colour space",
        dict: () => ({ ColorSpace: ["Indexed", "DeviceRGB", 255, "x".repeat(768)] }),
      },
      {
        name: "unknown-colour",
        label: "an unknown colour space",
        dict: () => ({ ColorSpace: "UnmappedSpace" }),
      },
      {
        name: "oversize-pixels",
        label: "a declared pixel count over 50 million",
        dict: () => ({ Width: 10000, Height: 6000 }),
      },
    ];

    for (const skipCase of skipCases) {
      it(`skips ${skipCase.label} and keeps the image bytes`, async () => {
        const work = path.join(TMP_ROOT, `skip-${skipCase.name}`);
        await fs.ensureDir(work);
        const input = await makeSkipImagePdf(work, "input.pdf", skipCase.dict, {
          omitColorSpace: skipCase.omitColorSpace,
        });
        const output = path.join(work, "out.pdf");

        await compressPdf({
          inputPath: input,
          outputPath: output,
          qpdfBin: QPDF_BIN,
          compressionLevel: "extreme",
        });

        const before = await imageXObjects(await fs.readFile(input));
        const after = await imageXObjects(await fs.readFile(output));
        assert.equal(before.length, 1, "fixture must contain exactly one image");
        assert.equal(after.length, 1, "output must still contain the image");
        assert.equal(
          Buffer.compare(after[0].bytes, before[0].bytes),
          0,
          `${skipCase.name}: the image must not be re-encoded`,
        );
        assert.equal(after[0].colorSpace, before[0].colorSpace, `${skipCase.name}: colour space changed`);
        assert.equal(after[0].bitsPerComponent, before[0].bitsPerComponent);
      });
    }
  });

  describe("unknown level", () => {
    it("rejects an unsupported level with UNSUPPORTED_FILE 400 and the frozen reason", async () => {
      const work = path.join(TMP_ROOT, "unknown-level");
      await fs.ensureDir(work);
      const input = await makePlainPdf(work);

      for (const value of ["bogus", "ultra"]) {
        const output = path.join(work, `out-${value}.pdf`);
        await assert.rejects(
          () =>
            compressPdf({
              inputPath: input,
              outputPath: output,
              qpdfBin: QPDF_BIN,
              compressionLevel: value,
            }),
          (err) => {
            assert.ok(err instanceof AppError, `${value}: expected AppError, got ${err?.constructor?.name}`);
            assert.equal(err.code, "UNSUPPORTED_FILE", `${value}: wrong code`);
            assert.equal(err.statusCode, 400, `${value}: wrong status code`);
            assert.equal(
              err.details?.reason,
              `Unsupported compression level: ${value}. Use lossless, recommended, extreme, or low.`,
              `${value}: wrong reason`,
            );
            return true;
          },
        );
        assert.equal(await fs.pathExists(output), false, `${value}: a rejected level must not write output`);
      }
    });
  });

  describe("processFile messages and level forwarding", () => {
    it("lossless default and explicit keep the frozen messages", async () => {
      for (const level of [undefined, "lossless"]) {
        const work = path.join(TMP_ROOT, `msg-lossless-${level ?? "default"}`);
        await fs.ensureDir(work);
        const input = await makePlainPdf(work);
        const result = await runProcess(
          {
            operation: "compress",
            ...(level === undefined ? {} : { compressionLevel: level }),
            inputFiles: [pdfInput(input)],
          },
          work,
        );
        assert.equal(result.message, "Compressed 1 PDF(s) (lossless optimize).");
        assert.equal(result.outputs.length, 1);
        assert.equal(result.outputs[0].message, "PDF optimized (lossless) successfully.");
      }
    });

    for (const level of ["recommended", "extreme", "low"]) {
      const label = level === "low" ? "Light" : level[0].toUpperCase() + level.slice(1);
      it(`${level} reaches the processor and names itself in both messages`, async () => {
        const work = path.join(TMP_ROOT, `msg-${level}`);
        await fs.ensureDir(work);
        const { filePath: input } = await makeImagePdf(work, "photo.pdf", "rgb");
        const result = await runProcess(
          { operation: "compress", compressionLevel: level, inputFiles: [pdfInput(input)] },
          work,
        );
        assert.equal(result.message, `Compressed 1 PDF(s) (${label} compression).`);
        assert.equal(result.outputs.length, 1);
        assert.equal(result.outputs[0].message, `PDF optimized (${label}) successfully.`);
        assert.ok(await fs.pathExists(result.outputs[0].outputPath));
      });
    }

    it("kept-original names the level in both messages", async () => {
      const work = path.join(TMP_ROOT, "msg-kept");
      await fs.ensureDir(work);
      const input = await makePlainPdf(work);
      const result = await runProcess(
        { operation: "compress", compressionLevel: "extreme", inputFiles: [pdfInput(input)] },
        work,
      );
      assert.equal(result.message, "No smaller result for 1 PDF(s); original kept.");
      assert.equal(result.outputs[0].message, "PDF already optimized; original kept (Extreme).");
    });

    it("names how many files kept their original size when only some shrank", async () => {
      const work = path.join(TMP_ROOT, "msg-partial");
      await fs.ensureDir(work);
      const image = await makeImagePdf(work, "photo.pdf", "rgb");
      const plain = await makePlainPdf(work);
      const result = await runProcess(
        {
          operation: "compress",
          compressionLevel: "extreme",
          inputFiles: [pdfInput(image.filePath), pdfInput(plain)],
        },
        work,
      );
      assert.equal(
        result.message,
        "Compressed 1 of 2 PDF(s) (Extreme compression); 1 kept original.",
      );
      assert.equal(result.outputs[0].message, "PDF optimized (Extreme) successfully.");
      assert.equal(result.outputs[1].message, "PDF already optimized; original kept (Extreme).");
    });

    it("an unknown level is rejected through processFile before processing", async () => {
      const work = path.join(TMP_ROOT, "msg-bogus");
      await fs.ensureDir(work);
      const input = await makePlainPdf(work);
      await assert.rejects(
        () =>
          runProcess(
            { operation: "compress", compressionLevel: "bogus", inputFiles: [pdfInput(input)] },
            work,
          ),
        (err) => {
          assert.ok(err instanceof AppError);
          assert.equal(err.code, "UNSUPPORTED_FILE");
          assert.equal(err.statusCode, 400);
          assert.equal(
            err.details?.reason,
            "Unsupported compression level: bogus. Use lossless, recommended, extreme, or low.",
          );
          return true;
        },
      );
    });
  });
});
