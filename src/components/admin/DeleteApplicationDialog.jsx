import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Trash2 } from "lucide-react";

export default function DeleteApplicationDialog({ open, onOpenChange, appName, onConfirm, deleting }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-600">
            <AlertTriangle className="w-5 h-5" />
            Delete this applicant?
          </DialogTitle>
          <DialogDescription className="pt-2 space-y-2">
            <span className="block font-medium text-[#1A1A1A]">
              You're about to permanently delete the application for{" "}
              <span className="font-semibold">{appName}</span>.
            </span>
            <span className="block">
              This action <strong className="text-red-600">cannot be undone</strong>. All of their application
              details, uploaded samples, status history, and portal updates will be erased forever and cannot be
              recovered.
            </span>
            <span className="block">Are you absolutely sure you want to continue?</span>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={deleting}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={deleting}
            className="bg-red-600 hover:bg-red-700"
          >
            <Trash2 className="w-4 h-4 mr-1" />
            {deleting ? "Deleting..." : "Yes, delete forever"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}