import { SITE_URL } from "@/lib/site";
import Nav from "@/components/marketing/nav";
import Footer from "@/components/marketing/footer";

export const metadata = { metadataBase: new URL(SITE_URL) };

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return <><Nav />{children}<Footer /></>;
}
