import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { toolSections, SECTION_TITLES } from "../../client/src/components/landing/LandingData.js";
import { TOOLS } from "../../client/src/lib/toolConfig.js";
import { buildConversionSections } from "../../client/src/lib/conversionsHub.js";

describe("landing sections", () => {
  const sections = toolSections(TOOLS, "all");

  it("All lists the four tool sections in fixed order", () => {
    assert.deepEqual(
      sections.map((section) => section.group),
      ["organize", "optimize", "edit", "security"],
    );
    for (const section of sections) {
      assert.ok(
        SECTION_TITLES[section.group],
        `${section.group} has no section title`,
      );
      assert.ok(section.tools.length > 0, `${section.group} section is empty`);
    }
  });

  it("the convert category is served by the Any To Any block, not a flat section", () => {
    // Every live convert tool must be reachable from the conversion tile
    // list the landing embeds; the dedicated pair pages can be shared by two
    // tile labels (jpg-to-pdf also serves PNG), so presence is the pin, not
    // uniqueness.
    const hrefs = buildConversionSections().flatMap((section) =>
      section.tiles
        .filter((tile) => tile.implemented)
        .map((tile) => tile.href),
    );
    const convertTools = TOOLS.filter(
      (tool) => tool.group === "convert" && tool.available,
    );
    assert.ok(convertTools.length > 0, "no live convert tools found");
    for (const tool of convertTools) {
      assert.ok(
        hrefs.includes(`/${tool.slug}`),
        `${tool.slug} is unreachable from the conversion block`,
      );
    }
  });

  it("every non-convert standard tool appears in exactly one section", () => {
    const ids = sections.flatMap((section) => section.tools.map((tool) => tool.id));
    assert.equal(new Set(ids).size, ids.length, "a tool appears twice");
    const flatTools = TOOLS.filter(
      (tool) => tool.group !== "intelligence" && tool.group !== "convert",
    ).map((tool) => tool.id);
    assert.deepEqual(
      [...ids].sort(),
      [...flatTools].sort(),
      "section grid drifted from the tool list",
    );
  });

  it("each tile sits in its own group section", () => {
    for (const section of sections) {
      for (const tool of section.tools) {
        assert.equal(tool.group, section.group, `${tool.id} sits in the wrong section`);
      }
    }
  });

  it("a tag filter shows exactly its own one section", () => {
    const organize = toolSections(TOOLS, "organize");
    assert.deepEqual(organize.map((section) => section.group), ["organize"]);
    const intelligence = toolSections(TOOLS, "intelligence");
    assert.deepEqual(intelligence.map((section) => section.group), ["intelligence"]);
    assert.equal(intelligence[0].tools.length, 3);
  });

  it("empty tags render nothing", () => {
    assert.deepEqual(toolSections(TOOLS, "workflows"), []);
  });
});
