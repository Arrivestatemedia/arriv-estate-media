import React from "react";
import { Button } from "@/components/ui/button";
import { Film, ArrowRight } from "lucide-react";

// "TURN YOUR MEDIA INTO MORE" commerce section shown after core Estate Media packages.
export default function StudioCommerceSection({ onExplore, onSeePlans }) {
  return (
    <div className="bg-white rounded-lg shadow-lg border-2 border-[#B8956A]/20 overflow-hidden mb-8">
      <div className="p-6 sm:p-8">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-[#B8956A]/15 flex items-center justify-center">
            <Film className="w-5 h-5 text-[#B8956A]" />
          </div>
          <h2 className="text-2xl font-bold text-[#1A1A1A]">
            TURN YOUR MEDIA INTO MORE
          </h2>
        </div>

        <p className="text-lg text-[#1A1A1A]/70 mb-2">
          Your shoot doesn't have to end at delivery.
        </p>
        <p className="text-sm text-[#1A1A1A]/60 mb-6 max-w-2xl">
          Use Arriv Studio to turn your listing photos and video into professional property
          promotions, social content, agent marketing, client education, and training.
        </p>

        <div className="flex flex-col sm:flex-row gap-3">
          <Button
            onClick={onExplore}
            className="bg-[#B8956A] hover:bg-[#A68559] text-white"
          >
            Explore Arriv Studio
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
          <Button
            onClick={onSeePlans}
            variant="outline"
            className="border-[#B8956A]/40 text-[#1A1A1A] hover:bg-[#B8956A]/5"
          >
            See Studio Plans
          </Button>
        </div>
      </div>
    </div>
  );
}