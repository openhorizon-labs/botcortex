import { Nav } from "@/components/site/nav";
import { Hero } from "@/components/site/hero";
import { FeatureStrip, FeatureCards } from "@/components/site/features";
import { Pricing } from "@/components/site/pricing";
import { FinalCta } from "@/components/site/final-cta";
import { Footer } from "@/components/site/footer";

export default function Page() {
  return (
    <>
      <Nav />
      <main className="flex-1">
        <Hero />
        <FeatureStrip />
        <FeatureCards />
        <Pricing />
        <FinalCta />
      </main>
      <Footer />
    </>
  );
}
