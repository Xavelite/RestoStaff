import { unzipSync, strFromU8 } from "../vendor/fflate.js";
import { escapeHTML as esc } from "./model.js";

export function fileKind(name = "", mime = "") {
  const ext = name
    .split(/[?#]/)[0]
    .split("/")
    .pop()
    .split(".")
    .pop()
    .toLowerCase();
  if (/^(xlsx|xlsm|xls|csv|ods)$/.test(ext))
    return {
      label: "Excel / spreadsheet",
      icon: "chart",
      color: "sage",
      ext,
      family: "excel",
      mark: "X",
      short: "Excel",
    };
  if (/^(pptx|pptm|ppt|odp)$/.test(ext))
    return {
      label: "PowerPoint presentation",
      icon: "video",
      color: "amber",
      family: "powerpoint",
      mark: "P",
      short: "PowerPoint",
      ext,
    };
  if (/^(docx|docm|doc|odt)$/.test(ext))
    return {
      label: "Word document",
      icon: "file",
      color: "blue",
      ext,
      family: "word",
      mark: "W",
      short: "Word",
    };
  if (mime.startsWith("image/") || /^(png|jpe?g|webp|gif|avif)$/.test(ext))
    return { label: "Photo", icon: "image", color: "rose", ext };
  if (ext === "pdf")
    return {
      label: "PDF document",
      icon: "file",
      color: "rose",
      ext,
      family: "pdf",
      mark: "PDF",
      short: "PDF document",
    };
  if (/^(txt|md|json|log|rtf)$/.test(ext))
    return {
      label: "Text document",
      icon: "file",
      color: "violet",
      ext,
      family: "text",
      mark: ext === "md" ? "MD" : ext === "json" ? "{ }" : "TXT",
      short:
        ext === "md" ? "Markdown" : ext === "json" ? "JSON" : "Text document",
    };
  return {
    label: "File",
    icon: "file",
    color: "neutral",
    ext,
    family: "generic",
    mark: ext.toUpperCase().slice(0, 4) || "FILE",
    short: "File",
  };
}
export function readOfficeArchive(bytes) {
  let total = 0,
    count = 0;
  return unzipSync(bytes, {
    filter(entry) {
      if (++count > 2500)
        throw Error("This document has too many parts to preview.");
      const wanted = /^(xl|ppt|word)\/.*\.(xml|rels)$/i.test(entry.name);
      if (!wanted) return false;
      total += entry.originalSize;
      if (entry.originalSize > 8 * 1024 * 1024 || total > 24 * 1024 * 1024)
        throw Error("This document is too large to preview here.");
      return true;
    },
  });
}
const elements = (node, name) =>
  Array.from(node.getElementsByTagNameNS("*", name));
const content = (node, name) =>
  elements(node, name)
    .map((n) => n.textContent)
    .join("");
function xml(files, path) {
  if (!files[path]) return null;
  const text = strFromU8(files[path]);
  if (/<!DOCTYPE|<!ENTITY/i.test(text))
    throw Error("This document uses an unsupported XML format.");
  const doc = new DOMParser().parseFromString(text, "application/xml");
  if (doc.getElementsByTagName("parsererror").length)
    throw Error("This document could not be read.");
  return doc;
}
function resolvePart(base, target) {
  if (!target || /^[a-z]+:/i.test(target)) return "";
  const parts = (
    target.startsWith("/") ? target.slice(1) : `${base}/${target}`
  ).split("/");
  const clean = [];
  for (const part of parts) {
    if (part === "..") clean.pop();
    else if (part !== "." && part) clean.push(part);
  }
  return clean.join("/");
}
function relationships(files, path, base) {
  const doc = xml(files, path);
  return new Map(
    doc
      ? elements(doc, "Relationship")
          .filter((e) => e.getAttribute("TargetMode") !== "External")
          .map((e) => [
            e.getAttribute("Id"),
            resolvePart(base, e.getAttribute("Target")),
          ])
      : [],
  );
}
function tabbed(items, note) {
  if (!items.length)
    throw Error("No readable content was found in this document.");
  return `<div class="office-preview"><p class="preview-note">${esc(note)}</p><div class="office-tabs" role="group" aria-label="Document pages">${items.map((s, i) => `<button type="button" data-office-tab="${i}" aria-pressed="${i === 0}">${esc(s.title)}</button>`).join("")}</div>${items.map((s, i) => `<section class="office-page" data-office-page="${i}" ${i ? "hidden" : ""}>${s.html}</section>`).join("")}</div>`;
}
function columnIndex(ref) {
  let n = 0;
  for (const char of ref.replace(/[0-9]/g, "").toUpperCase())
    n = n * 26 + char.charCodeAt(0) - 64;
  return n - 1;
}
function columnName(i) {
  let out = "";
  for (i++; i; i = Math.floor((i - 1) / 26))
    out = String.fromCharCode(65 + ((i - 1) % 26)) + out;
  return out;
}
export async function officePreview(blob, name) {
  const ext = fileKind(name).ext;
  if (!["xlsx", "xlsm", "docx", "docm", "pptx", "pptm"].includes(ext))
    return null;
  const files = readOfficeArchive(new Uint8Array(await blob.arrayBuffer()));
  if (ext.startsWith("xls")) {
    const workbook = xml(files, "xl/workbook.xml");
    if (!workbook) throw Error("The spreadsheet could not be read.");
    const rels = relationships(files, "xl/_rels/workbook.xml.rels", "xl");
    const stringsDoc = xml(files, "xl/sharedStrings.xml");
    const strings = stringsDoc
      ? elements(stringsDoc, "si").map((e) => content(e, "t"))
      : [];
    const sheets = elements(workbook, "sheet")
      .slice(0, 20)
      .map((sheet) => {
        const rid = Array.from(sheet.attributes).find(
          (a) => a.localName === "id",
        )?.value;
        const doc = xml(files, rels.get(rid));
        const rows = doc ? elements(doc, "row").slice(0, 200) : [];
        let width = 1;
        const parsed = rows.map((row, i) => {
          const values = new Map();
          for (const cell of elements(row, "c")) {
            const index = columnIndex(cell.getAttribute("r"));
            if (index < 0 || index >= 40) continue;
            width = Math.max(width, index + 1);
            const t = cell.getAttribute("t"),
              raw = content(cell, "v");
            const value =
              t === "s"
                ? strings[Number(raw)] || ""
                : t === "inlineStr"
                  ? content(cell, "t")
                  : t === "b"
                    ? raw === "1"
                      ? "TRUE"
                      : "FALSE"
                    : raw ||
                      (content(cell, "f") ? `=${content(cell, "f")}` : "");
            values.set(index, value);
          }
          return { number: row.getAttribute("r") || i + 1, values };
        });
        return {
          title: sheet.getAttribute("name") || "Sheet",
          html: `<div class="sheet-scroll"><table class="sheet-table"><thead><tr><th></th>${Array.from({ length: width }, (_, i) => `<th scope="col">${columnName(i)}</th>`).join("")}</tr></thead><tbody>${parsed.map((r) => `<tr><th scope="row">${esc(r.number)}</th>${Array.from({ length: width }, (_, i) => `<td>${esc(r.values.get(i) || "")}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`,
        };
      });
    return tabbed(
      sheets,
      "Read-only values preview · up to 20 sheets, 200 rows and 40 columns per sheet. Formatting, charts and date formats are not rendered. Formulas use saved results.",
    );
  }
  if (ext.startsWith("ppt")) {
    const presentation = xml(files, "ppt/presentation.xml");
    const rels = relationships(files, "ppt/_rels/presentation.xml.rels", "ppt");
    const paths = presentation
      ? elements(presentation, "sldId")
          .map((e) =>
            rels.get(
              Array.from(e.attributes).find(
                (a) => a.localName === "id" && a.prefix,
              )?.value,
            ),
          )
          .filter(Boolean)
      : [];
    return tabbed(
      paths.slice(0, 100).map((path, i) => {
        const doc = xml(files, path);
        const paragraphs = doc
          ? elements(doc, "p")
              .map((p) => content(p, "t"))
              .filter(Boolean)
          : [];
        return {
          title: `Slide ${i + 1}`,
          html: `<article class="slide-preview"><span class="slide-number">SLIDE ${i + 1}</span><h3>${esc(paragraphs[0] || "Visual slide")}</h3>${
            paragraphs
              .slice(1)
              .map((p) => `<p>${esc(p)}</p>`)
              .join("") ||
            '<p class="muted">No additional text on this slide.</p>'
          }</article>`,
        };
      }),
      "Read-only slide text · up to 100 slides. Pictures, layouts, animations and speaker notes are not rendered. Download to see the original presentation.",
    );
  }
  const doc = xml(files, "word/document.xml");
  if (!doc) throw Error("The document could not be read.");
  const paras = elements(doc, "p")
    .slice(0, 2000)
    .map((p) => content(p, "t"));
  return `<div class="office-preview"><p class="preview-note">Read-only text preview · formatting, pictures and page layout are simplified.</p><article class="word-preview">${paras.map((p) => `<p>${esc(p) || "&nbsp;"}</p>`).join("")}</article></div>`;
}
if (typeof document !== "undefined")
  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-office-tab]");
    if (!button) return;
    const preview = button.closest(".office-preview");
    for (const b of preview.querySelectorAll("[data-office-tab]"))
      b.setAttribute("aria-pressed", String(b === button));
    for (const page of preview.querySelectorAll("[data-office-page]"))
      page.hidden = page.dataset.officePage !== button.dataset.officeTab;
  });
