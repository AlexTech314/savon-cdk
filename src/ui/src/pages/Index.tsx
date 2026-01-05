import Header from "@/components/Header";
import Hero from "@/components/Hero";
import Philosophy from "@/components/Philosophy";
import Approach from "@/components/Approach";
import ContactCTA from "@/components/ContactCTA";
import Footer from "@/components/Footer";
import DebugPreviewSwitcher from "@/components/DebugPreviewSwitcher";

const Index = () => {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main>
        <Hero />
        <Philosophy />
        <Approach />
        <ContactCTA />
      </main>
      <Footer />
      <DebugPreviewSwitcher />
    </div>
  );
};

export default Index;
