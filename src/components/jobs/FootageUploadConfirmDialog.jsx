import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FolderOpen, CheckCircle } from "lucide-react";

export default function FootageUploadConfirmDialog({ open, onOpenChange, googleDriveFolderUrl, onConfirm }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl">Are you sure you uploaded your footage?</DialogTitle>
          <DialogDescription className="text-base pt-2">
            Please confirm that you've uploaded all footage to Google Drive
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 pt-4">
          <Button
            onClick={onConfirm}
            className="w-full bg-green-600 hover:bg-green-700 text-white"
          >
            <CheckCircle className="w-4 h-4 mr-2" />
            Confirm
          </Button>
          {googleDriveFolderUrl && (
            <Button
              onClick={() => window.open(googleDriveFolderUrl, '_blank')}
              variant="outline"
              className="w-full border-[#B8956A] text-[#B8956A] hover:bg-[#B8956A]/10"
            >
              <FolderOpen className="w-4 h-4 mr-2" />
              Take me to Google Drive
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}