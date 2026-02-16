import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FolderOpen } from "lucide-react";

export default function JobCompletionDialog({ open, onOpenChange, googleDriveFolderUrl }) {
  const handleClose = () => {
    onOpenChange(false);
    setTimeout(() => {
      window.location.reload();
    }, 300);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl">Remember to Upload Your Footage!</DialogTitle>
          <DialogDescription className="text-base pt-2">
            Please remember to upload your footage to Google Drive
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 pt-4">
          {googleDriveFolderUrl ? (
            <Button
              onClick={() => {
                window.open(googleDriveFolderUrl, '_blank');
                handleClose();
              }}
              className="w-full bg-[#B8956A] hover:bg-[#A68559] text-white"
            >
              <FolderOpen className="w-4 h-4 mr-2" />
              Take me to Google Drive
            </Button>
          ) : (
            <p className="text-sm text-red-600">
              Google Drive folder not available. Please contact admin.
            </p>
          )}
          <Button
            onClick={handleClose}
            variant="outline"
            className="w-full"
          >
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}