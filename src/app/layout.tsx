import type { Metadata } from "next";
import { Manrope, Geist_Mono } from "next/font/google";
import { Providers } from "@/components/providers";
import "./globals.css";

const manrope = Manrope({ variable: "--font-sans", subsets: ["latin"], weight: ["400", "500", "600", "700"] });
const mono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Client Directory",
  description: "Accounting client records, contacts and Gmail activity.",
};

// Before first paint: saved sidebar state, and the saved theme or else the OS preference. Keys are the directory's own.
const INIT = `try{var d=document.documentElement;d.dataset.sidebar=localStorage.getItem("directory.sidebar.collapsed")==="1"?"collapsed":"expanded";var t=localStorage.getItem("directory.theme");d.dataset.theme=t==="light"||t==="dark"?t:(matchMedia("(prefers-color-scheme: light)").matches?"light":"dark")}catch(e){}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${manrope.variable} ${mono.variable} h-full antialiased`} suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: INIT }} /></head>
      <body className="min-h-full">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
