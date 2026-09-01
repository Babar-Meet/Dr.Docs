const OLE_SIGNATURE = Buffer.from([
  0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1,
]);

const DOC_PROPS_TEMPLATES = {
  "docProps/core.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title></dc:title>
  <dc:subject></dc:subject>
  <dc:creator></dc:creator>
  <cp:keywords></cp:keywords>
  <dc:description></dc:description>
  <cp:lastModifiedBy></cp:lastModifiedBy>
  <cp:revision>1</cp:revision>
</cp:coreProperties>`,
  "docProps/app.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>Dr.Docs</Application>
  <Company></Company>
  <Manager></Manager>
  <HyperlinkBase></HyperlinkBase>
</Properties>`,
  "docProps/custom.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/custom-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"/>`,
};

const REQUIRED_OOXML_ENTRIES = {
  ".docx": [
    "[Content_Types].xml",
    "_rels/.rels",
    "word/document.xml",
    "word/_rels/document.xml.rels",
  ],
  ".pptx": [
    "[Content_Types].xml",
    "_rels/.rels",
    "ppt/presentation.xml",
    "ppt/_rels/presentation.xml.rels",
  ],
};

export function isOleCompoundBuffer(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < OLE_SIGNATURE.length) {
    return false;
  }

  return buffer.subarray(0, OLE_SIGNATURE.length).equals(OLE_SIGNATURE);
}

function parseXmlAttributes(rawAttributes) {
  const attributes = {};
  const attributeRegex = /([A-Za-z:]+)="([^"]*)"/g;

  for (const match of rawAttributes.matchAll(attributeRegex)) {
    attributes[match[1]] = match[2];
  }

  return attributes;
}

function normalizeZipPath(pathValue) {
  const normalizedSegments = [];

  for (const segment of pathValue.replace(/\\/g, "/").split("/")) {
    if (!segment || segment === ".") {
      continue;
    }

    if (segment === "..") {
      normalizedSegments.pop();
      continue;
    }

    normalizedSegments.push(segment);
  }

  return normalizedSegments.join("/");
}

function resolveRelationshipTargetPath(relationshipPath, targetPath) {
  const cleanTarget = targetPath.split("#")[0].split("?")[0].trim();
  if (!cleanTarget) {
    return "";
  }

  if (cleanTarget.startsWith("/")) {
    return normalizeZipPath(cleanTarget.slice(1));
  }

  if (cleanTarget.includes("://")) {
    return "";
  }

  if (relationshipPath === "_rels/.rels") {
    return normalizeZipPath(cleanTarget);
  }

  const relationshipMarker = "/_rels/";
  const markerIndex = relationshipPath.indexOf(relationshipMarker);
  const basePath =
    markerIndex >= 0 ? relationshipPath.slice(0, markerIndex) : "";

  return normalizeZipPath(
    basePath ? `${basePath}/${cleanTarget}` : cleanTarget,
  );
}

export async function removeDocProps(zip) {
  for (const [filePath, template] of Object.entries(DOC_PROPS_TEMPLATES)) {
    if (zip.file(filePath)) {
      zip.file(filePath, template);
    }
  }
}

export async function validateOfficePackage(zip, extension) {
  const requiredEntries = REQUIRED_OOXML_ENTRIES[extension] || [];

  for (const entry of requiredEntries) {
    if (!zip.file(entry)) {
      throw new Error(`Missing required Office entry: ${entry}`);
    }
  }

  const relationshipFiles = zip.file(/_rels\/.*\.rels$/);
  const relationshipTagRegex = /<Relationship\b([^>]*)\/?\s*>/g;

  for (const relationshipFile of relationshipFiles) {
    const relationshipXml = await relationshipFile.async("string");

    for (const match of relationshipXml.matchAll(relationshipTagRegex)) {
      const attributes = parseXmlAttributes(match[1]);
      if (!attributes.Target || attributes.TargetMode === "External") {
        continue;
      }

      const resolvedTarget = resolveRelationshipTargetPath(
        relationshipFile.name,
        attributes.Target,
      );

      if (!resolvedTarget) {
        continue;
      }

      if (!zip.file(resolvedTarget)) {
        throw new Error(
          `Broken relationship in ${relationshipFile.name}: ${attributes.Target}`,
        );
      }
    }
  }
}
