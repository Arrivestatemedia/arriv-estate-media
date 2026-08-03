import React from "react";
import { Button } from "@/components/ui/button";
import { AlertCircle, RefreshCw } from "lucide-react";

export default function KhethaIQFallback({ onRetry }) {
  return (
    <div
      className="flex items-center justify-center"
      style={{ minHeight: "calc(100vh - 64px)", background: "#FFFBF5" }}
    >
      <div className="text-center max-w-md p-8">
        <AlertCircle className="w-12 h-12 mx-auto mb-4" style={{ color: "#B8956A" }} />
        <h2
          className="text-xl font-bold mb-2"
          style={{ color: "#1A1A1A", fontFamily: "Georgia, serif" }}
        >
          Khetha IQ Recruiting Services Temporarily Unavailable
        </h2>
        <p className="text-sm mb-6" style={{ color: "rgba(26,26,26,0.6)" }}>
          Arriv Estate Media's other functionality is unaffected. Please try again
          in a moment.
        </p>
        <Button
          onClick={onRetry}
          style={{ backgroundColor: "#1A1A1A", color: "#FFFBF5" }}
        >
          <RefreshCw className="w-4 h-4 mr-2" /> Retry
        </Button>
      </div>
    </div>
  );
}