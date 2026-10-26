import { AuthGuard } from "@/components/AuthGuard";
import { Sidebar } from "@/components/Sidebar";
import { EMPRESA } from "@/lib/nexova";

export default function PanelLayout({ children }: LayoutProps<"/">) {
  return (
    <AuthGuard>
      <div className="lg:flex">
        <Sidebar />
        <div className="flex-1">
          <header className="border-b border-slate-200 bg-white px-4 py-4 sm:px-6 lg:px-10">
            <p className="text-sm text-slate-600">
              Panel interno ·{" "}
              <span className="font-semibold text-[#001D4A]">{EMPRESA.nombreCompleto}</span>
            </p>
          </header>
          <main id="contenido" className="px-4 py-8 sm:px-6 lg:px-10">
            {children}
          </main>
        </div>
      </div>
    </AuthGuard>
  );
}
