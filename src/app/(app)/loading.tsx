import { PageLoader } from "@/components/Spinner";

// Shown automatically during navigation between app pages while the next page's
// data loads — gives instant feedback on every page switch.
export default function Loading() {
  return <PageLoader />;
}
