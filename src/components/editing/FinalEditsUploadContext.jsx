import React, { createContext, useContext, useCallback, useState } from "react";
import { base44 } from "@/api/base44Client";

const FinalEditsUploadContext = createContext(null);

/**
 * Holds background final-edits upload state keyed by task id, so an upload
 * keeps running (and its status stays visible) even after the modal closes.
 */
export function FinalEditsUploadProvider({ children }) {
  // uploads[taskId] = { status, progress, results, error, fileNames, folderUrl, startedAt, completedAt }
  const [uploads, setUploads] = useState({});

  const startUpload = useCallback(async (task, files, onComplete) => {
    const taskId = task.id;
    setUploads((prev) => ({
      ...prev,
      [taskId]: {
        status: "preparing",
        progress: { done: 0, total: files.length },
        results: [],
        error: null,
        fileNames: files.map((f) => f.name),
        folderUrl: null,
        startedAt: new Date().toISOString(),
        completedAt: null,
      },
    }));

    try {
      // 1. Upload each file to public storage (parallel, with progress)
      const uploadedFiles = await Promise.all(
        files.map(async (file) => {
          const uploadRes = await base44.integrations.Core.UploadPublicFile({ file });
          const file_url = uploadRes?.file_url || uploadRes?.data?.file_url;
          if (!file_url) throw new Error(`Failed to upload ${file.name} to storage`);
          setUploads((prev) => ({
            ...prev,
            [taskId]: {
              ...prev[taskId],
              progress: { ...prev[taskId].progress, done: prev[taskId].progress.done + 1 },
            },
          }));
          return {
            file_url,
            file_name: file.name,
            content_type: file.type || "application/octet-stream",
          };
        })
      );

      // 2. Batch AI-classify + upload to Google Drive
      setUploads((prev) => ({ ...prev, [taskId]: { ...prev[taskId], status: "uploading" } }));
      const res = await base44.functions.invoke("uploadFinalEditsBatch", {
        task_id: taskId,
        files: uploadedFiles,
      });
      const resData = res?.data || res;
      if (!resData?.success) throw new Error(resData?.error || "Batch upload failed");

      const folderUrl = resData.folder_url || null;
      setUploads((prev) => ({
        ...prev,
        [taskId]: {
          ...prev[taskId],
          status: "done",
          results: resData.results || [],
          folderUrl,
          completedAt: new Date().toISOString(),
        },
      }));
      if (onComplete) onComplete(folderUrl);
      return folderUrl;
    } catch (err) {
      setUploads((prev) => ({
        ...prev,
        [taskId]: { ...prev[taskId], status: "error", error: err.message || err.error || "Upload failed" },
      }));
      throw err;
    }
  }, []);

  const clearUpload = useCallback((taskId) => {
    setUploads((prev) => {
      const next = { ...prev };
      delete next[taskId];
      return next;
    });
  }, []);

  return (
    <FinalEditsUploadContext.Provider value={{ uploads, startUpload, clearUpload }}>
      {children}
    </FinalEditsUploadContext.Provider>
  );
}

export function useFinalEditsUpload() {
  return useContext(FinalEditsUploadContext);
}