import { describe, it } from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import { isOleCompoundBuffer, validateOfficePackage, removeDocProps } from "../../../utils/helpers/office.js";

describe("office helpers", () => {
  describe("isOleCompoundBuffer", () => {
    const OLE_SIG = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);

    it("returns true for exact OLE signature", () => {
      assert.equal(isOleCompoundBuffer(OLE_SIG), true);
    });
    it("returns true for buffer starting with OLE sig + extra bytes", () => {
      const buf = Buffer.concat([OLE_SIG, Buffer.from([0x00, 0x01, 0x02, 0x03])]);
      assert.equal(isOleCompoundBuffer(buf), true);
    });
    it("returns false for non-OLE buffer", () => {
      assert.equal(isOleCompoundBuffer(Buffer.from([0x50, 0x4b, 0x03, 0x04])), false); // ZIP magic
      assert.equal(isOleCompoundBuffer(Buffer.from("hello world")), false);
    });
    it("returns false for truncated buffer shorter than sig", () => {
      assert.equal(isOleCompoundBuffer(Buffer.from([0xd0, 0xcf])), false);
      assert.equal(isOleCompoundBuffer(Buffer.alloc(0)), false);
      assert.equal(isOleCompoundBuffer(Buffer.from([0xd0])), false);
    });
    it("returns false for null/undefined/non-buffer", () => {
      assert.equal(isOleCompoundBuffer(null), false);
      assert.equal(isOleCompoundBuffer(undefined), false);
      assert.equal(isOleCompoundBuffer("not a buffer"), false);
      assert.equal(isOleCompoundBuffer({}), false);
      assert.equal(isOleCompoundBuffer(123), false);
    });
    it("returns false for buffer with one byte differing", () => {
      const wrong = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe0]); // last byte 0xe0 not 0xe1
      assert.equal(isOleCompoundBuffer(wrong), false);
    });
    it("returns false for empty and for buffer length 7", () => {
      assert.equal(isOleCompoundBuffer(Buffer.alloc(7)), false);
    });
    it("handles Uint8Array vs Buffer? Only Buffer true", () => {
      // isOleCompoundBuffer checks Buffer.isBuffer, so Uint8Array should be false
      const ua = new Uint8Array(OLE_SIG);
      assert.equal(isOleCompoundBuffer(ua), false);
    });
  });

  describe("validateOfficePackage", () => {
    async function createDocxZip({ missingEntries = [], extraRelationships = [] } = {}) {
      const zip = new JSZip();
      const required = [
        "[Content_Types].xml",
        "_rels/.rels",
        "word/document.xml",
        "word/_rels/document.xml.rels",
      ];
      for (const entry of required) {
        if (!missingEntries.includes(entry)) {
          if (entry === "_rels/.rels") {
            zip.file(entry, `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`);
          } else if (entry === "word/_rels/document.xml.rels") {
            // include relationships
            let relXml = `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`;
            for (const rel of extraRelationships) {
              relXml += `<Relationship Id="${rel.id}" Type="${rel.type}" Target="${rel.target}"${rel.targetMode ? ` TargetMode="${rel.targetMode}"` : ""}/>`;
            }
            relXml += `</Relationships>`;
            zip.file(entry, relXml);
          } else {
            zip.file(entry, `<dummy>${entry}</dummy>`);
          }
        }
      }
      return zip;
    }

    it("passes valid docx package", async () => {
      const zip = await createDocxZip();
      await assert.doesNotReject(() => validateOfficePackage(zip, ".docx"));
    });
    it("throws for missing required docx entry", async () => {
      const zip = await createDocxZip({ missingEntries: ["word/document.xml"] });
      await assert.rejects(() => validateOfficePackage(zip, ".docx"), /Missing required Office entry: word\/document\.xml/);
    });
    it("throws for missing [Content_Types].xml", async () => {
      const zip = await createDocxZip({ missingEntries: ["[Content_Types].xml"] });
      await assert.rejects(() => validateOfficePackage(zip, ".docx"), /Missing required Office entry: \[Content_Types\]\.xml/);
    });
    it("passes valid pptx package", async () => {
      const zip = new JSZip();
      const requiredPptx = [
        "[Content_Types].xml",
        "_rels/.rels",
        "ppt/presentation.xml",
        "ppt/_rels/presentation.xml.rels",
      ];
      for (const e of requiredPptx) zip.file(e, `<x>${e}</x>`);
      zip.file("_rels/.rels", `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/></Relationships>`);
      // Need valid relationship that resolves
      zip.file("ppt/_rels/presentation.xml.rels", `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`);
      await assert.doesNotReject(() => validateOfficePackage(zip, ".pptx"));
    });
    it("throws for broken relationship target", async () => {
      const zip = await createDocxZip({
        extraRelationships: [{ id: "rId5", type: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/image", target: "media/missing.png" }],
      });
      // need to create word/media? not exist, so should throw
      await assert.rejects(() => validateOfficePackage(zip, ".docx"), /Broken relationship/);
    });
    it("passes when relationship target exists", async () => {
      const zip = await createDocxZip({
        extraRelationships: [{ id: "rId5", type: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/image", target: "media/image1.png" }],
      });
      zip.file("word/media/image1.png", "fakeimage");
      await assert.doesNotReject(() => validateOfficePackage(zip, ".docx"));
    });
    it("ignores External TargetMode", async () => {
      const zip = await createDocxZip({
        extraRelationships: [{ id: "rIdExt", type: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink", target: "https://example.com", targetMode: "External" }],
      });
      await assert.doesNotReject(() => validateOfficePackage(zip, ".docx"));
    });
    it("ignores absolute http URL target without TargetMode? treats as external because contains ://", async () => {
      const zip = await createDocxZip({
        extraRelationships: [{ id: "rIdHttp", type: "http://example", target: "https://example.com/page" }],
      });
      await assert.doesNotReject(() => validateOfficePackage(zip, ".docx"));
    });
    it("resolves absolute \"/\" target correctly (leading slash)", async () => {
      // relationship with Target="/word/media/image1.png" should resolve to word/media/image1.png
      const zip = await createDocxZip({
        extraRelationships: [{ id: "rIdAbs", type: "http://type", target: "/word/media/image1.png" }],
      });
      zip.file("word/media/image1.png", "data");
      await assert.doesNotReject(() => validateOfficePackage(zip, ".docx"));
    });
    it("handles broken absolute target", async () => {
      const zip = await createDocxZip({
        extraRelationships: [{ id: "rIdAbsBroken", type: "http://type", target: "/word/media/missing.png" }],
      });
      await assert.rejects(() => validateOfficePackage(zip, ".docx"), /Broken relationship/);
    });
    it("handles fragment and query in target", async () => {
      const zip = await createDocxZip({
        extraRelationships: [{ id: "rIdFrag", type: "http://type", target: "media/image1.png#frag?query=1" }],
      });
      zip.file("word/media/image1.png", "data");
      // Our resolve strips fragment/query via split, but our mock target includes fragment, should still resolve to media/image1.png
      // However implementation does split("#")[0].split("?")[0] => but it does split on "#", then "?" - for "media/image1.png#frag?query=1" => "media/image1.png"
      // But we gave target with #frag, so after split it becomes media/image1.png which exists => should pass
      await assert.doesNotReject(() => validateOfficePackage(zip, ".docx"));
    });
    it("throws for missing presentation entry for pptx", async () => {
      const zip = new JSZip();
      zip.file("[Content_Types].xml", "<x/>");
      zip.file("_rels/.rels", "<Relationships/>");
      // missing ppt/presentation.xml
      await assert.rejects(() => validateOfficePackage(zip, ".pptx"), /Missing required Office entry/);
    });
    it("no required entries for xlsx (empty check) passes", async () => {
      const zip = new JSZip();
      zip.file("[Content_Types].xml", "<x/>");
      // xlsx has no REQUIRED_OOXML_ENTRIES entry, so should pass even with minimal
      await assert.doesNotReject(() => validateOfficePackage(zip, ".xlsx"));
    });
    it("handles empty relationships file gracefully", async () => {
      const zip = await createDocxZip();
      // overwrite relationship file with empty
      zip.file("word/_rels/document.xml.rels", `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`);
      await assert.doesNotReject(() => validateOfficePackage(zip, ".docx"));
    });
    it("handles relationship xml with no Target attribute", async () => {
      const zip = await createDocxZip();
      zip.file("word/_rels/document.xml.rels", `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://type"/></Relationships>`);
      await assert.doesNotReject(() => validateOfficePackage(zip, ".docx"));
    });
    it("normalizes backslash paths", async () => {
      const zip = await createDocxZip({
        extraRelationships: [{ id: "rId1", type: "http://type", target: "media\\image1.png" }],
      });
      zip.file("word/media/image1.png", "data");
      await assert.doesNotReject(() => validateOfficePackage(zip, ".docx"));
    });
    it("handles .. segments in target path", async () => {
      // relationship at word/_rels/document.xml.rels targeting ../media/image1.png => should normalize to word/media/image1.png? Wait basePath for word/_rels/document.xml.rels is "word"
      // So target "../media/image1.png" from base "word" => "media/image1.png" ??? Let's check impl: basePath is "word", target "../media/image1.png" normalized => segments ["..","media","image1.png"] => pop => ["media","image1.png"] => "media/image1.png" but file at word/media/image1.png would not match.
      // Actually to reach word/media, need target "media/image1.png" not "../media". So this test expects broken.
      const zip = await createDocxZip({
        extraRelationships: [{ id: "rIdUp", type: "http://type", target: "../media/image1.png" }],
      });
      zip.file("media/image1.png", "data");
      await assert.doesNotReject(() => validateOfficePackage(zip, ".docx"));
      // Now test broken if file not there
      const zip2 = await createDocxZip({
        extraRelationships: [{ id: "rIdUp", type: "http://type", target: "../media/missing.png" }],
      });
      await assert.rejects(() => validateOfficePackage(zip2, ".docx"), /Broken relationship/);
    });
  });

  describe("removeDocProps", () => {
    it("replaces existing docProps files with templates", async () => {
      const zip = new JSZip();
      zip.file("docProps/core.xml", "<old>core</old>");
      zip.file("docProps/app.xml", "<old>app</old>");
      zip.file("docProps/custom.xml", "<old>custom</old>");
      zip.file("[Content_Types].xml", "<x/>");
      await removeDocProps(zip);
      const core = await zip.file("docProps/core.xml").async("string");
      const app = await zip.file("docProps/app.xml").async("string");
      const custom = await zip.file("docProps/custom.xml").async("string");
      assert.match(core, /Dr\.Docs|coreProperties/);
      assert.match(app, /Dr\.Docs/);
      assert.match(custom, /Properties/);
      assert.notEqual(core, "<old>core</old>");
    });
    it("does not create docProps if not existed", async () => {
      const zip = new JSZip();
      zip.file("[Content_Types].xml", "<x/>");
      await removeDocProps(zip);
      assert.equal(zip.file("docProps/core.xml"), null);
      assert.equal(zip.file("docProps/app.xml"), null);
    });
    it("only replaces present files, leaves others untouched", async () => {
      const zip = new JSZip();
      zip.file("docProps/core.xml", "<old/>");
      zip.file("word/document.xml", "<w:document/>");
      await removeDocProps(zip);
      assert.ok(zip.file("docProps/core.xml"));
      assert.equal(zip.file("docProps/app.xml"), null);
      const doc = await zip.file("word/document.xml").async("string");
      assert.equal(doc, "<w:document/>");
    });
  });
});
