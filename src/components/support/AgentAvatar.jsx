import React, { useState, useEffect } from "react";

// Renders the canonical agent profile image when available, falling back to
// the colored initial only when no URL exists or the image fails to load.
//
// The canonical URL in state is NEVER replaced by a render-time failure —
// the broken image simply falls back to the initial for this render, and
// the error state resets when the URL changes (e.g. manager transfer).
export default function AgentAvatar({
  avatarUrl,
  avatarInitial = "A",
  className = "",
  fallbackClassName = "",
}) {
  const [imgError, setImgError] = useState(false);

  // Reset error state when the canonical URL changes (e.g. Devon → David).
  useEffect(() => {
    setImgError(false);
  }, [avatarUrl]);

  const showImage = avatarUrl && !imgError;

  return (
    <div
      className={`${className} ${!showImage ? fallbackClassName : ""} rounded-full overflow-hidden`}
    >
      {showImage ? (
        <img
          src={avatarUrl}
          alt=""
          className="w-full h-full object-cover"
          onError={() => setImgError(true)}
        />
      ) : (
        <span className="leading-none">{avatarInitial}</span>
      )}
    </div>
  );
}

