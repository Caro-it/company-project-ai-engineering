import type { Metadata } from "next";
import { EMPRESA } from "@/lib/nexova";
import "./globals.css";

export const metadata: Metadata = {
  title: `Backoffice — ${EMPRESA.nombreCompleto}`,
  description: `Panel interno de ${EMPRESA.nombreCompleto} para los equipos de operaciones.`,
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // suppressHydrationWarning: algunas extensiones del navegador añaden atributos a <html> y <body>
    // antes de hidratar y provocan un aviso falso. Solo afecta a estos dos elementos, no a sus hijos.
    <html lang="es" suppressHydrationWarning>
      <body className="min-h-screen bg-slate-100 text-slate-800 antialiased" suppressHydrationWarning>
        <a
          href="#contenido"
          className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:bg-white focus:px-4 focus:py-2 focus:text-[#001D4A] focus:ring-2 focus:ring-[#ECA400] focus:outline-hidden"
        >
          Saltar al contenido
        </a>
        {children}
      </body>
    </html>
  );
}
