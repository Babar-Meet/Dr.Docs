import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { stampSize } from "../../../utils/processors/watermarkProcessor.js";
import { stampSize as clientStampSize } from "../../../client/src/lib/watermarkStamp.js";

// The client watermark preview sizes its stamp with a copy of the server
// stampSize() rule. This pin keeps the two formulas from drifting: given the
// same unit width, page size and angle, both must produce the same pt size.
describe("watermark stamp mirror", () => {
  const pages = [
    { pageWidth: 595.28, pageHeight: 841.89 }, // A4 portrait
    { pageWidth: 841.89, pageHeight: 595.28 }, // A4 landscape
    { pageWidth: 612, pageHeight: 792 }, // US Letter portrait
    { pageWidth: 200, pageHeight: 500 }, // long narrow page
  ];
  const unitWidths = [0.001, 0.5, 1, 5.95, 12.3];

  for (const page of pages) {
    for (const unitWidth of unitWidths) {
      for (const angle of [0, 45]) {
        it(`server and client sizes agree: ${unitWidth} units at angle ${angle} on ${page.pageWidth}x${page.pageHeight}`, () => {
          const serverSize = stampSize({ ...page, unitWidth, angle });
          const clientSize = clientStampSize({ ...page, unitWidth, angle });
          assert.equal(clientSize, serverSize);
        });
      }
    }
  }

  it("real Helvetica metrics fall inside the clamp rails for both", async () => {
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    for (const text of ["Confidential", "Dr.Docs", "Draft copy 2026"]) {
      for (const angle of [0, 45]) {
        const unitWidth = font.widthOfTextAtSize(text, 1);
        const serverSize = stampSize({
          pageWidth: 595.28,
          pageHeight: 841.89,
          unitWidth,
          angle,
        });
        assert.ok(serverSize >= 8 && serverSize <= 200);
        assert.equal(
          clientStampSize({
            pageWidth: 595.28,
            pageHeight: 841.89,
            unitWidth,
            angle,
          }),
          serverSize,
        );
      }
    }
  });
});
