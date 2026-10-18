import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  CONVERSION_TARGETS,
} from "../../utils/constants.js";
import { CONVERSION_TARGETS as CLIENT_MIRROR } from "../../client/src/lib/conversionTargets.js";
import {
  FORMAT_LABELS,
  SECTION_SOURCES,
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
      // GENERIC_CONVERT lives outside TOOLS: its /convert-pdf page accepts
      // every live pair that has no dedicated tool page.
      liveSlugs.add("convert-pdf");
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
            assert.ok(liveSlugs.has(tile.href.slice(1)), `tile ${tile.id} links to a dead page`);
          } else {
            assert.equal(tile.href, null);
            assert.ok(tile.note.startsWith("Not built yet"));
          }
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
});
