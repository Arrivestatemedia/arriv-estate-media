import { createContext, useContext } from "react";

/**
 * True while a real portal screen is being shown inside a Preferred surface.
 *
 * Screens that would normally send the visitor to another page (the booking form's Cancel,
 * for one) close the surface instead, so the member lands back in the workspace they were
 * in with the conversation and the representative still alive — no page reload.
 */
const HostedSurfaceContext = createContext(false);

export const HostedSurfaceProvider = HostedSurfaceContext.Provider;

export const useIsHostedSurface = () => useContext(HostedSurfaceContext);

export default HostedSurfaceContext;