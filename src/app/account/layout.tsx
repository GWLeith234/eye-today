import { requireArea } from "@/lib/auth/session";

export default async function AccountLayout({ children }: LayoutProps<"/account">) {
  await requireArea("account");
  return children;
}
