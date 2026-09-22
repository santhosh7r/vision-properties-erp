import type { Metadata } from "next";
import ErrorMonitor from "@/components/ErrorMonitor";
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
      <body>
        {/* Installs the browser-wide net for uncaught exceptions, unhandled
            promise rejections, failed subresources and failed API calls. Mounted
            here so it covers every page — signed in or not — including the login
            screen and the public feedback form. Renders nothing. */}
        <ErrorMonitor />
        {children}
      </body>
    </html>
  );
}
