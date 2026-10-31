/** DX Rating bands, loosely following the in-game rating plate colours. Styled by `.rating-plate.tier-*`. */
export type RatingTier = "rainbow" | "platinum" | "gold" | "silver" | "bronze" | "purple" | "red" | "orange" | "green" | "blue";

export function ratingTier(r: number): RatingTier {
  if (r >= 15000) return "rainbow";
  if (r >= 14500) return "platinum";
  if (r >= 14000) return "gold";
  if (r >= 13000) return "silver";
  if (r >= 12000) return "bronze";
  if (r >= 10000) return "purple";
  if (r >= 7000) return "red";
  if (r >= 4000) return "orange";
  if (r >= 2000) return "green";
  return "blue";
}
