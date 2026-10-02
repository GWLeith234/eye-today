import { NotFoundView } from "@/components/public/not-found-view";

// Used when a public page calls notFound(). The public layout already supplies the header and footer.
export default function PublicNotFound() {
  return <NotFoundView />;
}
