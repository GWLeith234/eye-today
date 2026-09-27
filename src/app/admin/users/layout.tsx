import { requireArea } from "@/lib/auth/session";

export default async function AdminUsersLayout({ children }: LayoutProps<"/admin/users">) {
  await requireArea("admin-users");
  return children;
}
