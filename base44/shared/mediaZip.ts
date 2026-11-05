// mediaZip.ts
// Builds a ZIP of delivered media without ever holding the whole archive in memory.
//
// Photographs are already compressed, so entries are stored (no re-compression) — nothing the
// customer downloads is altered, resized or renamed on Drive. Each file is read from Drive one at
// a time and pushed through a streaming ZIP, so a forty-photo package costs one photo of memory
// rather than forty.
//
// Videos are deliberately not zipped: a delivered MP4 is far larger than the archive is worth, and
// the gallery keeps downloading those individually through the existing single-file endpoint.

import { Zip, ZipPassThrough } from "npm:fflate@0.8.2";

const MAX_TOTAL_BYTES = 900 * 1024 * 1024;   // a generous ceiling for a photo package
const MAX_SINGLE_BYTES = 120 * 1024 * 1024;  // one delivered photograph/document

export interface ZipEntry {
  driveFileId: string;
  entryName: string;
}

export class ZipTooLargeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ZipTooLargeError";
  }
}

async function streamDriveFile(authToken: string, fileId: string): Promise<ArrayBuffer> {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${authToken}` },
  });
  if (!res.ok) throw new Error(`A file could not be read from Google Drive (${res.status})`);
  return res.arrayBuffer();
}

/**
 * Returns a Response streaming the ZIP. `entries` are already in the intended order, so the
 * archive's contents and the numbering match the customer's chosen photo order.
 */
export async function buildZipResponse(params: {
  authToken: string;
  entries: ZipEntry[];
  downloadName: string;
  sizes?: Record<string, number | undefined>;
}): Promise<Response> {
  const { authToken, entries, downloadName, sizes } = params;

  if (entries.length === 0) {
    return Response.json({ error: "There is nothing to package" }, { status: 400 });
  }

  const knownTotal = entries.reduce((sum, e) => sum + Number(sizes?.[e.driveFileId] || 0), 0);
  if (knownTotal > MAX_TOTAL_BYTES) {
    throw new ZipTooLargeError(
      "That selection is too large to package in one ZIP. Download the larger items individually instead.",
    );
  }
  for (const entry of entries) {
    const size = Number(sizes?.[entry.driveFileId] || 0);
    if (size > MAX_SINGLE_BYTES) {
      throw new ZipTooLargeError(
        `"${entry.entryName}" is too large to put in a ZIP. Download it individually instead.`,
      );
    }
  }

  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const archive = new Zip((err, chunk, final) => {
        if (err) {
          if (!closed) {
            closed = true;
            controller.error(err);
          }
          return;
        }
        if (chunk) controller.enqueue(chunk);
        if (final && !closed) {
          closed = true;
          controller.close();
        }
      });

      try {
        for (const entry of entries) {
          const bytes = await streamDriveFile(authToken, entry.driveFileId);
          const file = new ZipPassThrough(entry.entryName);
          archive.add(file);
          file.push(new Uint8Array(bytes), true);
        }
        archive.end();
      } catch (err) {
        if (!closed) {
          closed = true;
          controller.error(err as Error);
        }
      }
    },
  });

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${downloadName.replace(/"/g, "")}"`,
      // Streaming means the exact length is not known up front.
      "Cache-Control": "no-store",
    },
  });
}

/** "5830_Norfolk_Chase_Rd_MLS_Photos.zip" */
export function zipNameForAddress(address: string, suffix: string): string {
  const base = String(address || "Arriv")
    .split(",")[0]
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60) || "Arriv";
  return `${base}_${suffix}.zip`;
}