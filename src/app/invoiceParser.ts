import { recognize } from "tesseract.js";

export interface InvoiceItem {
  item_name: string | null;
  quantity: string | null;
  rate: string | null;
  amount: string | null;
  confidence: number;
}

export interface InvoiceExtractionResult {
  invoice_number: string | null;
  date: string | null;
  supplier_name: string | null;
  customer_name: string | null;
  items: InvoiceItem[];
  subtotal: string | null;
  grand_total: string | null;
  raw_text: string;
  confidence: number;
  warnings: string[];
}

const MIN_ROW_CONFIDENCE = 40;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const createCanvas = (width: number, height: number): HTMLCanvasElement => {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
};

const loadFileToCanvas = async (file: File | Blob): Promise<HTMLCanvasElement> => {
  if (file.type === "application/pdf" || (file instanceof File && file.name.toLowerCase().endsWith(".pdf"))) {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf");
    await ensurePdfWorker(pdfjs.GlobalWorkerOptions);
    const url = URL.createObjectURL(file);
    const loadingTask = pdfjs.getDocument({ url });
    const doc = await loadingTask.promise;
    const page = await doc.getPage(1);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = createCanvas(Math.floor(viewport.width), Math.floor(viewport.height));
    const ctx = canvas.getContext("2d")!;
    await page.render({ canvasContext: ctx, viewport }).promise;
    URL.revokeObjectURL(url);
    return canvas;
  }

  const bitmap = await createImageBitmap(file);
  const canvas = createCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close?.();
  return canvas;
};

const getGrayScale = (canvas: HTMLCanvasElement) => {
  const ctx = canvas.getContext("2d");
  if (!ctx) return new Uint8ClampedArray();
  const { width, height } = canvas;
  const data = ctx.getImageData(0, 0, width, height).data;
  const gray = new Uint8ClampedArray(width * height);
  for (let i = 0, j = 0; i < data.length; i += 4, ++j) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    gray[j] = Math.round(r * 0.299 + g * 0.587 + b * 0.114);
  }
  return gray;
};

const putGrayScale = (canvas: HTMLCanvasElement, gray: Uint8ClampedArray) => {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const { width, height } = canvas;
  const output = ctx.createImageData(width, height);
  for (let i = 0, j = 0; i < output.data.length; i += 4, ++j) {
    const value = gray[j];
    output.data[i] = output.data[i + 1] = output.data[i + 2] = value;
    output.data[i + 3] = 255;
  }
  ctx.putImageData(output, 0, 0);
};

const adjustContrast = (gray: Uint8ClampedArray, contrast = 1.2) => {
  const output = new Uint8ClampedArray(gray.length);
  for (let i = 0; i < gray.length; i++) {
    const value = (gray[i] - 128) * contrast + 128;
    output[i] = clamp(Math.round(value), 0, 255);
  }
  return output;
};

const blurGray = (gray: Uint8ClampedArray, width: number, height: number) => {
  const out = new Uint8ClampedArray(gray.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let total = 0;
      let count = 0;
      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          const nx = x + ox;
          const ny = y + oy;
          if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
            total += gray[ny * width + nx];
            count += 1;
          }
        }
      }
      out[y * width + x] = Math.round(total / count);
    }
  }
  return out;
};

const adaptiveThreshold = (gray: Uint8ClampedArray, width: number, height: number, blockSize = 15, c = 10) => {
  const out = new Uint8ClampedArray(gray.length);
  const halfBlock = Math.floor(blockSize / 2);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      let count = 0;
      const y0 = clamp(y - halfBlock, 0, height - 1);
      const y1 = clamp(y + halfBlock, 0, height - 1);
      const x0 = clamp(x - halfBlock, 0, width - 1);
      const x1 = clamp(x + halfBlock, 0, width - 1);
      for (let yy = y0; yy <= y1; yy++) {
        for (let xx = x0; xx <= x1; xx++) {
          sum += gray[yy * width + xx];
          count += 1;
        }
      }
      const threshold = sum / count - c;
      out[y * width + x] = gray[y * width + x] < threshold ? 0 : 255;
    }
  }
  return out;
};

const estimateSkewAngle = (canvas: HTMLCanvasElement) => {
  const width = canvas.width;
  const height = canvas.height;
  const temp = createCanvas(width, height);
  const ctx = temp.getContext("2d")!;
  let bestScore = -Infinity;
  let bestAngle = 0;
  for (let angle = -5; angle <= 5; angle += 0.5) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.translate(width / 2, height / 2);
    ctx.rotate((angle * Math.PI) / 180);
    ctx.drawImage(canvas, -width / 2, -height / 2);
    const imageData = ctx.getImageData(0, 0, width, height).data;
    const rowCounts = new Float32Array(height);
    let total = 0;
    for (let y = 0; y < height; y++) {
      let count = 0;
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        const luma = Math.round(imageData[idx] * 0.299 + imageData[idx + 1] * 0.587 + imageData[idx + 2] * 0.114);
        if (luma < 180) count += 1;
      }
      rowCounts[y] = count;
      total += count;
    }
    const mean = total / height;
    let variance = 0;
    for (let y = 0; y < height; y++) {
      const diff = rowCounts[y] - mean;
      variance += diff * diff;
    }
    variance /= height;
    if (variance > bestScore) {
      bestScore = variance;
      bestAngle = angle;
    }
  }
  return bestAngle;
};

const deskewCanvas = (canvas: HTMLCanvasElement) => {
  const angle = estimateSkewAngle(canvas);
  if (Math.abs(angle) < 0.25) return canvas;
  const width = canvas.width;
  const height = canvas.height;
  const rotated = createCanvas(width, height);
  const ctx = rotated.getContext("2d")!;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.translate(width / 2, height / 2);
  ctx.rotate((-angle * Math.PI) / 180);
  ctx.drawImage(canvas, -width / 2, -height / 2);
  return rotated;
};

const findCropBounds = (canvas: HTMLCanvasElement) => {
  const ctx = canvas.getContext("2d");
  if (!ctx) return { left: 0, top: 0, right: canvas.width, bottom: canvas.height };
  const { width, height } = canvas;
  const data = ctx.getImageData(0, 0, width, height).data;
  const rowCounts = new Uint32Array(height);
  const colCounts = new Uint32Array(width);
  const threshold = 220;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const luma = Math.round((data[idx] * 0.299 + data[idx + 1] * 0.587 + data[idx + 2] * 0.114));
      if (luma < threshold) {
        rowCounts[y] += 1;
        colCounts[x] += 1;
      }
    }
  }
  const rowThreshold = Math.max(1, Math.floor(width * 0.02));
  const colThreshold = Math.max(1, Math.floor(height * 0.02));
  let top = 0;
  while (top < height && rowCounts[top] < rowThreshold) top += 1;
  let bottom = height - 1;
  while (bottom > top && rowCounts[bottom] < rowThreshold) bottom -= 1;
  let left = 0;
  while (left < width && colCounts[left] < colThreshold) left += 1;
  let right = width - 1;
  while (right > left && colCounts[right] < colThreshold) right -= 1;
  const margin = 16;
  return {
    left: clamp(left - margin, 0, width - 1),
    top: clamp(top - margin, 0, height - 1),
    right: clamp(right + margin, 0, width - 1),
    bottom: clamp(bottom + margin, 0, height - 1),
  };
};

const cropCanvas = (canvas: HTMLCanvasElement) => {
  const bounds = findCropBounds(canvas);
  const width = bounds.right - bounds.left + 1;
  const height = bounds.bottom - bounds.top + 1;
  if (width <= 16 || height <= 16 || width * height < (canvas.width * canvas.height) / 16) {
    return canvas;
  }
  const cropped = createCanvas(width, height);
  const ctx = cropped.getContext("2d")!;
  ctx.drawImage(canvas, bounds.left, bounds.top, width, height, 0, 0, width, height);
  return cropped;
};

const preprocessCanvas = (canvas: HTMLCanvasElement) => {
  const gray = getGrayScale(canvas);
  const blurred = blurGray(gray, canvas.width, canvas.height);
  const contrasted = adjustContrast(blurred, 1.35);
  const thresholded = adaptiveThreshold(contrasted, canvas.width, canvas.height, 17, 12);
  putGrayScale(canvas, thresholded);
  const deskewed = deskewCanvas(canvas);
  return cropCanvas(deskewed);
};

const normalizeNumber = (value: string) => {
  const cleaned = value.replace(/[₹,\s]/g, "").replace(/[^\d.\-]/g, "");
  return cleaned === "" ? null : cleaned;
};

const averageConfidence = (items: { confidence?: number }[]) => {
  if (!items.length) return 0;
  return items.reduce((sum, item) => sum + (item.confidence ?? 0), 0) / items.length;
};

const stripLeadingSerial = (raw: string) => raw.replace(/^[\d]+[\.)]?\s*/, "").trim();
const normalizeText = (text: string) => text.replace(/\s+/g, " ").trim();
const isNoiseText = (text: string) => {
  const lower = text.toLowerCase();
  return /(?:gst|pan|tin|cin|signature|logo|watermark|www\.|http|mailto:|fax|tel|phone|mobile|contact|terms|note|declaration|rupee|bank|branch|invoice|bill|date|page|total\s+qty|order\s+no|po\.?\s?no|eway|transport)/i.test(lower) && !/(?:qty|quantity|rate|amount|description|item)/i.test(lower);
};

const detectField = (
  lines: { text: string; words: any[]; confidence: number }[],
  patterns: RegExp[]
): { value: string | null; confidence: number } => {
  for (const line of lines) {
    if (!line.text) continue;
    const normalized = normalizeText(line.text);
    for (const pattern of patterns) {
      const found = normalized.match(pattern);
      if (found?.[1]) {
        return { value: found[1].trim(), confidence: line.confidence };
      }
    }
  }
  return { value: null, confidence: 0 };
};

const detectInvoiceNumber = (lines: any[]) =>
  detectField(lines, [
    /(?:invoice|bill|sr\.?|s\.r\.?)(?:\s*no\.?|\s*number|\s*#)?\s*[:\-]?\s*([\w\/-]+)/i,
    /(?:invoice|bill|number)\s*[:\-]?\s*([\w\/-]+)/i,
    /sr\.?\s*no\.?\s*[:\-]?\s*([\w\/-]+)/i,
  ]);

const detectDate = (lines: any[]) =>
  detectField(lines, [
    /(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})/,
    /(\d{1,2}\s+[A-Za-z]{3,9}\s+\d{2,4})/,
  ]);

const detectSupplierName = (lines: any[]) => {
  const candidates = lines
    .slice(0, 8)
    .filter((line) => line.text && !isNoiseText(line.text) && line.text.length > 5);
  const supplierLine = candidates.find((line) => /(?:supplier|distributor|traders|stores|enterprises|pvt|ltd|company|agency|mart|shop|solutions)/i.test(line.text)) || candidates[0];
  return { value: supplierLine?.text || null, confidence: supplierLine?.confidence || 0 };
};

const detectCustomerName = (lines: any[]) => {
  const normalizedLines = lines.map((line) => ({ ...line, text: normalizeText(line.text) }));
  const matchLine = normalizedLines.find((line) => /\b(?:bill\s*to|customer|party|to|name)\b\s*[:\-]?\s*(.+)/i.test(line.text));
  if (matchLine) {
    const match = matchLine.text.match(/\b(?:bill\s*to|customer|party|to|name)\b\s*[:\-]?\s*(.+)/i);
    return { value: match?.[1]?.trim() || null, confidence: matchLine.confidence };
  }
  const candidate = normalizedLines.find((line) => /\b(?:name|customer|party)\b\s*[:\-]/i.test(line.text));
  return { value: candidate?.text.replace(/\b(?:name|customer|party)\b\s*[:\-]\s*/i, "").trim() || null, confidence: candidate?.confidence || 0 };
};

const findTotalLine = (lines: string[], pattern: RegExp) => {
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const raw = lines[i];
    if (pattern.test(raw)) {
      const match = raw.match(/([\d,.]+)\s*$/);
      if (match?.[1]) return normalizeNumber(match[1]);
    }
  }
  return null;
};

const parseTableHeader = (lines: any[]) => {
  const headerIndex = lines.findIndex((line) =>
    /(?:description|item|particulars|details)/i.test(line.text) &&
    /(?:qty|quantity)/i.test(line.text) &&
    /(?:rate)/i.test(line.text) &&
    /(?:amount|amt|total)/i.test(line.text)
  );
  if (headerIndex < 0) return null;
  const headerWords = lines[headerIndex].words || [];
  const columns: Record<string, number> = { item: 0, quantity: 0, rate: 0, amount: 0 };
  headerWords.forEach((word: any) => {
    const text = word.text.toLowerCase();
    if (/qty|quantity/.test(text)) columns.quantity = word.bbox.x0;
    else if (/rate/.test(text)) columns.rate = word.bbox.x0;
    else if (/(?:amount|amt|total)/.test(text)) columns.amount = word.bbox.x0;
  });
  return { headerIndex, columns };
};

const assignColumns = (word: any, boundaries: Record<string, number>) => {
  const center = (word.bbox.x0 + word.bbox.x1) / 2;
  if (boundaries.amount && center >= boundaries.amount - 12) return "amount";
  if (boundaries.rate && center >= boundaries.rate - 12) return "rate";
  if (boundaries.quantity && center >= boundaries.quantity - 12) return "quantity";
  return "item";
};

const buildItemsFromLines = (lines: any[], headerIndex: number, boundaries: Record<string, number>) => {
  const items: InvoiceItem[] = [];
  for (let idx = headerIndex + 1; idx < lines.length; idx += 1) {
    const line = lines[idx];
    const words = line.words || [];
    if (!words.length) continue;
    const row: Record<string, any[]> = { item: [], quantity: [], rate: [], amount: [] };
    words.forEach((word: any) => {
      const column = assignColumns(word, boundaries);
      row[column].push(word);
    });
    const itemText = stripLeadingSerial(row.item.map((w) => w.text).join(" ").trim());
    const qtyText = row.quantity.map((w) => w.text).join(" ").trim();
    const rateText = row.rate.map((w) => w.text).join(" ").trim();
    const amountText = row.amount.map((w) => w.text).join(" ").trim();
    const rowConfidence = averageConfidence(words);
    if (rowConfidence < MIN_ROW_CONFIDENCE) continue;
    const quantity = normalizeNumber(qtyText);
    const rate = normalizeNumber(rateText);
    const amount = normalizeNumber(amountText);
    if (!itemText || (!quantity && !rate && !amount)) continue;
    items.push({
      item_name: itemText || null,
      quantity: quantity || null,
      rate: rate || null,
      amount: amount || null,
      confidence: Math.round(rowConfidence),
    });
  }
  return items;
};

const parseFallbackRows = (rawLines: string[]) => {
  const items: InvoiceItem[] = [];
  const rowPattern = /^\s*(?:\d+[\.)]?\s*)?(.+?)\s+(\d+(?:\.\d+)?)\s+([₹\d][\d,.]*)\s+([₹\d][\d,.]*)\s*$/;
  for (const rawLine of rawLines) {
    const line = normalizeText(rawLine);
    if (!line || isNoiseText(line) || /(?:subtotal|grand total|total|gst|tax|amount payable|balance)/i.test(line)) continue;
    const match = line.match(rowPattern);
    if (!match) continue;
    const itemName = stripLeadingSerial(match[1]).trim();
    const quantity = normalizeNumber(match[2]);
    const rate = normalizeNumber(match[3]);
    const amount = normalizeNumber(match[4]);
    if (!itemName || (!quantity && !rate && !amount)) continue;
    items.push({ item_name: itemName, quantity, rate, amount, confidence: 50 });
  }
  return items;
};

export const extractInvoiceFromOcrResult = (result: any): InvoiceExtractionResult => {
  const rawText = (result?.data?.text ?? "").trim();
  const lines = (result?.data?.lines ?? []).map((line: any) => ({
    text: normalizeText(line.text || ""),
    words: line.words ?? [],
    confidence: averageConfidence(line.words ?? []),
  })).filter((line) => line.text.length > 0);

  const allTextLines = rawText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const invoiceNumber = detectInvoiceNumber(lines);
  const date = detectDate(lines);
  const supplier = detectSupplierName(lines);
  const customer = detectCustomerName(lines);
  const header = parseTableHeader(lines);
  const items = header ? buildItemsFromLines(lines, header.headerIndex, header.columns) : parseFallbackRows(allTextLines);
  const subtotal = findTotalLine(allTextLines, /subtotal|sub\s*total/i);
  const grand_total = findTotalLine(allTextLines, /grand\s*total|total\s*payable|amount\s*payable|net\s*total|invoice\s*total/i);
  const itemsConfidence = items.length ? averageConfidence(items) : 0;
  const confidence = Math.round((invoiceNumber.confidence + date.confidence + supplier.confidence + itemsConfidence) / 4);
  const warnings: string[] = [];
  if (!invoiceNumber.value) warnings.push("Invoice number not detected or low confidence.");
  if (!date.value) warnings.push("Invoice date not detected or low confidence.");
  if (!supplier.value) warnings.push("Supplier name not detected or low confidence.");
  if (!items.length) warnings.push("Invoice items were not detected with enough confidence.");

  return {
    invoice_number: invoiceNumber.value,
    date: date.value,
    supplier_name: supplier.value,
    customer_name: customer.value,
    items,
    subtotal: subtotal || null,
    grand_total: grand_total || null,
    raw_text: rawText,
    confidence: clamp(confidence, 0, 100),
    warnings,
  };
};

let pdfWorkerConfigured = false;
const ensurePdfWorker = async (GlobalWorkerOptions: any) => {
  if (pdfWorkerConfigured) return;
  const workerModule = await import("pdfjs-dist/legacy/build/pdf.worker.min.js?url");
  GlobalWorkerOptions.workerSrc = (workerModule as any).default ?? workerModule;
  pdfWorkerConfigured = true;
};

export const extractInvoiceFromFile = async (
  file: File,
  progressCallback?: (message: string) => void
): Promise<InvoiceExtractionResult> => {
  progressCallback?.("Loading invoice document...");
  const sourceCanvas = await loadFileToCanvas(file);
  progressCallback?.("Preprocessing image for clean OCR...");
  const croppedCanvas = preprocessCanvas(sourceCanvas);
  progressCallback?.("Running OCR on scanned invoice...");
  const logger = (m: any) => {
    if (m.status === "recognizing text" && typeof m.progress === "number") {
      progressCallback?.(`OCR ${Math.round(m.progress * 100)}%`);
    }
  };
  const result = await recognize(croppedCanvas, "eng", {
    logger,
    config: {
      tessedit_pageseg_mode: "AUTO",
      preserve_interword_spaces: "1",
    },
  } as any);
  return extractInvoiceFromOcrResult(result);
};
