/** Arcade data served by our backend (sourced from nearcade, maimai DX shops only). */

export interface ArcadeMachine {
  version: string;
  quantity: number;
  cost: string;
  comment: string;
}

export interface Arcade {
  id: number;
  name: string;
  /** Region names below country level plus the detailed address. */
  address: string;
  /** Kilometres from the query point, when known. */
  distance: number | null;
  /** [longitude, latitude] as nearcade stores them (GCJ-02 inside mainland China). */
  coordinates: [number, number] | null;
  isOpen: boolean | null;
  /** One entry for "every day", otherwise Monday..Sunday; null = closed that day. */
  openingHours: ([string, string] | null)[];
  machines: ArcadeMachine[];
  /** Players currently reported at the shop, if anyone reported. */
  attendance: number | null;
  comment: string;
  updatedAt: string | null;
}

export interface ArcadeRegion {
  id: string;
  label: string;
  hasChildren: boolean;
}
