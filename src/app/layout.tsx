import type { Metadata } from "next";
import { Inter, Playfair_Display, Roboto_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

const playfair = Playfair_Display({
  variable: "--font-serif",
  subsets: ["latin"],
});

const robotoMono = Roboto_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "LeadHunter | Prospecção B2B",
  description: "Plataforma avançada de Lead Generation B2B. Encontre empresas sem site, com SSL inválido e oportunidades claras para serviços web de alta conversão.",
  icons: {
    icon: '/favicon.ico',
    shortcut: '/favicon.ico',
    apple: '/logo.png',
  },
  alternates: {
    canonical: "https://leadgen-b2b.vercel.app/",
  },
  openGraph: {
    title: "LeadHunter | Prospecção B2B",
    description: "Plataforma avançada de Lead Generation B2B. Encontre empresas sem site, com SSL inválido e oportunidades claras para serviços web de alta conversão.",
    url: "https://leadgen-b2b.vercel.app/",
    type: "website",
    siteName: "LeadHunter",
    images: [
      {
        url: "https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&q=80&w=1200&h=630",
        width: 1200,
        height: 630,
        alt: "Dashboard LeadHunter",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "LeadHunter | Prospecção B2B",
    description: "Plataforma avançada de Lead Generation B2B. Encontre empresas sem site, com SSL inválido e oportunidades claras para serviços web de alta conversão.",
    images: ["https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&q=80&w=1200&h=630"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className="dark">
      <body
        className={`${inter.variable} ${playfair.variable} ${robotoMono.variable} antialiased min-h-screen relative font-sans`}
      >
        {/* Background cinemático full-bleed */}
        <div className="fixed inset-0 z-[-1]">
          <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&q=80&w=2850')] bg-cover bg-center" />
          <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px]" />
        </div>
        {children}
      </body>
    </html>
  );
}
