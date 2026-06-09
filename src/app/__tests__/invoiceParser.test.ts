import { describe, expect, it } from "vitest";
import { extractInvoiceFromOcrResult } from "../invoiceParser";

describe("invoiceParser", () => {
  it("extracts invoice metadata and item rows from OCR result data", () => {
    const sampleOcrResult = {
      data: {
        text: `PERFECT SALES\nDISTRIBUTOR & SUPPLIER\n556, Vijay Nagar, Jabalpur (M.P.)\nSr. No. 070   Date 1-6-26\nName The best Choice\nParty GSTIN\nDescription Qty Rate (₹) Amount (₹)\n1 Mix Kit 6 37.00 222.00\n2 Lid Gripper 10 7.00 70.00\n3 Modelling Clay 2 36.00 72.00\n4 Modelling Clay 1 25.00 25.00\n5 Gold Pencil 50 3.65 182.50\n6 Nataraj Colours 15 3.75 56.25\nSubtotal 627.75\nGrand Total 629.00\n`,
        lines: [
          { text: "PERFECT SALES", words: [{ text: "PERFECT", confidence: 95, bbox: { x0: 10, x1: 50 } }, { text: "SALES", confidence: 95, bbox: { x0: 58, x1: 100 } }] },
          { text: "DISTRIBUTOR & SUPPLIER", words: [{ text: "DISTRIBUTOR", confidence: 92, bbox: { x0: 10, x1: 100 } }, { text: "&", confidence: 92, bbox: { x0: 105, x1: 110 } }, { text: "SUPPLIER", confidence: 92, bbox: { x0: 116, x1: 190 } }] },
          { text: "556, Vijay Nagar, Jabalpur (M.P.)", words: [{ text: "556,", confidence: 88, bbox: { x0: 10, x1: 40 } }, { text: "Vijay", confidence: 88, bbox: { x0: 46, x1: 90 } }, { text: "Nagar,", confidence: 88, bbox: { x0: 96, x1: 145 } }, { text: "Jabalpur", confidence: 88, bbox: { x0: 150, x1: 235 } }] },
          { text: "Sr. No. 070   Date 1-6-26", words: [{ text: "Sr.", confidence: 90, bbox: { x0: 10, x1: 28 } }, { text: "No.", confidence: 90, bbox: { x0: 34, x1: 55 } }, { text: "070", confidence: 93, bbox: { x0: 61, x1: 85 } }, { text: "Date", confidence: 93, bbox: { x0: 180, x1: 220 } }, { text: "1-6-26", confidence: 93, bbox: { x0: 226, x1: 295 } }] },
          { text: "Name The best Choice", words: [{ text: "Name", confidence: 89, bbox: { x0: 10, x1: 45 } }, { text: "The", confidence: 89, bbox: { x0: 51, x1: 75 } }, { text: "best", confidence: 89, bbox: { x0: 80, x1: 115 } }, { text: "Choice", confidence: 89, bbox: { x0: 120, x1: 165 } }] },
          { text: "Party GSTIN", words: [{ text: "Party", confidence: 88, bbox: { x0: 10, x1: 55 } }, { text: "GSTIN", confidence: 88, bbox: { x0: 61, x1: 110 } }] },
          { text: "Description Qty Rate (₹) Amount (₹)", words: [{ text: "Description", confidence: 96, bbox: { x0: 10, x1: 140 } }, { text: "Qty", confidence: 95, bbox: { x0: 220, x1: 260 } }, { text: "Rate", confidence: 95, bbox: { x0: 300, x1: 345 } }, { text: "Amount", confidence: 95, bbox: { x0: 420, x1: 500 } }] },
          { text: "1 Mix Kit 6 37.00 222.00", words: [{ text: "1", confidence: 80, bbox: { x0: 10, x1: 20 } }, { text: "Mix", confidence: 85, bbox: { x0: 24, x1: 55 } }, { text: "Kit", confidence: 85, bbox: { x0: 59, x1: 80 } }, { text: "6", confidence: 90, bbox: { x0: 220, x1: 230 } }, { text: "37.00", confidence: 90, bbox: { x0: 300, x1: 345 } }, { text: "222.00", confidence: 90, bbox: { x0: 420, x1: 480 } }] },
          { text: "2 Lid Gripper 10 7.00 70.00", words: [{ text: "2", confidence: 80, bbox: { x0: 10, x1: 18 } }, { text: "Lid", confidence: 85, bbox: { x0: 22, x1: 48 } }, { text: "Gripper", confidence: 85, bbox: { x0: 52, x1: 110 } }, { text: "10", confidence: 90, bbox: { x0: 220, x1: 230 } }, { text: "7.00", confidence: 90, bbox: { x0: 300, x1: 340 } }, { text: "70.00", confidence: 90, bbox: { x0: 420, x1: 460 } }] },
          { text: "3 Modelling Clay 2 36.00 72.00", words: [{ text: "3", confidence: 80, bbox: { x0: 10, x1: 18 } }, { text: "Modelling", confidence: 85, bbox: { x0: 22, x1: 90 } }, { text: "Clay", confidence: 85, bbox: { x0: 94, x1: 130 } }, { text: "2", confidence: 90, bbox: { x0: 220, x1: 228 } }, { text: "36.00", confidence: 90, bbox: { x0: 300, x1: 345 } }, { text: "72.00", confidence: 90, bbox: { x0: 420, x1: 460 } }] },
          { text: "4 Modelling Clay 1 25.00 25.00", words: [{ text: "4", confidence: 80, bbox: { x0: 10, x1: 18 } }, { text: "Modelling", confidence: 85, bbox: { x0: 22, x1: 90 } }, { text: "Clay", confidence: 85, bbox: { x0: 94, x1: 130 } }, { text: "1", confidence: 90, bbox: { x0: 220, x1: 228 } }, { text: "25.00", confidence: 90, bbox: { x0: 300, x1: 345 } }, { text: "25.00", confidence: 90, bbox: { x0: 420, x1: 460 } }] },
          { text: "5 Gold Pencil 50 3.65 182.50", words: [{ text: "5", confidence: 80, bbox: { x0: 10, x1: 18 } }, { text: "Gold", confidence: 85, bbox: { x0: 22, x1: 50 } }, { text: "Pencil", confidence: 85, bbox: { x0: 54, x1: 100 } }, { text: "50", confidence: 90, bbox: { x0: 220, x1: 230 } }, { text: "3.65", confidence: 90, bbox: { x0: 300, x1: 345 } }, { text: "182.50", confidence: 90, bbox: { x0: 420, x1: 490 } }] },
          { text: "6 Nataraj Colours 15 3.75 56.25", words: [{ text: "6", confidence: 80, bbox: { x0: 10, x1: 18 } }, { text: "Nataraj", confidence: 85, bbox: { x0: 22, x1: 90 } }, { text: "Colours", confidence: 85, bbox: { x0: 94, x1: 145 } }, { text: "15", confidence: 90, bbox: { x0: 220, x1: 232 } }, { text: "3.75", confidence: 90, bbox: { x0: 300, x1: 345 } }, { text: "56.25", confidence: 90, bbox: { x0: 420, x1: 470 } }] },
          { text: "Subtotal 627.75", words: [{ text: "Subtotal", confidence: 90, bbox: { x0: 300, x1: 390 } }, { text: "627.75", confidence: 90, bbox: { x0: 420, x1: 500 } }] },
          { text: "Grand Total 629.00", words: [{ text: "Grand", confidence: 90, bbox: { x0: 300, x1: 350 } }, { text: "Total", confidence: 90, bbox: { x0: 356, x1: 400 } }, { text: "629.00", confidence: 90, bbox: { x0: 420, x1: 470 } }] },
        ],
      },
    };

    const result = extractInvoiceFromOcrResult(sampleOcrResult as any);

    expect(result.invoice_number).toBe("070");
    expect(result.date).toBe("1-6-26");
    expect(result.supplier_name).toContain("SUPPLIER");
    expect(result.customer_name).toContain("The best Choice");
    expect(result.items).toHaveLength(6);
    expect(result.items[0]).toEqual({
      item_name: "Mix Kit",
      quantity: "6",
      rate: "37.00",
      amount: "222.00",
      confidence: 87,
    });
    expect(result.subtotal).toBe("627.75");
    expect(result.grand_total).toBe("629.00");
    expect(result.confidence).toBeGreaterThanOrEqual(40);
    expect(result.warnings.length).toBe(0);
  });
});
