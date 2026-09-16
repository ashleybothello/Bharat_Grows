import Navbar from './landing/Navbar';
import Hero from './landing/Hero';
import ProductIntro from './landing/ProductIntro';
import ProductShowcase from './landing/ProductShowcase';
import SoilIntelligence from './landing/SoilIntelligence';
import CropIntelligence from './landing/CropIntelligence';
import MarketIntelligence from './landing/MarketIntelligence';
import SaathiSection from './landing/SaathiSection';
import HardwareSection from './landing/HardwareSection';
import HowItWorks from './landing/HowItWorks';
import BuiltForBharat from './landing/BuiltForBharat';
import FinalCTA from './landing/FinalCTA';
import Footer from './landing/Footer';
import './landing/landing-page.css';

export default function Landing() {
  return (
    <div className="lp">
      {/* THESIS: Product-as-hero agricultural OS, not farm-photo banners. OWN-WORLD: Forest chrome on cream paper. STORY: See the software, start farming smarter. FIRST VIEWPORT: Copy left, product frame right. FORM: Brief-pinned product-editorial agri-tech. FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance */}
      <Navbar />
      <main>
        <Hero />
        <ProductIntro />
        <ProductShowcase />
        <SoilIntelligence />
        <CropIntelligence />
        <MarketIntelligence />
        <SaathiSection />
        <HardwareSection />
        <HowItWorks />
        <BuiltForBharat />
        <FinalCTA />
      </main>
      <Footer />
    </div>
  );
}
