// Kept separate from the Zod schemas so client components don't pull Zod into their bundles.
export const EMIRATES = ["abu-dhabi", "dubai", "sharjah", "ajman", "umm-al-quwain", "ras-al-khaimah", "fujairah"] as const;
export type Emirate = (typeof EMIRATES)[number];
