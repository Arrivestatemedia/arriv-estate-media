import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FolderOpen } from "lucide-react";

export default function JobCompletionDialog({ open, onOpenChange, googleDriveFolderUrl: _googleDriveFolderUrl }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl">Upload Your Footage in the App</DialogTitle>
          <DialogDescription className="text-base pt-2">
            Please upload your photos and videos directly in the Arriv app.
            You'll find the upload tool on your completed job card — no need to
            use Google Drive separately.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 pt-4">
          <Button
            onClick={() => onOpenChange(false)}
            className="w-full bg-[#B8956A] hover:bg-[#A68559] text-white"
          >
            <FolderOpen className="w-4 h-4 mr-2" />
            Got it — Take me to the upload tool
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}