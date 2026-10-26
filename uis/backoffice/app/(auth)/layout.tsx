import { EMPRESA } from "@/lib/nexova";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="bg-[#001D4A] px-4 py-5 sm:px-6">
        <p className="text-xl font-bold tracking-tight text-white">
          {EMPRESA.marca}{" "}
          <span className="font-normal text-[#ECA400]">Backoffice</span>
        </p>
      </header>
      <main id="contenido" className="flex flex-1 items-start justify-center px-4 py-10 sm:px-6">
        <div className="w-full max-w-md">{children}</div>
      </main>
    </div>
  );
}
