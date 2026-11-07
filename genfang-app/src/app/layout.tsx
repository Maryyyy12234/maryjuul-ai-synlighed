import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ServiceWorkerRegister } from "@/components/sw-register";

export const metadata: Metadata = {
  title: { default: "GENFANG", template: "%s · GENFANG" },
  description: "Henvendelser, godkendelser og tilbud.",
  applicationName: "GENFANG",
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: "GENFANG", statusBarStyle: "default" },
  formatDetection: { telephone: false, email: false, address: false },
  icons: {
    icon: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#F3F0E8",
  colorScheme: "light",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="da">
      <body>
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
