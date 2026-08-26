import type { FileUIPart } from "ai";

import { CHAT_MAX_IMAGE_CHARS } from "@/lib/chat-limits";

/** iOS camera shots are often HEIC, and the `type` field is sometimes empty. */
export const IMAGE_FILE_ACCEPT = "image/*,.heic,.heif";

const IMAGE_EXT = /\.(?:avif|bmp|gif|heic|heif|jpe?g|png|webp)$/i;

export function isLikelyImageFile(file: File): boolean {
  if (file.type.startsWith("image/")) return true;
  if (!IMAGE_EXT.test(file.name)) return false;
  return !file.type || file.type === "application/octet-stream";
}

export function imageFilesFromList(
  list: FileList | File[] | null | undefined
): File[] {
  if (!list) return [];
  return Array.from(list).filter(isLikelyImageFile);
}

const MAX_EDGE = 2048;
const JPEG_QUALITY = 0.9;
/**
 * Quality steps to walk down, then edge sizes, until the data URL fits the
 * budget. One `toDataURL` at 0.65 was the whole of the previous effort and
 * it was measured against 4.5 million characters, a number the server would
 * never have accepted.
 */
const QUALITY_STEPS = [JPEG_QUALITY, 0.75, 0.6, 0.45];
const EDGE_STEPS = [MAX_EDGE, 1536, 1024, 768];

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });
}

/** Downscale + JPEG-compress for chat (keeps spreadsheets readable). */
export async function fileToImagePart(file: File): Promise<FileUIPart> {
  if (!isLikelyImageFile(file)) {
    throw new Error("Only pictures are supported");
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error(
      "Couldn't read that picture. Try a PNG or JPEG screenshot."
    );
  }
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    // No canvas means no way to compress, so the original goes as it is.
    // It still has to fit, or the server refuses the turn and the reader is
    // told only that their request was too big.
    bitmap.close();
    const url = await readFileAsDataUrl(file);
    if (url.length > CHAT_MAX_IMAGE_CHARS) {
      throw new Error(
        "That image is too big to send. Try a smaller screenshot, or crop it to just the holdings."
      );
    }
    return {
      type: "file",
      mediaType: file.type || "image/png",
      filename: file.name || "image.png",
      url,
    };
  }

  ctx.drawImage(bitmap, 0, 0, width, height);

  // Quality first, because it costs the least legibility, then edge size.
  // A broker screenshot is mostly flat colour and small text, so it gives
  // up a lot to quality before any of the numbers stop being readable.
  let url = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
  for (const quality of QUALITY_STEPS) {
    if (url.length <= CHAT_MAX_IMAGE_CHARS) break;
    url = canvas.toDataURL("image/jpeg", quality);
  }
  for (const edge of EDGE_STEPS.slice(1)) {
    if (url.length <= CHAT_MAX_IMAGE_CHARS) break;
    const scaled = Math.min(1, edge / Math.max(width, height));
    canvas.width = Math.max(1, Math.round(width * scaled));
    canvas.height = Math.max(1, Math.round(height * scaled));
    const rescale = canvas.getContext("2d");
    if (!rescale) break;
    rescale.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    url = canvas.toDataURL("image/jpeg", QUALITY_STEPS[QUALITY_STEPS.length - 1]!);
  }
  // Closed after the loop, not before it: the rescale steps redraw from it.
  bitmap.close();

  return {
    type: "file",
    mediaType: "image/jpeg",
    filename: (file.name || "image").replace(/\.\w+$/, "") + ".jpg",
    url,
  };
}

export async function clipboardImagesToParts(
  items: DataTransferItemList | undefined
): Promise<FileUIPart[]> {
  if (!items?.length) return [];
  const files: File[] = [];
  for (const item of Array.from(items)) {
    if (item.kind !== "file") continue;
    const file = item.getAsFile();
    if (file && isLikelyImageFile(file)) files.push(file);
  }
  return Promise.all(files.map(fileToImagePart));
}
