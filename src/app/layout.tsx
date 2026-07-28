import type { Metadata } from "next";
import {
  Cormorant_Garamond,
  Geist,
  Geist_Mono,
  Marcellus,
  Syne,
} from "next/font/google";
import { AppShell } from "@/components/layout/AppShell";
import { HeroResourceHints } from "@/components/hero/HeroResourceHints";
import { ScrollProgress } from "@/components/layout/ScrollProgress";
import { SmoothScroll } from "@/components/motion/SmoothScroll";
import { Providers } from "@/components/motion/Providers";
import { defaultMetadata, organizationSchema } from "@/lib/seo";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const syne = Syne({
  variable: "--font-syne",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
});

const cormorant = Cormorant_Garamond({
  variable: "--font-cormorant",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
});

const marcellus = Marcellus({
  variable: "--font-marcellus",
  subsets: ["latin"],
  weight: ["400"],
});

export const metadata: Metadata = defaultMetadata;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${syne.variable} ${cormorant.variable} ${marcellus.variable} h-full antialiased`}
    >
      <head>
        <HeroResourceHints />
      </head>
      <body className="min-h-full flex flex-col bg-bg text-fg">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema()) }}
        />
        <Providers>
          <SmoothScroll>
            <AppShell>
              <ScrollProgress />
              <a
                href="#main"
                className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[120] focus:rounded-full focus:bg-fg focus:px-4 focus:py-2 focus:text-bg"
              >
                Skip to content
              </a>
              <main id="main" className="flex-1">
                {children}
              </main>
            </AppShell>
          </SmoothScroll>
        </Providers>
      </body>
    </html>
  );
}
