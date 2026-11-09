// brightServiceArea.ts
// Bright MLS's published service area for the DMV, transcribed jurisdiction by jurisdiction.
//
// Source: Bright MLS, "Our Associations" (https://www.brightmls.com/our-associations, retrieved
// 2026-11-09), which names the participating associations and the jurisdictions each one covers:
//
//   DC — Washington, D.C. (DCAR / GCAAR): the whole district, which is a single jurisdiction.
//   MD — every Maryland county plus Baltimore City, listed explicitly. The state name alone is never
//        used as coverage, so a match is always a real jurisdiction.
//   VA — BRAR: Clarke, Frederick, Warren counties and Winchester City
//        DAAR: Loudoun
//        FAAR: Fredericksburg City, Stafford, Spotsylvania, King George, Orange, Caroline
//        GPR:  Fauquier, Madison, Culpeper, Rappahannock
//        MAR:  Page, Shenandoah
//        NVAR: Alexandria City, Fairfax City, Falls Church City, Fairfax, Arlington
//        PWAR: Manassas City, Manassas Park City, Prince William
//
// Bright also serves Delaware, New Jersey, Pennsylvania and West Virginia. Those states are
// deliberately NOT transcribed: this app publishes DMV properties, so an address there goes to
// administrative review instead of a guessed provider.
//
// Geographic eligibility is not MLS membership. Being inside this area says which MLS serves the
// property; it does not say the customer belongs to that MLS. Membership is only proven by the
// listing itself when Bright accepts the media.

export type MlsJurisdictionKind = "county" | "independent_city" | "district";

export interface MlsJurisdiction {
  /** Two-letter state code. */
  state: string;
  /** County name without the word "County", or the independent city / district name. */
  name: string;
  kind: MlsJurisdictionKind;
}

/** The states whose Bright coverage is transcribed here. */
export const BRIGHT_SERVICE_AREA_STATES = ["DC", "MD", "VA"];

export const BRIGHT_SERVICE_AREA_SOURCE = {
  label: "Bright MLS — Our Associations (published service area)",
  url: "https://www.brightmls.com/our-associations",
  retrieved_at: "2026-11-09",
};

const county = (state: string, name: string): MlsJurisdiction => ({ state, name, kind: "county" });
const city = (state: string, name: string): MlsJurisdiction => ({ state, name, kind: "independent_city" });

export const BRIGHT_DMV_JURISDICTIONS: MlsJurisdiction[] = [
  // Washington, D.C. — one jurisdiction covering the whole district.
  { state: "DC", name: "District of Columbia", kind: "district" },

  // Maryland — all 23 counties plus Baltimore City.
  county("MD", "Allegany"),
  county("MD", "Anne Arundel"),
  county("MD", "Baltimore"),
  city("MD", "Baltimore"),
  county("MD", "Calvert"),
  county("MD", "Caroline"),
  county("MD", "Carroll"),
  county("MD", "Cecil"),
  county("MD", "Charles"),
  county("MD", "Dorchester"),
  county("MD", "Frederick"),
  county("MD", "Garrett"),
  county("MD", "Harford"),
  county("MD", "Howard"),
  county("MD", "Kent"),
  county("MD", "Montgomery"),
  county("MD", "Prince George's"),
  county("MD", "Queen Anne's"),
  county("MD", "St. Mary's"),
  county("MD", "Somerset"),
  county("MD", "Talbot"),
  county("MD", "Washington"),
  county("MD", "Wicomico"),
  county("MD", "Worcester"),

  // Virginia — the full NVAR / DAAR / PWAR / GPR / BRAR / MAR / FAAR list, counties and
  // independent cities together. Virginia's independent cities are separate jurisdictions from the
  // counties that surround them, so each one is listed on its own.
  county("VA", "Arlington"),
  city("VA", "Alexandria"),
  county("VA", "Caroline"),
  county("VA", "Clarke"),
  county("VA", "Culpeper"),
  county("VA", "Fairfax"),
  city("VA", "Fairfax"),
  city("VA", "Falls Church"),
  county("VA", "Fauquier"),
  county("VA", "Frederick"),
  city("VA", "Fredericksburg"),
  county("VA", "King George"),
  county("VA", "Loudoun"),
  county("VA", "Madison"),
  city("VA", "Manassas"),
  city("VA", "Manassas Park"),
  county("VA", "Orange"),
  county("VA", "Page"),
  county("VA", "Prince William"),
  county("VA", "Rappahannock"),
  county("VA", "Shenandoah"),
  county("VA", "Spotsylvania"),
  county("VA", "Stafford"),
  county("VA", "Warren"),
  city("VA", "Winchester"),
];