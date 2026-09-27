import { requireArea } from "@/lib/auth/session";

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  await requireArea("admin");
  return children;
}
