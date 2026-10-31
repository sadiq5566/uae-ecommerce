"use client";
import dynamic from "next/dynamic";

/** The welcome offer only opens after a delay, so its code and styles are fetched after the page is interactive instead of blocking first paint. */
export const WelcomeModal = dynamic(() => import("./welcome-modal").then((m) => m.WelcomeModal), { ssr: false });
