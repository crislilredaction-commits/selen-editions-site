import { NextResponse } from "next/server";

const encoder = new TextEncoder();

function crc32(data: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function u16(value: number) {
  const out = new Uint8Array(2);
  new DataView(out.buffer).setUint16(0, value, true);
  return out;
}

function u32(value: number) {
  const out = new Uint8Array(4);
  new DataView(out.buffer).setUint32(0, value >>> 0, true);
  return out;
}

function concat(parts: Uint8Array[]) {
  const size = parts.reduce((sum, part) => sum + part.length, 0);
  const result = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

type ZipEntry = { name: string; content: string };

function makeZip(entries: ZipEntry[]) {
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const data = encoder.encode(entry.content);
    const checksum = crc32(data);
    const local = concat([
      u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0),
      u32(checksum), u32(data.length), u32(data.length), u16(name.length), u16(0), name, data,
    ]);
    localParts.push(local);

    centralParts.push(concat([
      u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0),
      u32(checksum), u32(data.length), u32(data.length), u16(name.length), u16(0), u16(0),
      u16(0), u16(0), u32(0), u32(offset), name,
    ]));
    offset += local.length;
  }

  const central = concat(centralParts);
  const end = concat([
    u32(0x06054b50), u16(0), u16(0), u16(entries.length), u16(entries.length),
    u32(central.length), u32(offset), u16(0),
  ]);
  return concat([...localParts, central, end]);
}

function paragraph(text: string, style?: string) {
  const safe = text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
  const pStyle = style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : "";
  return `<w:p>${pStyle}<w:r><w:t xml:space="preserve">${safe}</w:t></w:r></w:p>`;
}

function blankLine() {
  return paragraph("________________________________________________________________________________");
}

function field(label: string) {
  return `${paragraph(label, "FieldLabel")}${blankLine()}`;
}

function moduleBlock(moduleNumber: number) {
  return [
    paragraph(`Module ${moduleNumber}`, "Heading2"),
    field("Durée :"),
    field("Chapitre 1 :"),
    field("Chapitre 2 :"),
    field("Chapitre 3 :"),
  ].join("");
}

function documentXml() {
  const body = [
    paragraph("Programme de formation", "Title"),
    paragraph("Trame éditable à compléter puis à importer dans Selen Daily", "Subtitle"),
    paragraph("1. Identification de la formation", "Heading1"),
    field("Intitulé de la formation"), field("Organisme de formation"), field("Public visé"),
    field("Durée en heures et en jours"), field("Modalité : présentiel, distanciel ou mixte"), field("Tarif TTC"),
    paragraph("2. Objectifs", "Heading1"),
    field("Objectif principal"), field("Objectifs pédagogiques"),
    paragraph("3. Prérequis", "Heading1"),
    paragraph("Indiquez uniquement les conditions réellement nécessaires. Tout prérequis déclaré devra être vérifié pour chaque apprenant."),
    field("Prérequis"),
    paragraph("4. Contenu détaillé", "Heading1"),
    paragraph("Présentez le programme par modules et chapitres. Dupliquez ou supprimez les blocs selon les besoins de votre formation."),
    moduleBlock(1), moduleBlock(2), moduleBlock(3), moduleBlock(4),
    paragraph("5. Moyens pédagogiques et techniques", "Heading1"),
    field("Moyens mobilisés"),
    paragraph("6. Modalités d’évaluation", "Heading1"),
    field("Évaluation des acquis"), field("Positionnement avant la formation"),
    paragraph("7. Accès et contacts", "Heading1"),
    field("Délai d’accès"), field("Téléphone de l’organisme"), field("Email de l’organisme"), field("Site Internet de l’organisme (facultatif)"),
  ].join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>${body}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"/></w:sectPr></w:body>
</w:document>`;
}

const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="22"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:rPr><w:b/><w:color w:val="8A4B24"/><w:sz w:val="48"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Subtitle"><w:name w:val="Subtitle"/><w:basedOn w:val="Normal"/><w:rPr><w:i/><w:color w:val="6B625C"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:rPr><w:b/><w:color w:val="8A4B24"/><w:sz w:val="32"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:rPr><w:b/><w:color w:val="8A4B24"/><w:sz w:val="26"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="FieldLabel"><w:name w:val="Field label"/><w:basedOn w:val="Normal"/><w:rPr><w:b/></w:rPr></w:style>
</w:styles>`;

export async function GET() {
  const file = makeZip([
    {
      name: "[Content_Types].xml",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`,
    },
    {
      name: "_rels/.rels",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
    },
    {
      name: "word/_rels/document.xml.rels",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    },
    { name: "word/document.xml", content: documentXml() },
    { name: "word/styles.xml", content: stylesXml },
  ]);

  return new NextResponse(file, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": 'attachment; filename="modele-programme-formation-selen.docx"',
      "Cache-Control": "public, max-age=3600",
    },
  });
}
