// The client's copy of the watermark stamp size rule, mirroring
// utils/processors/watermarkProcessor.js stampSize() so the preview shows
// the stamp at the size the server will actually draw. The two formulas must
// change together; tests/utils/processors/watermarkStampMirror.test.js pins
// them against each other.
//
// The server measures the text with the built-in Helvetica. The browser has
// no Helvetica per-point metrics table of its own, so the unit width comes
// from canvas measureText with Arial, which is metrically compatible with
// Helvetica (near-identical widths), scaled down to the 1 pt unit width the
// server formula uses. The clamp guard rails absorb the small difference.

// Mirror of the server CONVERSION clamp: 8 pt floor, 200 pt ceiling.
function clampSize(size) {
  return Math.min(200, Math.max(8, size));
}

// The width of the text at size 1, in pt per pt, measured through Arial.
export function measureUnitWidth(text) {
  if (!text) return 0.001;
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) return 0.001;
  context.font = "100px Arial, 'Helvetica Neue', Helvetica, sans-serif";
  const measured = context.measureText(text).width;
  if (!measured) return 0.001;
  return measured / 100;
}

// Mirror of the server stampSize(): the pt size the stamp is drawn with.
export function stampSize({ pageWidth, pageHeight, unitWidth, angle }) {
  if (angle === 45) {
    const rotatedHalf = Math.SQRT1_2;
    const byWidth = (pageWidth * 0.9) / (rotatedHalf * (unitWidth + 1));
    const byHeight = (pageHeight * 0.9) / (rotatedHalf * (unitWidth + 1));
    return clampSize(Math.min(byWidth, byHeight));
  }

  const byWidth = (pageWidth * 0.72) / Math.max(unitWidth, 0.001);
  return clampSize(Math.min(byWidth, pageHeight * 0.4));
}

// Mirror of the server mosaicGrid(): the tiled layout for the mosaic type -
// three cells across the page, rows filled beneath. Must change together
// with the server copy; the mirror test pins both functions.
export const MOSAIC_COLS = 3;

export function mosaicGrid({ pageWidth, pageHeight }) {
  const cols = MOSAIC_COLS;
  const cellWidth = pageWidth / cols;
  const rows = Math.max(1, Math.round(pageHeight / cellWidth));
  return { cols, rows, cellWidth, cellHeight: pageHeight / rows };
}
