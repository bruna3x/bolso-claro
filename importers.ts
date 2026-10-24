export interface ImportRow {
  date: string;
  amountCents: number;
  description: string;
  memo?: string;
  fitId?: string;
  sourceLine: number;
}

type CsvRecord = {
  fields: string[];
  sourceLine: number;
};

type CsvColumns = {
  date: number;
  amount: number;
  description: number;
  memo: number;
  fitId: number;
  amountAlternates: number[];
};

const DATE_HEADER_WORDS = [
  "data",
  "date",
  "dt",
  "posted",
  "postdate",
  "transactiondate",
  "effectivedate",
  "datamovimento",
  "datatransacao",
  "datatransaction",
  "lancamento",
];

const AMOUNT_HEADER_WORDS = [
  "amount",
  "amountcents",
  "valor",
  "value",
  "quantia",
  "importe",
  "total",
  "transactionamount",
  "valortransacao",
  "saldo",
];

const DEBIT_HEADER_WORDS = ["debit", "debito", "debitos", "withdrawal", "saque"];
const CREDIT_HEADER_WORDS = ["credit", "credito", "creditos", "deposit", "deposito"];
const DESCRIPTION_HEADER_WORDS = [
  "description",
  "descricao",
  "descr",
  "historico",
  "history",
  "lancamento",
  "detalhe",
  "details",
  "title",
  "merchant",
  "payee",
  "beneficiario",
  "estabelecimento",
  "name",
];
const MEMO_HEADER_WORDS = ["memo", "observacao", "observacoes", "observation", "complemento", "complement", "notes", "nota"];
const FIT_ID_HEADER_WORDS = ["fitid", "fit", "transactionid", "transactionidentifier", "idtransacao", "idtransaction", "id"];

function stripDiacritics(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function normalizeHeader(value: string): string {
  return stripDiacritics(value.replace(/^\uFEFF/, "").trim().toLocaleLowerCase()).replace(/[^a-z0-9]+/g, "");
}

function normalizeText(value: string): string {
  return decodeEntities(value).replace(/\s+/g, " ").trim();
}

function decodeEntities(value: string): string {
  return value
    .replace(/&#(\d+);/g, (_match, digits: string) => {
      const codePoint = Number.parseInt(digits, 10);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : _match;
    })
    .replace(/&#x([\da-f]+);/gi, (_match, digits: string) => {
      const codePoint = Number.parseInt(digits, 16);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : _match;
    })
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&");
}

function validDate(year: number, month: number, day: number): string | null {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day) || year < 1 || month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null;
  }
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseDate(value: string): string | null {
  const text = normalizeText(value).replace(/^(?:date|data)\s*[:=]\s*/i, "");
  if (!text) {
    return null;
  }

  const compactOfx = text.match(/^(\d{4})(\d{2})(\d{2})/);
  if (compactOfx) {
    return validDate(Number(compactOfx[1]), Number(compactOfx[2]), Number(compactOfx[3]));
  }

  const iso = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (iso) {
    return validDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  }

  const separated = text.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (separated) {
    const first = Number(separated[1]);
    const second = Number(separated[2]);
    let year = Number(separated[3]);
    if (year < 100) {
      year += year >= 70 ? 1900 : 2000;
    }
    // Banking exports in this locale conventionally use day/month/year.
    return validDate(year, second, first);
  }

  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) {
    return validDate(parsed.getFullYear(), parsed.getMonth() + 1, parsed.getDate());
  }
  return null;
}

function roundCents(integerPart: string, fractionPart: string): number {
  const whole = integerPart ? Number.parseInt(integerPart, 10) : 0;
  let cents = fractionPart.length > 0 ? Number.parseInt(fractionPart.slice(0, 2).padEnd(2, "0"), 10) : 0;
  if (fractionPart.length > 2 && Number.parseInt(fractionPart[2], 10) >= 5) {
    cents += 1;
  }
  return whole * 100 + cents;
}

/** Converts a localized currency value to signed integer cents. */
export function parseLocalizedAmount(value: string | number | null | undefined): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? Math.round(value * 100) : null;
  }
  if (value === null || value === undefined) {
    return null;
  }

  let text = decodeEntities(String(value)).trim();
  if (!text) {
    return null;
  }

  let negative = /^\s*\(/.test(text) || /(?:^|\s)-/.test(text) || /-\s*$/.test(text);
  if (/\b(?:DR|D)\s*\.?\s*$/i.test(text)) {
    negative = true;
  }
  text = text.replace(/[()]/g, "").replace(/[\u2212]/g, "-");
  text = text.replace(/\b(?:CR|C|DR|D)\s*\.?\s*$/gi, "");
  text = text.replace(/[^\d,\.\-+]/g, "");
  if (!/\d/.test(text)) {
    return null;
  }

  if (text.includes("-")) {
    negative = true;
  }
  const digitsAndSeparators = text.replace(/[+-]/g, "");
  const lastComma = digitsAndSeparators.lastIndexOf(",");
  const lastDot = digitsAndSeparators.lastIndexOf(".");
  const separatorIndex = Math.max(lastComma, lastDot);
  let integerPart: string;
  let fractionPart = "";

  if (separatorIndex >= 0) {
    const digitsAfter = digitsAndSeparators.length - separatorIndex - 1;
    const hasDecimalSeparator = digitsAfter >= 1 && digitsAfter <= 2;
    if (hasDecimalSeparator) {
      integerPart = digitsAndSeparators.slice(0, separatorIndex).replace(/[,.]/g, "");
      fractionPart = digitsAndSeparators.slice(separatorIndex + 1).replace(/[,.]/g, "");
    } else {
      integerPart = digitsAndSeparators.replace(/[,.]/g, "");
    }
  } else {
    integerPart = digitsAndSeparators;
  }

  integerPart = integerPart.replace(/\D/g, "");
  fractionPart = fractionPart.replace(/\D/g, "");
  if (!integerPart && !fractionPart) {
    return null;
  }
  const cents = roundCents(integerPart, fractionPart);
  return negative ? -cents : cents;
}

function countDelimiter(text: string, delimiter: string): number {
  let count = 0;
  let inQuotes = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (inQuotes && text[index + 1] === '"') {
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (character === delimiter && !inQuotes) {
      count += 1;
    } else if ((character === "\n" || character === "\r") && !inQuotes) {
      break;
    }
  }
  return count;
}

function detectDelimiter(text: string): string {
  const firstContent = text.split(/\r?\n/, 1)[0] ?? "";
  const candidates = [",", ";", "\t"];
  let selected = ",";
  let highest = 0;
  for (const candidate of candidates) {
    const count = countDelimiter(firstContent, candidate);
    if (count > highest) {
      selected = candidate;
      highest = count;
    }
  }
  return selected;
}

function parseDelimitedRecords(text: string, delimiter: string): CsvRecord[] {
  const records: CsvRecord[] = [];
  const fields: string[] = [];
  let field = "";
  let inQuotes = false;
  let line = 1;
  let recordLine = 1;

  const pushRecord = (): void => {
    fields.push(field);
    field = "";
    if (fields.some((item) => item.trim() !== "")) {
      records.push({ fields: fields.splice(0, fields.length), sourceLine: recordLine });
    } else {
      fields.length = 0;
    }
    recordLine = line;
  };

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (inQuotes && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (character === delimiter && !inQuotes) {
      fields.push(field);
      field = "";
    } else if (character === "\n" || character === "\r") {
      if (inQuotes) {
        field += character;
        line += 1;
        if (character === "\r" && text[index + 1] === "\n") {
          field += "\n";
          index += 1;
        }
      } else {
        if (character === "\r" && text[index + 1] === "\n") {
          index += 1;
        }
        line += 1;
        pushRecord();
      }
    } else {
      field += character;
    }
  }

  if (field.length > 0 || fields.length > 0) {
    pushRecord();
  }
  return records;
}

function hasHeaderWord(value: string, words: string[]): boolean {
  return words.some((word) => value === word || value.includes(word));
}

function detectCsvColumns(headers: string[]): { columns: CsvColumns; hasHeader: boolean } {
  const normalized = headers.map(normalizeHeader);
  const date = normalized.findIndex((value) => hasHeaderWord(value, DATE_HEADER_WORDS));
  const description = normalized.findIndex((value) => hasHeaderWord(value, DESCRIPTION_HEADER_WORDS));
  const memo = normalized.findIndex((value) => hasHeaderWord(value, MEMO_HEADER_WORDS));
  const fitId = normalized.findIndex((value) => hasHeaderWord(value, FIT_ID_HEADER_WORDS));
  const amountIndexes = normalized.reduce<number[]>((indexes, value, index) => {
    if (hasHeaderWord(value, AMOUNT_HEADER_WORDS) || hasHeaderWord(value, DEBIT_HEADER_WORDS) || hasHeaderWord(value, CREDIT_HEADER_WORDS)) {
      indexes.push(index);
    }
    return indexes;
  }, []);

  const hasHeader = date >= 0 || description >= 0 || memo >= 0 || fitId >= 0 || amountIndexes.length > 0;
  const fallbackAmount = amountIndexes[0] ?? (headers.length > 1 ? 1 : 0);
  const fallbackDescription = description >= 0 ? description : headers.length > 2 ? 2 : -1;
  return {
    hasHeader,
    columns: {
      date: date >= 0 ? date : 0,
      amount: fallbackAmount,
      description: fallbackDescription,
      memo,
      fitId,
      amountAlternates: amountIndexes.slice(1),
    },
  };
}

function fieldAt(fields: string[], index: number): string {
  return index >= 0 && index < fields.length ? normalizeText(fields[index]) : "";
}

function csvRow(record: CsvRecord, columns: CsvColumns): ImportRow | null {
  const date = parseDate(fieldAt(record.fields, columns.date));
  if (!date) {
    return null;
  }

  let amountCents = parseLocalizedAmount(fieldAt(record.fields, columns.amount));
  if (amountCents === null) {
    for (const alternate of columns.amountAlternates) {
      amountCents = parseLocalizedAmount(fieldAt(record.fields, alternate));
      if (amountCents !== null) {
        break;
      }
    }
  }
  if (amountCents === null) {
    return null;
  }

  const description = fieldAt(record.fields, columns.description);
  const memo = fieldAt(record.fields, columns.memo);
  const fitId = fieldAt(record.fields, columns.fitId);
  const row: ImportRow = {
    date,
    amountCents,
    description,
    sourceLine: record.sourceLine,
  };
  if (memo && memo !== description) {
    row.memo = memo;
  }
  if (fitId) {
    row.fitId = fitId;
  }
  return row;
}

export function parseCsv(text: string): ImportRow[] {
  const input = text.replace(/^\uFEFF/, "");
  if (!input.trim()) {
    return [];
  }
  const records = parseDelimitedRecords(input, detectDelimiter(input));
  if (records.length === 0) {
    return [];
  }
  const detected = detectCsvColumns(records[0].fields);
  const dataRecords = detected.hasHeader ? records.slice(1) : records;
  return dataRecords.flatMap((record) => {
    const row = csvRow(record, detected.columns);
    return row ? [row] : [];
  });
}

function getOfxTag(block: string, tag: string): string {
  const escapedTag = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`<\\s*(?:[a-z][\\w.-]*:)?${escapedTag}\\b[^>]*>\\s*([^<]+?)(?=<|$)`, "i");
  const match = block.match(pattern);
  return match ? normalizeText(match[1]) : "";
}

function lineNumberAt(text: string, index: number): number {
  let line = 1;
  for (let position = 0; position < index; position += 1) {
    if (text[position] === "\n") {
      line += 1;
    }
  }
  return line;
}

function ofxTransactionBlocks(text: string): Array<{ block: string; sourceLine: number }> {
  const starts = Array.from(text.matchAll(/<\s*(?:[a-z][\w.-]*:)?STMTTRN\b[^>]*>/gi));
  return starts.map((match, index) => {
    const start = (match.index ?? 0) + match[0].length;
    const end = index + 1 < starts.length ? (starts[index + 1].index ?? text.length) : text.length;
    const block = text.slice(start, end).replace(/<\s*\/\s*(?:[a-z][\w.-]*:)?STMTTRN\s*>/gi, "");
    return { block, sourceLine: lineNumberAt(text, match.index ?? 0) };
  });
}

export function parseOfx(text: string): ImportRow[] {
  if (!text.trim()) {
    return [];
  }
  return ofxTransactionBlocks(text).flatMap(({ block, sourceLine }) => {
    const date = parseDate(getOfxTag(block, "DTPOSTED"));
    const amountCents = parseLocalizedAmount(getOfxTag(block, "TRNAMT"));
    if (!date || amountCents === null) {
      return [];
    }

    const name = getOfxTag(block, "NAME");
    const memo = getOfxTag(block, "MEMO");
    const fitId = getOfxTag(block, "FITID");
    const row: ImportRow = {
      date,
      amountCents,
      description: name || memo,
      sourceLine,
    };
    if (memo && memo !== row.description) {
      row.memo = memo;
    }
    if (fitId) {
      row.fitId = fitId;
    }
    return [row];
  });
}

function normalizedDescription(value: string): string {
  return stripDiacritics(value)
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function duplicateKey(row: { date: string; amountCents: number; description: string }): string {
  const date = parseDate(row.date) ?? normalizeText(row.date);
  return `${date}\u001f${row.amountCents}\u001f${normalizedDescription(row.description)}`;
}

export function findDuplicates(
  imported: ImportRow[],
  existing: { date: string; amountCents: number; description: string }[],
): { unique: ImportRow[]; duplicates: ImportRow[] } {
  const seen = new Set(existing.map(duplicateKey));
  const unique: ImportRow[] = [];
  const duplicates: ImportRow[] = [];

  for (const row of imported) {
    const key = duplicateKey(row);
    if (seen.has(key)) {
      duplicates.push(row);
    } else {
      seen.add(key);
      unique.push(row);
    }
  }
  return { unique, duplicates };
}
