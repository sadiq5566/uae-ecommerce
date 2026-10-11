// Money helpers. All checkout math runs in integer fils (1 AED = 100 fils) to avoid float drift.
export const toFils = (aed: number) => Math.round(aed * 100);
export const fromFils = (fils: number) => fils / 100;
/** fils * (percent/100), rounded half up to whole fils. */
export const percentOf = (fils: number, percent: number) => Math.round((fils * percent) / 100);
