import { Nav } from "@/components/site/nav";
import { Hero } from "@/components/site/hero";
import { Problem } from "@/components/site/problem";
import { Pillars } from "@/components/site/pillars";
import { HowItWorks } from "@/components/site/how-it-works";
import { Audiences } from "@/components/site/audiences";
import { Pricing } from "@/components/site/pricing";
import { FinalCta } from "@/components/site/final-cta";
import { Footer } from "@/components/site/footer";

export default function Page() {
  return (
    <>
      <Nav />
      <main className="flex-1">
        <Hero />
        <Problem />
        <Pillars />
        <HowItWorks />
        <Audiences />
        <Pricing />
        <FinalCta />
      </main>
      <Footer />
    </>
  );
}
