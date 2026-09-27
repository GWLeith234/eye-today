import { requireArea } from "@/lib/auth/session";

export default async function ContributeLayout({ children }: LayoutProps<"/contribute">) {
  await requireArea("contribute");
  return children;
}
