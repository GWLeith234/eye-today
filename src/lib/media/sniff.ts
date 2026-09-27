import "server-only";

import { imageSize } from "image-size";

export type RasterType = "image/jpeg" | "image/png" | "image/webp" | "image/gif";

export const EXTENSION_FOR: Record<RasterType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

// Identify the image from its bytes. SVG and anything else returns null.
export function sniffRaster(bytes: Uint8Array): RasterType | null {
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.subarray(start, end));
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length >= 8 && png.every((b, i) => bytes[i] === b)) return "image/png";
  if (bytes.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  if (bytes.length >= 6 && (ascii(0, 6) === "GIF87a" || ascii(0, 6) === "GIF89a")) return "image/gif";
  return null;
}

export function readDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  try {
    const { width, height } = imageSize(bytes);
    return width && height ? { width, height } : null;
  } catch {
    return null;
  }
}
