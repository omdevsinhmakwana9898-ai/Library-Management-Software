import { Suspense, lazy } from 'react';
import Features from './Features.jsx';
import Showcase from './Showcase.jsx';
import HowItWorks from './HowItWorks.jsx';
import Pricing from './Pricing.jsx';
import FAQ from './FAQ.jsx';
import Footer, { FinalCTA } from './Footer.jsx';

export default function HomeBelowFold() {
  return (
    <>
      <Features />
      <Showcase />
      <HowItWorks />
      <Pricing />
      <FAQ />
      <FinalCTA />
      <Footer />
    </>
  );
}
