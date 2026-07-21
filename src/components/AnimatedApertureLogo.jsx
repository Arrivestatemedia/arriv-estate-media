import React from "react";
import { motion } from "framer-motion";

const LOGO_URL =
  "https://media.base44.com/images/public/698b3b9e4b7d348873dbf213/4633bb859_AEstateHoldings.png";
const GOLD = "#B8956A";

export default function AnimatedApertureLogo({ size = 280 }) {
  return (
    <div className="relative" style={{ width: size, height: size }}>
      {/* soft gold glow behind the logo */}
      <motion.div
        className="absolute inset-0 rounded-full"
        style={{
          background:
            "radial-gradient(circle, rgba(184,149,106,0.28) 0%, rgba(184,149,106,0.08) 55%, rgba(184,149,106,0) 100%)",
        }}
        animate={{ opacity: [0.6, 1, 0.6], scale: [1, 1.06, 1] }}
        transition={{ duration: 4.2, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* the actual logo */}
      <img
        src={LOGO_URL}
        alt="Arriv Estate Media"
        className="absolute inset-0 w-full h-full object-contain"
        draggable={false}
      />

      {/* shutter overlay — closes like a camera aperture then reopens */}
      <motion.div
        className="absolute inset-0 rounded-full pointer-events-none"
        style={{
          backgroundColor: "#1A1A1A",
          border: `2px solid ${GOLD}`,
          transformOrigin: "center",
          boxShadow: `inset 0 0 24px rgba(0,0,0,0.6)`,
        }}
        animate={{ scale: [0, 0.97, 0.97, 0, 0] }}
        transition={{
          times: [0, 0.12, 0.22, 0.38, 1],
          duration: 4.2,
          repeat: Infinity,
          ease: [0.45, 0, 0.15, 1],
        }}
      />

      {/* shutter flash — quick burst when the picture is "taken" */}
      <motion.div
        className="absolute inset-0 rounded-full pointer-events-none"
        style={{ backgroundColor: "#FFFBF5" }}
        animate={{ opacity: [0, 0, 0.55, 0, 0] }}
        transition={{
          times: [0, 0.2, 0.225, 0.27, 1],
          duration: 4.2,
          repeat: Infinity,
        }}
      />
    </div>
  );
}