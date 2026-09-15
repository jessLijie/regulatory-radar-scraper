import { load } from "cheerio";
import { createHash } from "node:crypto";
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  renameSync,
  existsSync,
} from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { pageDifferences } from "./radar-review.mjs";

export const SOURCE_URL = "https://www.bnm.gov.my/banking-islamic-banking";
export const normalize = (text) =>
  text.normalize("NFC").replace(/\s+/gu, " ").trim();
export const digest = (text) => createHash("sha256").update(text).digest("hex");
const file = fileURLToPath(
  new URL("../.radar-data/catalog.json", import.meta.url),
);
let state = { items: [], documents: {}, lastScan: null };
if (existsSync(file)) {
  state = JSON.parse(readFileSync(file, "utf8"));
  if (!Array.isArray(state.items) || !state.documents)
    throw new Error(
      "The saved publication catalog is invalid. Preserve .radar-data and restore a valid copy before restarting.",
    );
}
function save(next) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(`${file}.tmp`, JSON.stringify(next), "utf8");
  renameSync(`${file}.tmp`, file);
  state = next;
}
export function safeSourceUrl(value, base = SOURCE_URL) {
  if (typeof value !== "string" || !value.trim())
    throw new Error("The source link is missing.");
  const url = new URL(value, base);
  if (
    url.protocol !== "https:" ||
    !["www.bnm.gov.my", "bnm.gov.my"].includes(url.hostname) ||
    url.port ||
    url.username ||
    url.password
  )
    throw new Error("Only public HTTPS documents on bnm.gov.my are supported.");
  url.hash = "";
  return url.href;
}
export function parseDate(text) {
  const found = text.match(
    /\b(\d{1,2})\s+(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(20\d{2})\b/i,
  );
  if (!found) return null;
  const month = [
    "jan",
    "feb",
    "mar",
    "apr",
    "may",
    "jun",
    "jul",
    "aug",
    "sep",
    "oct",
    "nov",
    "dec",
  ].indexOf(found[2].slice(0, 3).toLowerCase());
  const day = Number(found[1]);
  const date = new Date(Date.UTC(Number(found[3]), month, day));
  return date.getUTCDate() === day ? date.toISOString().slice(0, 10) : null;
}
export function parsePublications(html) {
  const $ = load(html);
  $("script, style, .hidden, .tohideall").remove();
  const items = [];
  $("tr").each((_index, row) => {
    const cells = $(row).find("td");
    if (cells.length < 3) return;
    const date = parseDate($(cells[0]).text());
    if (!date) return;
    const links = [];
    $(cells[1])
      .find("a[href]")
      .each((_i, anchor) => {
        const title = normalize($(anchor).text());
        if (!title) return;
        try {
          links.push({ title, url: safeSourceUrl($(anchor).attr("href")) });
        } catch {
          /* Skip off-site links. */
        }
      });
    if (!links.length) return;
    const title = links[0].title;
    const listingText = normalize($(cells[1]).text());
    const type = normalize($(cells[2]).text()) || "Publication";
    const hint =
      /anti.money|launder|terroris|proliferation|sanction|\baml\b|kyc|know.your.customer|due diligence/i.test(
        title,
      );
    items.push({
      id: digest(links[0].url).slice(0, 24),
      title,
      url: links[0].url,
      publishedAt: date,
      type,
      listingText,
      attachments: links.slice(1),
      topic: hint ? "AML / KYC" : "Other topics",
      listingHash: digest(
        JSON.stringify({ title, date, type, listingText, links }),
      ),
    });
  });
  return [...new Map(items.map((item) => [item.id, item])).values()];
}
export function mergePublications(
  previous,
  incoming,
  now,
  baseline = previous.length === 0,
) {
  const old = new Map(previous.map((item) => [item.id, item]));
  return incoming
    .map((item) => {
      const before = old.get(item.id);
      return {
        ...item,
        firstSeenAt: before?.firstSeenAt || now,
        lastSeenAt: now,
        available: true,
        change: !before
          ? baseline
            ? "baseline"
            : "new"
          : before.listingHash !== item.listingHash
            ? "listing"
            : "unchanged",
        changedAt:
          before && before.listingHash !== item.listingHash
            ? now
            : before?.changedAt || null,
      };
    })
    .concat(
      previous
        .filter((item) => !incoming.some((newItem) => newItem.id === item.id))
        .map((item) => ({ ...item, available: false, change: "unlisted" })),
    );
}
async function fetchPublic(url, signal, maxBytes = 15_000_000) {
  let current = safeSourceUrl(url);
  const timeout = AbortSignal.any([signal, AbortSignal.timeout(35_000)]);
  for (let redirects = 0; redirects < 5; redirects++) {
    const response = await fetch(current, {
      redirect: "manual",
      signal: timeout,
      headers: {
        "User-Agent":
          "Regulatory-Radar/2.0 (user-triggered public-document review)",
        Accept: "text/html,application/pdf",
      },
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      await response.body?.cancel();
      current = safeSourceUrl(response.headers.get("location"), current);
      continue;
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(
        `BNM returned HTTP ${response.status}. Please try again later.`,
      );
    }
    if (Number(response.headers.get("content-length")) > maxBytes) {
      await response.body?.cancel();
      throw new Error("The source exceeds this app’s 15 MB document limit.");
    }
    const chunks = [];
    let size = 0;
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > maxBytes)
        throw new Error("The source exceeds this app’s document limit.");
      chunks.push(chunk);
    }
    return {
      bytes: Buffer.concat(chunks),
      url: current,
      contentType: response.headers.get("content-type") || "",
    };
  }
  throw new Error("Too many redirects from the source.");
}
export function sectionsFromPages(pages) {
  const sections = [];
  for (const page of pages) {
    const text = normalize(page.text);
    let offset = 0;
    while (offset < text.length) {
      let end = Math.min(offset + 1250, text.length);
      if (end < text.length) {
        const sentence = text.lastIndexOf(". ", end);
        const space = text.lastIndexOf(" ", end);
        end =
          sentence > offset + 500 ? sentence + 1 : space > offset ? space : end;
      }
      const passage = text.slice(offset, end).trim();
      if (passage.length >= 40)
        sections.push({
          id: `P${page.number}-${sections.length + 1}`,
          page: page.number,
          text: passage,
        });
      offset = end;
    }
  }
  return sections;
}
export function chooseSections(sections, maxChars = 6500) {
  const rank = (section) => {
    const text = section.text;
    const duties = (text.match(/\bmust\b|\bshall\b|\brequired\b/gi) || [])
      .length;
    const relevant = (
      text.match(
        /kyc|due diligence|verif|identit|customer|risk|launder|screen|record|review|approv|board/gi,
      ) || []
    ).length;
    const contents = /table of contents|\.{4,}/i.test(text);
    return duties * 8 + relevant - (contents ? 100 : 0);
  };
  const chosen = [];
  let size = 0;
  for (const section of [...sections].sort(
    (a, b) => rank(b) - rank(a) || a.page - b.page,
  )) {
    if (size + section.text.length + 40 > maxChars) continue;
    chosen.push(section);
    size += section.text.length + 40;
    if (chosen.length >= 5) break;
  }
  return chosen.sort((a, b) => a.page - b.page || a.id.localeCompare(b.id));
}
export function chooseBriefSections(sections) {
  const candidates = chooseSections(sections);
  const selected = [];
  // Prefer different pages, then fill remaining slots without repeating a passage.
  for (const section of candidates) {
    if (!selected.some((item) => item.page === section.page)) selected.push(section);
    if (selected.length === 3) break;
  }
  for (const section of candidates) {
    if (selected.length === 3) break;
    if (!selected.some((item) => item.id === section.id)) selected.push(section);
  }
  return selected.sort((a, b) => a.page - b.page || a.id.localeCompare(b.id));
}
async function downloadDocument(item, signal) {
  let fetched = await fetchPublic(item.url, signal);
  if (fetched.bytes.subarray(0, 5).toString() !== "%PDF-") {
    const $ = load(fetched.bytes.toString("utf8"));
    const pdfLinks = $("a[href]")
      .toArray()
      .flatMap((element) => {
        try {
          const url = safeSourceUrl($(element).attr("href"), fetched.url);
          return /\.pdf(?:\?|$)/i.test(url)
            ? [{ url, title: $(element).text() }]
            : [];
        } catch {
          return [];
        }
      });
    const mainPdf =
      pdfLinks.find((link) =>
        /policy document|download|english/i.test(link.title),
      ) || (pdfLinks.length === 1 ? pdfLinks[0] : null);
    if (mainPdf) fetched = await fetchPublic(mainPdf.url, signal);
  }
  const pages = [];
  if (fetched.bytes.subarray(0, 5).toString() === "%PDF-") {
    const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const task = getDocument({
      data: new Uint8Array(fetched.bytes),
      isEvalSupported: false,
      useSystemFonts: true,
    });
    const cancel = () => {
      void task.destroy();
    };
    signal.addEventListener("abort", cancel, { once: true });
    try {
      const pdf = await task.promise;
      if (pdf.numPages > 220)
        throw new Error(
          "This document exceeds the 220-page limit. Choose a shorter publication.",
        );
      let length = 0;
      for (let index = 1; index <= pdf.numPages; index++) {
        signal.throwIfAborted();
        const page = await pdf.getPage(index);
        const content = await page.getTextContent();
        const text = content.items
          .map((item) =>
            "str" in item ? item.str + (item.hasEOL ? "\n" : " ") : "",
          )
          .join("");
        length += text.length;
        if (length > 1_200_000)
          throw new Error(
            "The document contains more text than this small app can process.",
          );
        pages.push({ number: index, text });
        page.cleanup();
      }
    } finally {
      signal.removeEventListener("abort", cancel);
      await task.destroy();
    }
  } else {
    const $ = load(fetched.bytes.toString("utf8"));
    $("script,style,nav,header,footer,.navigation,.portlet-topper").remove();
    const article = $(".journal-content-article").first();
    if (!article.length)
      throw new Error(
        "Could not isolate the publication text. Open the BNM source to review it manually.",
      );
    const text = normalize(article.text());
    if (text.length > 80_000)
      throw new Error(
        "This web publication exceeds the supported text limit. Open the original source instead.",
      );
    pages.push({ number: 1, text });
  }
  if (pages.reduce((n, p) => n + p.text.trim().length, 0) < 150)
    throw new Error(
      "No usable text was extracted. Scanned documents need OCR; no AI brief was generated.",
    );
  const textHash = digest(pages.map((p) => normalize(p.text)).join("\n"));
  return {
    textHash,
    rawHash: digest(fetched.bytes),
    url: fetched.url,
    retrievedAt: new Date().toISOString(),
    pages,
    pageCount: pages.length,
    format:
      fetched.bytes.subarray(0, 5).toString() === "%PDF-" ? "PDF" : "Web page",
  };
}
export function catalog() {
  return {
    sourceUrl: SOURCE_URL,
    items: [...state.items].sort((a, b) =>
      b.publishedAt.localeCompare(a.publishedAt),
    ),
    lastScan: state.lastScan,
  };
}
export function chatKnowledgeSnapshot() {
  return { ...catalog(), documents: state.items.filter((item) => state.documents[item.id]).map((item) => documentView(item.id)) };
}

// Compare short mandatory excerpts, not multi-duty page chunks. The surrounding
// page remains available: these excerpts never stand for a complete legal review.
export function comparisonPassages(pages) {
  const candidates = [];
  for (const page of pages) {
    const text = normalize(page.text);
    const markers = [...text.matchAll(/\b([SG])\s+(\d+(?:\.\d+)+)\s+/g)];
    if (!markers.length) continue;
    for (let i = 0; i < markers.length; i++) {
      const marker = markers[i];
      if (marker[1] !== "S") continue;
      const paragraph = text
        .slice(marker.index, markers[i + 1]?.index ?? text.length)
        .trim();
      const end = paragraph.search(/[.!?](?=\s+(?:[A-Z]|\d+\s+[A-Z])|$)/);
      if (end < 0) continue;
      const sentence = paragraph.slice(0, end + 1);
      if (
        sentence.length < 80 ||
        sentence.length > 450 ||
        !/\bshall\b|\bmust\b|\brequired\b/i.test(sentence) ||
        /include the following|ensure the following|as follows|shall address[-:]|include:/i.test(
          sentence,
        )
      )
        continue;
      const score =
        (/authentication|identity|identification|verification/i.test(sentence)
          ? 5
          : 0) +
        (/review|revalidate|risk assessment|board approval/i.test(sentence)
          ? 5
          : 0) +
        (/years?|months?|quarter|days?/i.test(sentence) ? 4 : 0) -
        (/money services business/i.test(sentence) ? 5 : 0);
      candidates.push({
        id: `P${page.number}-S${marker[2]}`,
        page: page.number,
        text: sentence,
        score,
      });
    }
  }
  if (candidates.length)
    return candidates
      .sort((a, b) => b.score - a.score || a.page - b.page)
      .slice(0, 3)
      .sort((a, b) => a.page - b.page)
      .map(({ score, ...section }) => section);
  // Formats without BNM's standard/guidance markers retain the bounded passage
  // approach; the interface still explicitly discloses partial coverage.
  return chooseSections(sectionsFromPages(pages), 2200).slice(0, 3);
}
function itemById(id) {
  if (typeof id !== "string") throw new Error("Select a publication first.");
  const item = state.items.find((item) => item.id === id);
  if (!item) throw new Error("Publication not found. Check BNM updates first.");
  return item;
}
export async function scanPublications(signal) {
  const response = await fetchPublic(SOURCE_URL, signal, 4_000_000);
  const incoming = parsePublications(response.bytes.toString("utf8"));
  if (incoming.length < 5)
    throw new Error(
      "BNM’s publication list could not be read reliably. Your saved records are unchanged.",
    );
  const now = new Date().toISOString();
  const baseline = !state.lastScan;
  let items = mergePublications(state.items, incoming, now, baseline);
  const documents = { ...state.documents };
  const errors = [];
  const watched = Object.entries(documents)
    .sort((a, b) => b[1].checkedAt.localeCompare(a[1].checkedAt))
    .slice(0, 5);
  let checked = 0;
  for (const [id, saved] of watched) {
    const item = items.find((item) => item.id === id && item.available);
    if (!item) continue;
    try {
      const latest = await downloadDocument(item, signal);
      checked++;
      if (latest.textHash !== saved.current.textHash) {
        documents[id] = {
          current: latest,
          previous: saved.current,
          checkedAt: now,
        };
        items = items.map((row) =>
          row.id === id ? { ...row, change: "document", changedAt: now } : row,
        );
      } else documents[id] = { ...saved, checkedAt: now };
    } catch (error) {
      signal.throwIfAborted();
      errors.push(`${item.title}: ${error.message}`);
    }
  }
  const lastScan = {
    at: now,
    baseline,
    count: incoming.length,
    newCount: items.filter((item) => item.change === "new").length,
    changedCount: items.filter((item) =>
      ["listing", "document"].includes(item.change),
    ).length,
    relevantCount: items.filter(
      (item) =>
        item.topic === "AML / KYC" &&
        ["new", "listing", "document"].includes(item.change),
    ).length,
    documentsChecked: checked,
    documentsTracked: Object.keys(documents).length,
    errors,
  };
  save({ ...state, items, documents, lastScan });
  return catalog();
}
export async function openDocument(id, signal) {
  const item = itemById(id);
  const current = await downloadDocument(item, signal);
  const saved = state.documents[id];
  const changed = Boolean(saved && current.textHash !== saved.current.textHash);
  const record = {
    current,
    previous: changed ? saved.current : saved?.previous || null,
    checkedAt: current.retrievedAt,
    brief: !changed ? saved?.brief : undefined,
  };
  save({
    ...state,
    documents: { ...state.documents, [id]: record },
    items: state.items.map((row) =>
      changed && row.id === id
        ? { ...row, change: "document", changedAt: current.retrievedAt }
        : row,
    ),
  });
  return documentView(id);
}
export function documentView(id) {
  const item = itemById(id);
  const saved = state.documents[id];
  if (!saved) throw new Error("Read the source document first.");
  const sections = sectionsFromPages(saved.current.pages);
  const previous = saved.previous;
  const changes = previous
    ? saved.current.pages
        .filter(
          (page) =>
            normalize(page.text) !==
            normalize(
              previous.pages.find((p) => p.number === page.number)?.text || "",
            ),
        )
        .map((page) => page.number)
    : [];
  return {
    item,
    ...saved.current,
    checkedAt: saved.checkedAt,
    sections,
    selectedSections: chooseBriefSections(sections),
    pageChanges: pageDifferences(saved.current.pages, previous?.pages || null),
    brief: [3, 4].includes(saved.brief?.schemaVersion) ? saved.brief : null,
    previous: previous
      ? {
          retrievedAt: previous.retrievedAt,
          textHash: previous.textHash,
          pageCount: previous.pageCount,
        }
      : null,
    changedPages: changes,
    removedPages: previous
      ? previous.pages
          .filter(
            (page) =>
              !saved.current.pages.some((p) => p.number === page.number),
          )
          .map((p) => p.number)
      : [],
  };
}
export function rememberBrief(id, brief) {
  const record = state.documents[id];
  if (!record || record.current.textHash !== brief.textHash)
    throw new Error(
      "The source changed. Read it again before generating a brief.",
    );
  save({
    ...state,
    documents: { ...state.documents, [id]: { ...record, brief } },
  });
}
