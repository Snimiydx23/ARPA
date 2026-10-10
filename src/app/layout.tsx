import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/theme-provider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ARPA — AI Assistant",
  description:
    "ARPA — your AI assistant. Ask anything in English, Hindi, or Hinglish. Finance, tax, emails, Excel, coding, studies.",
  keywords: ["ARPA", "AI assistant", "Hinglish chat", "ChatGPT", "India AI"],
  authors: [{ name: "ARPA" }],
  openGraph: {
    title: "ARPA — AI Assistant",
    description: "Ask anything in English, Hindi, or Hinglish.",
    siteName: "ARPA",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "ARPA — AI Assistant",
    description: "Ask anything in English, Hindi, or Hinglish.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
          <Toaster richColors position="top-center" />
        </ThemeProvider>
      </body>
    </html>
  );
}
