import { lazy } from "react";

/**
 * Every destination inside the Preferred experience, rendered as a floating surface.
 * The screens themselves are the real portal screens — nothing is re-implemented.
 */

const ClientBookings = lazy(() => import("@/pages/ClientBookings"));
const PropertyLeads = lazy(() => import("@/pages/PropertyLeads"));
const BookingPage = lazy(() => import("@/pages/BookingPage"));
const PropertyPageBuilder = lazy(() => import("@/pages/PropertyPageBuilder"));
const VisibilityDashboard = lazy(() => import("@/pages/VisibilityDashboard"));
const PublicAccountSettings = lazy(() => import("@/pages/PublicAccountSettings"));
const ClientJobGallery = lazy(() => import("@/pages/ClientJobGallery"));

export const SURFACES = {
  dashboard: {
    title: "Your Dashboard",
    caption: "Bookings, galleries and everything waiting on you",
    Component: ClientBookings,
  },
  galleries: {
    title: "Galleries",
    caption: "Your delivered shoots, downloads and favourites",
    Component: ClientBookings,
  },
  properties: {
    title: "My Properties",
    caption: "Every listing page you have started or published",
    Component: PropertyLeads,
  },
  booking: {
    title: "Book a Shoot",
    caption: "Choose a package, a date and a time",
    Component: BookingPage,
  },
  marketing: {
    title: "Marketing Growth",
    caption: "Property pages, packages and promotion",
    Component: PropertyPageBuilder,
  },
  analytics: {
    title: "Analytics",
    caption: "How your property pages are being seen",
    Component: VisibilityDashboard,
    hash: "#visibility",
  },
  billing: {
    title: "Invoices & Billing",
    caption: "Receipts, open invoices and prepaid credit",
    Component: VisibilityDashboard,
    hash: "#invoices",
  },
  membership: {
    title: "Membership",
    caption: "Your Arriv Preferred plan and status",
    Component: VisibilityDashboard,
    hash: "#membership",
  },
  jobGallery: {
    title: "Your Gallery",
    caption: "The full set from your shoot",
    Component: ClientJobGallery,
  },
  account: {
    title: "Account Settings",
    caption: "Your details, sign-in and preferences",
    Component: PublicAccountSettings,
  },
};