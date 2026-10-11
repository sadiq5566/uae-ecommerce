import Link from "next/link";

export const metadata = { title: "404", robots: { index: false } };

export default function RootNotFound() {
  return (
    <html lang="en"><body style={{ fontFamily: "system-ui, sans-serif", display: "grid", placeItems: "center", minHeight: "100vh", margin: 0, textAlign: "center", padding: 24 }}>
      <div><h1>404</h1><p>Page not found · الصفحة غير موجودة</p><Link href="/">Home · الرئيسية</Link></div>
    </body></html>
  );
}
