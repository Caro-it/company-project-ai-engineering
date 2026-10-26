import { AuthGuard } from "@/components/AuthGuard";
import { UserHeader } from "@/components/UserHeader";

// Cada página trae su propio <main>, así que aquí solo va la cabecera
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <AuthGuard>
      <UserHeader />
      {children}
    </AuthGuard>
  );
}
