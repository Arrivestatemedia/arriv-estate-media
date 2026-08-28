// IndexedDB-backed recovery for interview recording segments.
// Each segment blob is saved BEFORE uploading so that if the tab closes
// mid-upload, the blob survives and can be re-uploaded on the next visit.

const DB_NAME = "arriv_interview_recovery";
const STORE = "pending_segments";
const DB_VERSION = 1;

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Persist a segment blob so it can be recovered if the upload is interrupted
 * by the page closing.
 */
export async function savePendingSegment({ roomName, segmentNum, blob, durationSecs, recordedAt }) {
  const db = await openDb();
  const id = `${roomName}::${segmentNum}::${recordedAt}`;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put({ id, roomName, segmentNum, blob, durationSecs, recordedAt });
    tx.oncomplete = () => { db.close(); resolve(id); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

/**
 * Remove a segment after its upload succeeds.
 */
export async function clearPendingSegment(id) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

/**
 * List all pending segments for a given room (used on mount to retry uploads
 * that were interrupted by a tab close).
 */
export async function listPendingSegments(roomName) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => {
      db.close();
      const all = req.result || [];
      resolve(roomName ? all.filter((r) => r.roomName === roomName) : all);
    };
    req.onerror = () => { db.close(); reject(req.error); };
  });
}