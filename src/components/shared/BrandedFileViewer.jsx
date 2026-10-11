import React, { useEffect } from "react";
import { Download } from "lucide-react";

const IMAGE = /\.(png|jpe?g|gif|webp|avif|bmp|svg)(\?|$)/i;
const VIDEO = /\.(mp4|webm|mov|m4v|ogv)(\?|$)/i;
const AUDIO = /\.(mp3|wav|m4a|ogg|oga)(\?|$)/i;

/**
 * Saves the file to the visitor's device. The bytes are pulled from storage and
 * saved, so the browser never navigates to the underlying platform address.
 * If the file cannot be pulled, the direct address is used as a last resort.
 */
async function saveFile(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error("unavailable");
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = decodeURIComponent(url.split("/").pop().split("?")[0]) || "download";
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
  } catch {
    window.location.href = url;
  }
}

/** Serves a stored file inside Arriv's own page, so the address bar stays on our domain. */
export default function BrandedFileViewer({ url, download }) {
  useEffect(() => {
    if (download) saveFile(url);
  }, [url, download]);

  if (download) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-[#FFFBF5] px-6 text-center">
        <Download className="w-6 h-6 text-[#B8956A]" />
        <p className="text-sm text-[#1A1A1A]/60">Your download is starting…</p>
        <button onClick={() => saveFile(url)} className="text-sm text-[#B8956A] underline">
          Download again
        </button>
      </div>
    );
  }

  if (IMAGE.test(url)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#1A1A1A] p-4">
        <img src={url} alt="Document" className="max-h-[92vh] max-w-full object-contain" />
      </div>
    );
  }

  if (VIDEO.test(url)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#1A1A1A] p-4">
        <video src={url} controls className="max-h-[92vh] max-w-full" />
      </div>
    );
  }

  if (AUDIO.test(url)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#1A1A1A] p-6">
        <audio src={url} controls className="w-full max-w-xl" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#FFFBF5]">
      <div className="flex justify-end px-4 py-2 border-b border-[#B8956A]/20">
        <button
          onClick={() => saveFile(url)}
          className="flex items-center gap-2 text-sm font-medium text-[#B8956A] hover:underline"
        >
          <Download className="w-4 h-4" /> Download
        </button>
      </div>
      <iframe src={url} title="Document" className="flex-1 w-full" />
    </div>
  );
}