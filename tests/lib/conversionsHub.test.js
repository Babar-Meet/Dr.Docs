import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  CONVERSION_TARGETS,
} from "../../utils/constants.js";
import { CONVERSION_TARGETS as CLIENT_MIRROR } from "../../client/src/lib/conversionTargets.js";
import {
  FORMAT_LABELS,
  SECTION_SOURCES,
  FORMAT_COLORS,
  findPairTool,
  buildConversionSections,
} from "../../client/src/lib/conversionsHub.js";
import { TOOLS } from "../../client/src/lib/toolConfig.js";

describe("conversions hub data", () => {
  describe("client mirror sync", () => {
    it("matches the server CONVERSION_TARGETS exactly", () => {
      assert.deepEqual(CLIENT_MIRROR, CONVERSION_TARGETS);
    });
  });

  describe("sections", () => {
    const sections = buildConversionSections();

    it("builds one section per declared source", () => {
      assert.equal(sections.length, SECTION_SOURCES.length);
      for (const section of sections) {
        for (const sourceExtension of section.sourceExtensions) {
          assert.ok(
            CONVERSION_TARGETS[sourceExtension],
            `mirror has no source ${sourceExtension}`,
          );
        }
      }
    });

    it("every live tile targets a real mirror conversion with a real page", () => {
      const liveSlugs = new Set(TOOLS.filter((tool) => tool.available).map((tool) => tool.slug));
      for (const section of sections) {
        assert.ok(section.liveCount > 0, `${section.heading} has no live tile`);
        for (const tile of section.tiles) {
          assert.notEqual(FORMAT_LABELS[tile.targetKey], undefined);
          if (tile.implemented) {
            const mirrorTargets = section.sourceExtensions.flatMap(
              (extension) => CONVERSION_TARGETS[extension] || [],
            );
            const normalized = tile.targetKey === "jpg" ? ["jpg", "jpeg"] : [tile.targetKey];
            assert.ok(
              normalized.some((key) => mirrorTargets.includes(key)),
              `tile ${tile.id} has no mirror conversion`,
            );
            if (tile.href.startsWith("/convert/")) {
              assert.equal(
                tile.href,
                `/convert/${section.key}-to-${tile.targetKey}`,
                `tile ${tile.id} has a malformed pair page link`,
              );
            } else {
              assert.ok(liveSlugs.has(tile.href.slice(1)), `tile ${tile.id} links to a dead page`);
            }
          } else {
            assert.equal(tile.href, null);
            assert.ok(tile.note.includes("Not built yet"));
          }
        }
      }
    });

    it("tile labels show the conversion direction", () => {
      for (const section of sections) {
        for (const tile of section.tiles) {
          const targetLabel = FORMAT_LABELS[tile.targetKey];
          assert.equal(tile.label, `${section.sourceLabel} -> ${targetLabel}`);
        }
      }
    });

    it("descriptions name both extensions", () => {
      for (const section of sections) {
        const sourceExt = `.${section.key}`;
        for (const tile of section.tiles) {
          if (tile.implemented) {
            assert.ok(
              tile.note.startsWith(`Convert ${sourceExt} files to ${tile.extension}`),
              `${tile.id} note does not name both extensions: ${tile.note}`,
            );
          }
        }
      }
    });

    it("every tile carries colored source and target badges", () => {
      for (const section of sections) {
        for (const tile of section.tiles) {
          assert.equal(tile.sourceText, section.badge, `${tile.id} wrong source badge`);
          assert.ok(tile.sourceColor, `${tile.id} has no source color`);
          assert.ok(tile.targetColor, `${tile.id} has no target color`);
          assert.equal(
            tile.targetText,
            tile.extension.replace(".", "").toUpperCase(),
            `${tile.id} wrong target badge`,
          );
        }
      }
    });

    it("never lists the same target twice inside one section", () => {
      for (const section of sections) {
        const keys = section.tiles.map((tile) => tile.targetKey);
        assert.equal(new Set(keys).size, keys.length, `${section.heading} duplicates a target`);
      }
    });

    it("ids are unique across the whole page", () => {
      const ids = sections.flatMap((section) => section.tiles.map((tile) => tile.id));
      assert.equal(new Set(ids).size, ids.length);
    });

    it("jpg section collapses the jpeg alias", () => {
      const jpgSection = sections.find((section) => section.key === "jpg");
      const keys = jpgSection.tiles.map((tile) => tile.targetKey);
      assert.ok(!keys.includes("jpeg"), "jpeg alias must collapse into jpg");
      assert.ok(!keys.includes("jpg"), "a format never converts to itself");
      assert.deepEqual(keys, ["pdf", "png", "webp", "avif", "tiff"]);
    });

    it("queued PDF tiles stay queued", () => {
      const pdfSection = sections.find((section) => section.key === "pdf");
      const soon = pdfSection.tiles.filter((tile) => !tile.implemented);
      assert.deepEqual(
        soon.map((tile) => tile.targetKey).sort(),
        ["jpg", "pdfa", "png"].sort(),
      );
      for (const tile of soon) {
        const mirrorTargets = CONVERSION_TARGETS[".pdf"];
        assert.ok(!mirrorTargets.includes(tile.targetKey));
      }
    });

    it("live tile counts add up to the pinned totals", () => {
      const liveTotal = sections.reduce((sum, section) => sum + section.liveCount, 0);
      assert.equal(liveTotal, 37);
      const soonTotal = sections.reduce(
        (sum, section) => sum + section.tiles.filter((tile) => !tile.implemented).length,
        0,
      );
      assert.equal(soonTotal, 3);
    });
  });

  describe("pair pages", () => {
    const sections = buildConversionSections();
    const pairSlugs = sections.flatMap((section) =>
      section.tiles
        .filter((tile) => tile.implemented && tile.href.startsWith("/convert/"))
        .map((tile) => tile.href.slice("/convert/".length)),
    );

    it("every live pair without a dedicated page resolves to a locked convert tool", () => {
      assert.ok(pairSlugs.length > 0, "no pair pages built");
      assert.equal(new Set(pairSlugs).size, pairSlugs.length, "duplicate pair slug");
      for (const slug of pairSlugs) {
        const tool = findPairTool(slug);
        assert.ok(tool, `${slug} does not resolve to a tool`);
        assert.equal(tool.operation, "convert");
        assert.ok(tool.targetFormat, `${slug} has no locked target`);
        assert.ok(
          Array.isArray(tool.sourceExtensions) && tool.sourceExtensions.length > 0,
          `${slug} has no source extensions`,
        );
        assert.equal(tool.accept, tool.sourceExtensions.join(","));
        assert.ok(tool.label.includes(" -> "), `${slug} label misses the pair`);
      }
    });

    it("dedicated pairs never spawn a pair page", () => {
      const dedicatedSlugs = [
        "pdf-to-word",
        "pdf-to-powerpoint",
        "pdf-to-excel",
        "word-to-pdf",
        "powerpoint-to-pdf",
        "excel-to-pdf",
        "jpg-to-pdf",
      ];
      for (const slug of dedicatedSlugs) {
        assert.equal(findPairTool(slug), null, `${slug} must stay a dedicated page`);
      }
    });

    it("unknown pair slugs fall back to the hub", () => {
      assert.equal(findPairTool("no-such-pair"), null);
      assert.equal(findPairTool(null), null);
      assert.equal(findPairTool(""), null);
    });

    it("badge colors cover every page that shows badges", () => {
      for (const tool of TOOLS) {
        if (
          tool.available &&
          tool.operation === "convert" &&
          tool.targetFormat &&
          Array.isArray(tool.sourceExtensions) &&
          tool.sourceExtensions.length > 0
        ) {
          assert.ok(
            FORMAT_COLORS[tool.sourceExtensions[0].slice(1)],
            `${tool.slug} intro has no source color`,
          );
          assert.ok(FORMAT_COLORS[tool.targetFormat], `${tool.slug} intro has no target color`);
        }
      }
      for (const slug of pairSlugs) {
        const tool = findPairTool(slug);
        assert.ok(
          FORMAT_COLORS[tool.sourceExtensions[0].slice(1)],
          `${slug} intro has no source color`,
        );
        assert.ok(FORMAT_COLORS[tool.targetFormat], `${slug} intro has no target color`);
      }
    });
  });
});
