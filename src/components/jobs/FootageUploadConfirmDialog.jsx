import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CheckCircle } from "lucide-react";

export default function FootageUploadConfirmDialog({ open, onOpenChange, googleDriveFolderUrl: _googleDriveFolderUrl, onConfirm }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl">Have you uploaded all your files?</DialogTitle>
          <DialogDescription className="text-base pt-2">
            Please confirm that you've uploaded all your photos and videos using the upload tool above. Once confirmed, your client will be able to view and download their media.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 pt-4">
          <Button
            onClick={onConfirm}
            className="w-full bg-green-600 hover:bg-green-700 text-white"
          >
            <CheckCircle className="w-4 h-4 mr-2" />
            Yes, I've uploaded everything
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}