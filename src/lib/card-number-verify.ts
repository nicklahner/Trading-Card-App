/**
 * Card number verification via back-photo crop + local OCR cross-check.
 *
 * The vision model often misreads small card numbers (off-by-one digit).
 * This module:
 * 1. Crops the top-left region of the back photo (where card numbers live)
 * 2. Runs tesseract OCR on the crop
 * 3. Extracts anything that looks like a card number from the OCR text
 * 4. If the model's read and OCR agree → verified
 * 5. If they disagree → flagged as unverified with both readings
 */

import sharp from 'sharp';
import Tesseract from 'tesseract.js';

export interface CardNumberVerification {
  /** The model's reading. */
  modelValue: string | null;
  /** OCR reading from the cropped back photo. */
  ocrValue: string | null;
  /** Whether they agree. */
  verified: boolean;
  /** Flag to surface in review when they disagree. */
  flag: string | null;
  /** The best value to use (model if verified, null if disagreement). */
  bestValue: string | null;
  /** The crop as a data URL for showing in review. */
  cropDataUrl: string | null;
}

/**
 * Crop the top-left region of the back photo where card numbers appear.
 * On Topps Flagship backs, the number is in the top-left corner.
 */
async function cropCardNumberRegion(backBuffer: Buffer): Promise<Buffer> {
  const meta = await sharp(backBuffer).metadata();
  const w = meta.width ?? 1;
  const h = meta.height ?? 1;

  // Card number is typically in the top-left ~25% width, top ~15% height
  const cropW = Math.round(w * 0.30);
  const cropH = Math.round(h * 0.18);

  return sharp(backBuffer)
    .extract({ left: 0, top: 0, width: cropW, height: cropH })
    .resize({ width: 600, fit: 'inside', withoutEnlargement: false })
    .sharpen()
    .jpeg({ quality: 95 })
    .toBuffer();
}

/**
 * Extract card-number-like strings from OCR text.
 * Card numbers look like: "398", "91TR-30", "BTP-25", "TP-2", "#103"
 */
function extractCardNumbers(ocrText: string): string[] {
  // Match patterns: digits, or alphanumeric-dash sequences
  const patterns = ocrText.match(/\b[A-Z0-9]+-[A-Z0-9]+\b|\b#?\d{1,4}\b/gi) ?? [];
  return patterns
    .map((p) => p.replace(/^#/, '').trim())
    .filter((p) => p.length > 0 && p.length < 15);
}

function normalizeCardNumber(v: string): string {
  return v.replace(/^#/, '').trim().toLowerCase();
}

/**
 * Verify the model's card number reading against OCR on a cropped back photo.
 */
export async function verifyCardNumber(
  backBuffer: Buffer,
  modelCardNumber: string | null,
): Promise<CardNumberVerification> {
  if (!modelCardNumber) {
    // Model didn't read anything — try OCR alone
    try {
      const crop = await cropCardNumberRegion(backBuffer);
      const worker = await Tesseract.createWorker('eng');
      const result = await worker.recognize(crop, {}, { text: true });
      await worker.terminate();

      const numbers = extractCardNumbers(result.data.text);
      const cropUrl = `data:image/jpeg;base64,${crop.toString('base64')}`;

      if (numbers.length > 0) {
        return {
          modelValue: null,
          ocrValue: numbers[0],
          verified: false,
          flag: 'card_number_ocr_only',
          bestValue: numbers[0],
          cropDataUrl: cropUrl,
        };
      }

      return {
        modelValue: null,
        ocrValue: null,
        verified: false,
        flag: 'card_number_unreadable',
        bestValue: null,
        cropDataUrl: cropUrl,
      };
    } catch {
      return {
        modelValue: null,
        ocrValue: null,
        verified: false,
        flag: 'card_number_unreadable',
        bestValue: null,
        cropDataUrl: null,
      };
    }
  }

  try {
    const crop = await cropCardNumberRegion(backBuffer);
    const worker = await Tesseract.createWorker('eng');
    const result = await worker.recognize(crop, {}, { text: true });
    await worker.terminate();

    const numbers = extractCardNumbers(result.data.text);
    const cropUrl = `data:image/jpeg;base64,${crop.toString('base64')}`;

    if (numbers.length === 0) {
      // OCR found nothing — model reading is unverified
      return {
        modelValue: modelCardNumber,
        ocrValue: null,
        verified: false,
        flag: 'card_number_unverified',
        bestValue: modelCardNumber,
        cropDataUrl: cropUrl,
      };
    }

    // Check if any OCR number matches the model's reading
    const normalizedModel = normalizeCardNumber(modelCardNumber);
    const match = numbers.find(
      (n) => normalizeCardNumber(n) === normalizedModel,
    );

    if (match) {
      return {
        modelValue: modelCardNumber,
        ocrValue: match,
        verified: true,
        flag: null,
        bestValue: modelCardNumber,
        cropDataUrl: cropUrl,
      };
    }

    // Disagreement — flag it
    return {
      modelValue: modelCardNumber,
      ocrValue: numbers[0],
      verified: false,
      flag: 'card_number_mismatch',
      bestValue: null, // Don't pick one — let the user decide
      cropDataUrl: cropUrl,
    };
  } catch {
    return {
      modelValue: modelCardNumber,
      ocrValue: null,
      verified: false,
      flag: 'card_number_unverified',
      bestValue: modelCardNumber,
      cropDataUrl: null,
    };
  }
}
