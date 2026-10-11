import React from "react";
import { useBrandedFileUrl } from "@/lib/brandedLinks";

/**
 * A link to a stored file that always points at Arriv's own domain.
 *
 * Pass `download` for a save action: it opens the branded page with the download
 * already under way. While the branded address is being resolved the link is
 * inert, so a Base44 address is never rendered or clicked.
 */
export default function BrandedFileLink({ href, download = false, children, className, ...rest }) {
  const branded = useBrandedFileUrl(href, { download });

  if (!branded) {
    return (
      <span className={className} aria-disabled="true">
        {children}
      </span>
    );
  }

  return (
    <a href={branded} className={className} {...rest}>
      {children}
    </a>
  );
}