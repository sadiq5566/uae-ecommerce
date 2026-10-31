/** Floating WhatsApp chat button. Set NEXT_PUBLIC_WHATSAPP_NUMBER (country code + number, digits only, e.g. 971501234567); hidden when unset. */
export function WhatsAppButton({ label }: { label: string }) {
  const number = (process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? "").replace(/\D/g, "");
  if (!number) return null;
  return (
    <a
      href={`https://wa.me/${number}`} target="_blank" rel="noopener noreferrer" aria-label={label} title={label}
      className="fixed bottom-5 end-5 z-40 grid size-14 place-items-center rounded-full bg-[#25D366] text-white shadow-lg shadow-black/25 transition hover:scale-110 active:scale-95"
    >
      <svg viewBox="0 0 32 32" width="30" height="30" fill="currentColor" aria-hidden><path d="M16.04 3C9.4 3 4 8.4 4 15.04c0 2.12.55 4.19 1.6 6.01L4 29l8.13-1.57a12.03 12.03 0 0 0 5.9 1.5h.01C24.68 28.93 30 23.6 30 16.96 30 13.75 28.75 10.73 26.5 8.5A11.9 11.9 0 0 0 16.04 3zm0 22.9a10 10 0 0 1-5.1-1.4l-.37-.22-3.76.73.75-3.66-.24-.38a9.97 9.97 0 0 1-1.54-5.33c0-5.52 4.5-10.02 10.03-10.02 2.68 0 5.19 1.04 7.08 2.94a9.95 9.95 0 0 1 2.93 7.09c0 5.53-4.5 10.25-9.78 10.25zm5.5-7.5c-.3-.15-1.78-.88-2.06-.98-.28-.1-.48-.15-.68.15-.2.3-.78.98-.95 1.18-.18.2-.35.22-.65.07-.3-.15-1.27-.47-2.42-1.5a9.1 9.1 0 0 1-1.68-2.08c-.18-.3-.02-.46.13-.61.14-.13.3-.35.45-.52.15-.18.2-.3.3-.5.1-.2.05-.38-.03-.53-.07-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.8.38-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.22 3.08c.15.2 2.1 3.2 5.08 4.49.71.3 1.26.49 1.7.63.71.23 1.36.2 1.88.12.57-.09 1.78-.73 2.03-1.43.25-.7.25-1.3.17-1.43-.07-.12-.27-.2-.57-.35z" /></svg>
    </a>
  );
}
