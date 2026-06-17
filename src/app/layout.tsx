import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Vision Properties",
  description: "Plot Booking & Inventory Management Platform",
  icons: {
    icon: "/icon.png",
    shortcut: "/icon.png",
    apple: "/logo-mark.png",
  },
};

// Set the theme before first paint to avoid a flash. Defaults to dark
// (pure black), respecting a stored preference or the OS setting.
const themeScript = `(function(){try{var t=localStorage.getItem('theme');if(t!=='light'&&t!=='dark'){t=window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';}document.documentElement.classList.add(t);}catch(e){document.documentElement.classList.add('dark');}})();`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
