import { Navbar } from '@/components/landing/navbar'
import { HeroSection } from '@/components/landing/hero-section'
import { FeaturesSection } from '@/components/landing/features-section'
import { HowItWorksSection } from '@/components/landing/how-it-works-section'
import { Footer } from '@/components/landing/footer'

export default function Home() {
  return (
    <main className="dark">
      <Navbar />
      <HeroSection />
      <FeaturesSection />
      <HowItWorksSection />
      <Footer />
    </main>
  )
}
