export const TOPICS = ["complaint", "refund", "exchange", "order", "other"] as const;
export type Topic = (typeof TOPICS)[number];
