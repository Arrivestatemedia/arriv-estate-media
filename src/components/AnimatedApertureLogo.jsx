import React from "react";
import { motion } from "framer-motion";

const LOGO_URL =
  "https://media.base44.com/images/public/698b3b9e4b7d348873dbf213/4633bb859_AEstateHoldings.png";
const GOLD = "#B8956A";

export default function AnimatedApertureLogo({ size = 280 }) {
  // the iris covers the lens/aperture area of the logo (leaves the outer ring visible)
  const lens = size * 0.86;

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

      {/* lens iris — opens and closes like a shutter over the lens area */}
      <div
        className="absolute inset-0 flex items-center justify-center pointer-events-none"
      >
        <motion.div
          className="rounded-full"
          style={{
            width: lens,
            height: lens,
            backgroundColor: "#1A1A1A",
            border: `1.5px solid ${GOLD}`,
            boxShadow: "inset 0 0 26px rgba(0,0,0,0.65)",
            transformOrigin: "center",
          }}
          animate={{ scale: [0, 0.96, 0.96, 0, 0] }}
          transition={{
            times: [0, 0.12, 0.22, 0.38, 1],
            duration: 4.2,
            repeat: Infinity,
            ease: [0.45, 0, 0.15, 1],
          }}
        />
      </div>

      {/* shutter flash — quick burst when the picture is "taken" */}
      <motion.div
        className="absolute inset-0 rounded-full pointer-events-none"
        style={{ backgroundColor: "#FFFBF5" }}
        animate={{ opacity: [0, 0, 0.5, 0, 0] }}
        transition={{
          times: [0, 0.2, 0.225, 0.27, 1],
          duration: 4.2,
          repeat: Infinity,
        }}
      />
    </div>
  );
}