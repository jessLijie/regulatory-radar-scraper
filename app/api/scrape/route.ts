const BNM_ORIGIN = "https://www.bnm.gov.my";

const SOURCES = [
  {
    id: "banking",
    name: "Banking & Islamic Banking",
    url: `${BNM_ORIGIN}/banking-islamic-banking`,
  },
  {
    id: "legislation",
    name: "Legislation",
    url: `${BNM_ORIGIN}/legislation`,
  },
  {
    id: "enforcement",
    name: "Enforcement Actions",
    url: `${BNM_ORIGIN}/enforcement-actions-regulatees`,
  },
  {
    id: "directory",
    name: "Financial Service Provider Directory",
    url: `${BNM_ORIGIN}/regulations/fsp-directory`,
  },
] as const;

type RegulatoryItem = {
  id: string;
  title: string;
  source: string;
  sourceUrl: string;
  documentUrl: string;
  date: string | null;
  dateLabel: string;
  type: string;
  summary: string;
  domains: string[];
  relevance: "high" | "medium" | "watch";
  reason: string;
};

type SourceStatus = {
  id: string;
  name: string;
  url: string;
  ok: boolean;
  count: number;
  message: string;
};

type Entity = {
  name: string;
  url: string;
  licences: string[];
};

type PageContent = {
  content: string;
  format: "html" | "markdown";
  retrieval: "direct" | "public-relay" | "public-reader";
};

function decodeHtml(value: string) {
  const named: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    hellip: "…",
    laquo: "«",
    ldquo: "“",
    lsquo: "‘",
    lt: "<",
    nbsp: " ",
    quot: '"',
    raquo: "»",
    rdquo: "”",
    rsquo: "’",
    ndash: "–",
    mdash: "—",
  };

  return value
    .replace(/&([a-z]+);/gi, (match, entity: string) => named[entity.toLowerCase()] ?? match)
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(parseInt(code, 16)));
}

function textFromHtml(value: string) {
  return decodeHtml(
    value
      .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/\s+/g, " ")
    .trim();
}

function truncate(value: string, length = 260) {
  const clean = value.replace(/\s+/g, " ").trim();
  return clean.length <= length ? clean : `${clean.slice(0, length - 1).trim()}…`;
}

function absoluteUrl(value: string | undefined, fallback: string) {
  if (!value) return fallback;
  try {
    const parsed = new URL(decodeHtml(value), BNM_ORIGIN);
    if (parsed.hostname === "www-bnm-gov-my.translate.goog") {
      const original = new URL(`${BNM_ORIGIN}${parsed.pathname}`);
      parsed.searchParams.forEach((parameterValue, parameterName) => {
        if (!parameterName.startsWith("_x_tr_")) original.searchParams.set(parameterName, parameterValue);
      });
      return original.toString();
    }
    return parsed.hostname === "www.bnm.gov.my" || parsed.hostname === "bnm.gov.my"
      ? parsed.toString()
      : fallback;
  } catch {
    return fallback;
  }
}

function anchorsFromHtml(value: string, fallback: string) {
  const links: Array<{ href: string; label: string }> = [];
  const pattern = /<a\b[^>]*href\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(value))) {
    const label = textFromHtml(match[3]);
    if (label) links.push({ href: absoluteUrl(match[2], fallback), label });
  }
  return links;
}

function linksFromMarkdown(value: string, fallback: string) {
  const links: Array<{ href: string; label: string }> = [];
  const pattern = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(value))) {
    const label = match[1].replace(/^!/, "").replace(/[_*`]/g, "").trim();
    if (label) links.push({ href: absoluteUrl(match[2], fallback), label });
  }
  return links;
}

function textFromMarkdown(value: string) {
  return decodeHtml(value)
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[#>*_`|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const MONTHS: Record<string, number> = {
  jan: 0,
  january: 0,
  feb: 1,
  february: 1,
  mar: 2,
  march: 2,
  apr: 3,
  april: 3,
  may: 4,
  jun: 5,
  june: 5,
  jul: 6,
  july: 6,
  aug: 7,
  august: 7,
  sep: 8,
  sept: 8,
  september: 8,
  oct: 9,
  october: 9,
  nov: 10,
  november: 10,
  dec: 11,
  december: 11,
};

function isoDate(day: number, month: string, year: number) {
  const monthNumber = MONTHS[month.toLowerCase()];
  if (monthNumber === undefined || year < 1990 || year > 2100) return null;
  return new Date(Date.UTC(year, monthNumber, Math.max(1, day))).toISOString().slice(0, 10);
}

function datesFromText(value: string) {
  const dates: Array<{ iso: string; label: string }> = [];
  const dayPattern = /\b(\d{1,2})\s+(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(20\d{2})\b/gi;
  let match: RegExpExecArray | null;
  while ((match = dayPattern.exec(value))) {
    const iso = isoDate(Number(match[1]), match[2], Number(match[3]));
    if (iso) dates.push({ iso, label: match[0] });
  }

  if (!dates.length) {
    const monthPattern = /\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(20\d{2})\b/gi;
    while ((match = monthPattern.exec(value))) {
      const iso = isoDate(1, match[1], Number(match[2]));
      if (iso) dates.push({ iso, label: match[0] });
    }
  }

  return dates.sort((a, b) => b.iso.localeCompare(a.iso));
}

function scoreItem(title: string, summary: string) {
  const text = `${title} ${summary}`.toLowerCase();
  const rules: Array<[string, RegExp]> = [
    ["Cybersecurity", /cyber|technology risk|security|operational resilience|rmit|cloud|data breach/],
    ["AML/CFT", /aml|anti-money|money laundering|terroris|proliferation|sanction|suspicious transaction/],
    ["KYC & Conduct", /kyc|customer due diligence|consumer|market conduct|fair treatment|complaint/],
    ["Islamic Banking", /islamic|shariah|takaful|sukuk/],
    ["Payments", /payment|fund transfer|interoperab|merchant|e-money|remittance/],
    ["Prudential", /capital|liquidity|credit risk|stress test|recovery plan|prudential|exposure/],
    ["Governance", /governance|accountab|director|outsourc|audit|control function/],
    ["Enforcement", /enforcement|penalty|compound|breach|non-compliance/],
  ];
  const domains = rules.filter(([, rule]) => rule.test(text)).map(([name]) => name);
  if (!domains.length) domains.push("Regulatory Watch");

  const maybankSpecific = /maybank|malayan banking/.test(text);
  const actionLanguage = /must|required|effective|deadline|penalty|breach|non-compliance/.test(text);
  const relevance: RegulatoryItem["relevance"] = maybankSpecific || (domains.length >= 2 && actionLanguage)
    ? "high"
    : domains[0] === "Regulatory Watch"
      ? "watch"
      : "medium";
  const reason = maybankSpecific
    ? "A monitored institution is named in the source record."
    : domains[0] === "Regulatory Watch"
      ? "Broad regulatory item; route to Compliance for applicability review."
      : `Potential impact detected in ${domains.slice(0, 2).join(" and ")}.`;
  return { domains, relevance, reason };
}

function makeItem(input: Omit<RegulatoryItem, "domains" | "relevance" | "reason">): RegulatoryItem {
  return { ...input, ...scoreItem(input.title, input.summary) };
}

function rowsFromHtml(html: string) {
  return html.match(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi) ?? [];
}

function cellsFromRow(row: string) {
  return [...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((match) => match[1]);
}

function parseBanking(html: string, sourceUrl: string) {
  const items: RegulatoryItem[] = [];
  for (const row of rowsFromHtml(html)) {
    const cells = cellsFromRow(row);
    if (cells.length < 3) continue;
    const links = anchorsFromHtml(cells[1], sourceUrl);
    if (!links.length) continue;
    const publishedDates = datesFromText(textFromHtml(cells[0]));
    const allDates = datesFromText(textFromHtml(row));
    const currentDate = allDates[0] ?? publishedDates[0];
    if (!currentDate) continue;
    const title = links[0].label;
    const type = textFromHtml(cells[2]) || "Policy document";
    const wasUpdated = publishedDates[0] && currentDate.iso > publishedDates[0].iso;
    const summary = wasUpdated
      ? `BNM lists linked material updated on ${currentDate.label}; originally issued ${publishedDates[0].label}.`
      : `${type} listed by BNM on ${currentDate.label}.`;
    items.push(makeItem({
      id: `banking-${currentDate.iso}-${title}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 110),
      title,
      source: "Banking & Islamic Banking",
      sourceUrl,
      documentUrl: links[0].href,
      date: currentDate.iso,
      dateLabel: currentDate.label,
      type: wasUpdated ? "Document update" : type,
      summary,
    }));
  }
  return items;
}

function parseBankingMarkdown(markdown: string, sourceUrl: string) {
  const items: RegulatoryItem[] = [];
  for (const line of markdown.split(/\r?\n/)) {
    if (!line.trim().startsWith("|") || /^\|\s*(Date|-)/i.test(line)) continue;
    const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
    if (cells.length < 3) continue;
    const links = linksFromMarkdown(cells[1], sourceUrl);
    const publishedDates = datesFromText(textFromMarkdown(cells[0]));
    const allDates = datesFromText(textFromMarkdown(line));
    const currentDate = allDates[0] ?? publishedDates[0];
    if (!links.length || !currentDate) continue;
    const title = links[0].label;
    const type = textFromMarkdown(cells[2]) || "Policy document";
    const wasUpdated = Boolean(publishedDates[0] && currentDate.iso > publishedDates[0].iso);
    const summary = wasUpdated
      ? `BNM lists linked material updated on ${currentDate.label}; originally issued ${publishedDates[0].label}.`
      : `${type} listed by BNM on ${currentDate.label}.`;
    items.push(makeItem({
      id: `banking-${currentDate.iso}-${title}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 110),
      title,
      source: "Banking & Islamic Banking",
      sourceUrl,
      documentUrl: links[0].href,
      date: currentDate.iso,
      dateLabel: currentDate.label,
      type: wasUpdated ? "Document update" : type,
      summary,
    }));
  }
  return items;
}

function parseLegislation(html: string, sourceUrl: string) {
  const items: RegulatoryItem[] = [];
  const pattern = /<h3\b[^>]*>([\s\S]*?)<\/h3>([\s\S]*?)(?=<h3\b|<hr\b|$)/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html))) {
    const title = textFromHtml(match[1]);
    if (!title || /legislation/i.test(title) && title.length < 20) continue;
    const blockText = textFromHtml(match[2]);
    const dates = datesFromText(blockText);
    const currentDate = dates[0];
    const links = anchorsFromHtml(match[2], sourceUrl);
    items.push(makeItem({
      id: `legislation-${title}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 110),
      title,
      source: "Legislation",
      sourceUrl,
      documentUrl: links[0]?.href ?? sourceUrl,
      date: currentDate?.iso ?? null,
      dateLabel: currentDate?.label ?? "No amendment date shown",
      type: "Legislation",
      summary: truncate(blockText || "Primary legislation listed by BNM."),
    }));
  }
  return items;
}

function parseLegislationMarkdown(markdown: string, sourceUrl: string) {
  const items: RegulatoryItem[] = [];
  const headings = [...markdown.matchAll(/^###\s+(.+)$/gmi)];
  headings.forEach((heading, index) => {
    if (heading.index === undefined) return;
    const blockStart = heading.index + heading[0].length;
    const blockEnd = headings[index + 1]?.index ?? markdown.length;
    const block = markdown.slice(blockStart, blockEnd);
    const headingLinks = linksFromMarkdown(heading[1], sourceUrl);
    const title = headingLinks[0]?.label ?? textFromMarkdown(heading[1]);
    if (!title || !/Act\b/i.test(title)) return;
    const blockText = textFromMarkdown(block);
    const currentDate = datesFromText(blockText)[0];
    const links = linksFromMarkdown(block, sourceUrl);
    const document = links.find((link) => link.href !== sourceUrl && !/legislation\/?$/i.test(link.href));
    items.push(makeItem({
      id: `legislation-${title}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 110),
      title,
      source: "Legislation",
      sourceUrl,
      documentUrl: document?.href ?? headingLinks[0]?.href ?? sourceUrl,
      date: currentDate?.iso ?? null,
      dateLabel: currentDate?.label ?? "No amendment date shown",
      type: "Legislation",
      summary: truncate(blockText || "Primary legislation listed by BNM."),
    }));
  });
  return items;
}

function parseEnforcement(html: string, sourceUrl: string) {
  const items: RegulatoryItem[] = [];
  let carriedDate: { iso: string; label: string } | undefined;
  for (const row of rowsFromHtml(html)) {
    const cells = cellsFromRow(row);
    if (cells.length < 5) continue;
    const rowText = textFromHtml(row);
    if (/date of action taken/i.test(rowText)) continue;
    const firstCellDates = datesFromText(textFromHtml(cells[0]));
    const hasDateColumn = Boolean(firstCellDates.length);
    if (hasDateColumn) carriedDate = firstCellDates[0];
    if (!carriedDate) continue;
    const offset = hasDateColumn ? 1 : 0;
    const institution = textFromHtml(cells[offset]);
    if (!institution) continue;
    const provision = textFromHtml(cells[offset + 2] ?? "");
    const nature = textFromHtml(cells[offset + 3] ?? "");
    const action = textFromHtml(cells[offset + 4] ?? "");
    const links = anchorsFromHtml(row, sourceUrl);
    const summary = truncate([nature, provision && `Provision: ${provision}.`, action && `Action: ${action}.`].filter(Boolean).join(" "));
    items.push(makeItem({
      id: `enforcement-${carriedDate.iso}-${institution}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 110),
      title: `Enforcement action — ${institution}`,
      source: "Enforcement Actions",
      sourceUrl,
      documentUrl: links.at(-1)?.href ?? sourceUrl,
      date: carriedDate.iso,
      dateLabel: carriedDate.label,
      type: "Enforcement action",
      summary: summary || "Enforcement action published by BNM.",
    }));
  }
  return items;
}

function parseEnforcementMarkdown(markdown: string, sourceUrl: string) {
  const items: RegulatoryItem[] = [];
  const dateStart = /^(?:(?:\d{1,2}\s+)?(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+20\d{2})(?:\s*[–-]\s*(?:(?:\d{1,2}\s+)?(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+20\d{2}))?/gmi;
  const starts = [...markdown.matchAll(dateStart)];
  starts.forEach((start, index) => {
    if (start.index === undefined) return;
    const end = starts[index + 1]?.index ?? markdown.length;
    const segment = markdown.slice(start.index, end).trim();
    const currentDate = datesFromText(start[0])[0];
    if (!currentDate) return;
    const afterDate = segment.slice(start[0].length).trim();
    const boundary = afterDate.search(/\b(?:Section|Paragraph|Part)\b|\bS\d{1,3}\s*\(/i);
    const institution = textFromMarkdown(boundary > 2 ? afterDate.slice(0, boundary) : afterDate.slice(0, 120))
      .replace(/\s+/g, " ")
      .trim();
    if (!institution || institution.length > 180) return;
    const links = linksFromMarkdown(segment, sourceUrl);
    const publicNotice = links.find((link) => /P\.N\.|eapn/i.test(`${link.label} ${link.href}`));
    const summary = truncate(textFromMarkdown(afterDate).replace(institution, "").trim());
    items.push(makeItem({
      id: `enforcement-${currentDate.iso}-${institution}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 110),
      title: `Enforcement action — ${institution}`,
      source: "Enforcement Actions",
      sourceUrl,
      documentUrl: publicNotice?.href ?? sourceUrl,
      date: currentDate.iso,
      dateLabel: currentDate.label,
      type: "Enforcement action",
      summary: summary || "Enforcement action published by BNM.",
    }));
  });
  return items;
}

function parseDirectory(html: string, sourceUrl: string) {
  const entities: Entity[] = [];
  for (const row of rowsFromHtml(html)) {
    const cells = cellsFromRow(row);
    if (cells.length < 3) continue;
    const links = anchorsFromHtml(cells[1], sourceUrl);
    const name = links[0]?.label ?? textFromHtml(cells[1]);
    if (!/(maybank|malayan banking)/i.test(name)) continue;
    const licences = [...cells[2].matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)]
      .map((match) => textFromHtml(match[1]))
      .filter(Boolean);
    entities.push({ name, url: links[0]?.href ?? sourceUrl, licences });
  }
  return entities;
}

function parseDirectoryMarkdown(markdown: string, sourceUrl: string) {
  const entities: Entity[] = [];
  for (const line of markdown.split(/\r?\n/)) {
    if (!line.trim().startsWith("|")) continue;
    const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
    if (cells.length < 3) continue;
    const links = linksFromMarkdown(cells[1], sourceUrl);
    const name = links[0]?.label ?? textFromMarkdown(cells[1]);
    if (!/(maybank|malayan banking)/i.test(name)) continue;
    const licences = cells[2].split("*").map((value) => textFromMarkdown(value)).filter(Boolean);
    entities.push({ name, url: links[0]?.href ?? sourceUrl, licences });
  }
  return entities;
}

async function fetchWithTimeout(url: string, headers: Record<string, string>) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 22_000);
  try {
    const response = await fetch(url, {
      headers,
      redirect: "follow",
      signal: controller.signal,
      cache: "no-store",
    });
    const content = await response.text();
    return { response, content };
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchPage(url: string): Promise<PageContent> {
  let directFailure = "Direct request failed";
  try {
    const { response, content } = await fetchWithTimeout(url, {
      Accept: "text/html,application/xhtml+xml",
      "User-Agent": "Regulatory-Radar/1.0 (on-demand compliance prototype)",
    });
    if (response.ok && content.length >= 500 && content.length <= 3_000_000) {
      return { content, format: "html", retrieval: "direct" };
    }
    directFailure = response.ok ? "BNM returned an invalid page" : `BNM returned HTTP ${response.status}`;
  } catch (error) {
    directFailure = error instanceof Error ? error.message : directFailure;
  }

  const original = new URL(url);
  const relayUrl = new URL(`https://www-bnm-gov-my.translate.goog${original.pathname}`);
  original.searchParams.forEach((parameterValue, parameterName) => relayUrl.searchParams.set(parameterName, parameterValue));
  relayUrl.searchParams.set("_x_tr_sl", "ms");
  relayUrl.searchParams.set("_x_tr_tl", "en");
  relayUrl.searchParams.set("_x_tr_hl", "en");
  let relayFailure = "web relay request failed";
  try {
    const { response, content } = await fetchWithTimeout(relayUrl.toString(), {
      Accept: "text/html,application/xhtml+xml",
      "User-Agent": "Mozilla/5.0 (compatible; Regulatory-Radar/1.0)",
    });
    if (!response.ok) throw new Error(`web relay returned HTTP ${response.status}`);
    if (content.length < 500 || content.length > 3_000_000) throw new Error("web relay returned an invalid page");
    return { content, format: "html", retrieval: "public-relay" };
  } catch (error) {
    relayFailure = error instanceof Error ? error.message : relayFailure;
  }

  const readerUrl = `https://r.jina.ai/http://${new URL(url).host}${new URL(url).pathname}${new URL(url).search}`;
  try {
    const { response, content } = await fetchWithTimeout(readerUrl, {
      Accept: "text/plain",
      "User-Agent": "Regulatory-Radar/1.0 (public BNM page reader fallback)",
    });
    if (!response.ok) throw new Error(`reader returned HTTP ${response.status}`);
    if (content.length < 500 || content.length > 3_000_000) throw new Error("reader returned an invalid page");
    return { content, format: "markdown", retrieval: "public-reader" };
  } catch (error) {
    const readerFailure = error instanceof Error ? error.message : "reader request failed";
    throw new Error(`${directFailure}; ${relayFailure}; reader ${readerFailure}`);
  }
}

export async function POST() {
  const statuses: SourceStatus[] = [];
  const items: RegulatoryItem[] = [];
  const entities: Entity[] = [];

  const results = await Promise.allSettled(SOURCES.map(async (source) => {
    const page = await fetchPage(source.url);
    if (source.id === "banking") {
      const parsed = page.format === "html" ? parseBanking(page.content, source.url) : parseBankingMarkdown(page.content, source.url);
      return { source, items: parsed, entities: [] as Entity[], retrieval: page.retrieval };
    }
    if (source.id === "legislation") {
      const parsed = page.format === "html" ? parseLegislation(page.content, source.url) : parseLegislationMarkdown(page.content, source.url);
      return { source, items: parsed, entities: [] as Entity[], retrieval: page.retrieval };
    }
    if (source.id === "enforcement") {
      const parsed = page.format === "html" ? parseEnforcement(page.content, source.url) : parseEnforcementMarkdown(page.content, source.url);
      return { source, items: parsed, entities: [] as Entity[], retrieval: page.retrieval };
    }
    const parsed = page.format === "html" ? parseDirectory(page.content, source.url) : parseDirectoryMarkdown(page.content, source.url);
    return { source, items: [] as RegulatoryItem[], entities: parsed, retrieval: page.retrieval };
  }));

  results.forEach((result, index) => {
    const source = SOURCES[index];
    if (result.status === "fulfilled") {
      items.push(...result.value.items);
      entities.push(...result.value.entities);
      const count = result.value.items.length || result.value.entities.length;
      statuses.push({
        id: source.id,
        name: source.name,
        url: source.url,
        ok: true,
        count,
        message: count
          ? `${count} records extracted${result.value.retrieval === "direct" ? " directly" : " via web relay"}`
          : `Page reached${result.value.retrieval === "direct" ? " directly" : " via web relay"}; no matching records found`,
      });
    } else {
      const message = result.reason instanceof Error ? result.reason.message : "The source could not be read";
      statuses.push({ id: source.id, name: source.name, url: source.url, ok: false, count: 0, message });
    }
  });

  const deduplicated = [...new Map(items.map((item) => [item.id, item])).values()]
    .sort((a, b) => (b.date ?? "0000-00-00").localeCompare(a.date ?? "0000-00-00"))
    .slice(0, 40);

  const successfulSources = statuses.filter((source) => source.ok).length;
  const payload = {
    scannedAt: new Date().toISOString(),
    definition: "Latest is ordered by the most recent publication, amendment, linked-document update, or enforcement-action date shown by BNM.",
    items: deduplicated,
    entities,
    sources: statuses,
    warning: "Automated extraction and relevance tagging support triage only. Auditors must verify applicability and obligations against the linked BNM source.",
  };

  return Response.json(payload, {
    status: successfulSources ? 200 : 502,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
