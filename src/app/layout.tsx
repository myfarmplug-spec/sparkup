import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "icreate.africa — Show Your Spark",
  description: "Upload your spark. Share your ideas, creations, and passions with Africa. Inspire millions.",
  icons: {
    icon: [
      { url: "/icon.jpg", type: "image/jpeg", sizes: "1024x1024" },
    ],
    shortcut: "/icon.jpg",
    apple: [
      { url: "/apple-touch-icon.jpg", sizes: "1024x1024", type: "image/jpeg" },
    ],
    other: [
      { rel: "apple-touch-icon", url: "/apple-touch-icon.jpg" },
    ],
  },
  manifest: "/manifest.json",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
