import { motion, useAnimation, useInView } from "framer-motion";
import { BarChart, CreditCard, Package, ShoppingCart, TrendingUp, Users } from "lucide-react";
import Footer from "../../components/Footer";
import kiranaShop from "../../assets/945.png";
import SplitText from "../../Utilities/SplitText";
import Earth from "../../assets/HomeEarth.png";
import Home1 from "../../assets/Home1.png";
import Home2 from "../../assets/Home2.png";
import Home3 from "../../assets/Home3.png";
import Home4 from "../../assets/Home4.png";
import Money from "../../assets/HomeMoney.png";
import ExploreSection from "../../components/ExploreSection";

import { useRef, useEffect, useState } from "react";

const handleAnimationComplete = () => {
  console.log('All letters have animated!');
};
const features = [
  {
    title: "Inventory Management",
    desc: "Stay updated with real-time stock levels.",
    img: "https://via.placeholder.com/600x300"
  },
  {
    title: "Billing Solutions",
    desc: "Generate invoices and manage transactions effortlessly.",
    img: "https://via.placeholder.com/600x300"
  },
  {
    title: "Business Credit Management",
    desc: "Offer and track credit transactions securely.",
    img: "https://via.placeholder.com/600x300"
  },
  {
    title: "Supply Chain Management",
    desc: "Optimize and streamline supply chain operations.",
    img: "https://via.placeholder.com/600x300"
  },
  {
    title: "Growth & Analytics",
    desc: "Gain insights to scale your business effectively.",
    img: "https://via.placeholder.com/600x300"
  },
  {
    title: "Curated Business Support",
    desc: "Get expert advice and tailored support.",
    img: "https://via.placeholder.com/600x300"
  }
];



export default function LandingPage() {
  const heroRef = useRef(null);
  const [heroWidth, setHeroWidth] = useState("100vw");
  const [heroRadius, setHeroRadius] = useState("0px");
  const [selectedCard, setSelectedCard] = useState(null);
  const [selectedFeature, setSelectedFeature] = useState(null);


  // Sledge Software Solutions section
  const sledgeRef = useRef(null);
  const [sledgeScale, setSledgeScale] = useState(1);
  const [sledgeTranslate, setSledgeTranslate] = useState(0);
  const [bgReveal, setBgReveal] = useState(0); // 0 = hidden, 1 = fully revealed

  // Why Do We Exist section
  const whyExistRef = useRef(null);
  const [whyExistScale, setWhyExistScale] = useState(1);

  // WHy Sledge Ref Section
  const whySledgeRef = useRef(null);
  const [whySledgeWidth, setwhySledgeWidth] = useState("100vw");
  const [whySledgeRadius, setwhySledgeRadius] = useState("0px");


  useEffect(() => {
    function handleScroll() {
      // --- HERO SECTION ANIMATION ---
      if (heroRef.current) {
        const rect = heroRef.current.getBoundingClientRect();
        const windowHeight = window.innerHeight;
        const start = 0;
        const end = -windowHeight * 1.2;
        let progress = 0;
        if (rect.top < start) {
          progress = Math.min(1, Math.max(0, (start - rect.top) / (start - end)));
        }
        const width = 100 - 15 * progress;
        const radius = progress * 48;
        heroRef.current.style.width = `${width}vw`;
        heroRef.current.style.borderRadius = `${radius}px`;
      }
      // WHY SLEDGE REF SECTION ANIMATION ---
      if (whySledgeRef.current) {
        const rect = whySledgeRef.current.getBoundingClientRect();
        const windowHeight = window.innerHeight;
        const start = 0;
        const end = -windowHeight * 1.2;
        let progress = 0;
        if (rect.top < start) {
          progress = Math.min(1, Math.max(0, (start - rect.top) / (start - end)));
        }
        const width = 100 - 15 * progress;
        const radius = progress * 48;
        whySledgeRef.current.style.width = `${width}vw`;
        whySledgeRef.current.style.borderRadius = `${radius}px`;
      }

      // --- SLEDGE SECTION ANIMATION ---
      if (sledgeRef.current) {
        const rect = sledgeRef.current.getBoundingClientRect();
        const windowHeight = window.innerHeight;
        const start = windowHeight * 0.3;
        const end = -windowHeight * 0.2;
        let progress = 0;
        if (rect.top < start) {
          progress = Math.min(1, Math.max(0, (start - rect.top) / (start - end)));
        }
        // Text shrinks and moves up
        setSledgeScale(1 - 0.3 * progress);
        setSledgeTranslate(-350 * progress);

        // Background reveal: from white to image, reveal from bottom
        setBgReveal(progress);
      }

      // --- WHY DO WE EXIST SECTION ANIMATION ---
      if (whyExistRef.current) {
        const rect = whyExistRef.current.getBoundingClientRect();
        const windowHeight = window.innerHeight;
        const start = windowHeight * 0.3;
        const end = -windowHeight * 0.5;
        let progress = 0;
        if (rect.top < start) {
          progress = Math.min(1, Math.max(0, (start - rect.top) / (start - end)));
        }
        setWhyExistScale(1 - 0.15 * progress); // Shrink a bit less than hero
      }
    }

    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <div className="min-h-screen bg-white text-slate-900 font-sans overflow-clip">
      {/* Hero Section with animated width and border radius */}
      <section
        ref={heroRef}
        className="relative flex flex-col justify-center overflow-hidden p-0 m-0 mx-auto transition-all duration-[0ms] ease-linear"
        style={{
          width: heroWidth,
          height: "100vh",
          borderRadius: heroRadius,
          background: "#fff",
          boxShadow: heroRadius !== "0px" ? "0 8px 32px 0 rgba(36,41,54,0.13)" : undefined,
        }}
      >
        {/* Fullscreen Video - only covers the hero section */}
        <video
          autoPlay
          loop
          muted
          playsInline
          className="absolute top-0 left-0 w-full h-full object-cover z-0"
          style={{ minHeight: "100vh", minWidth: "100vw", borderRadius: heroRadius, transition: "border-radius 0.5s cubic-bezier(0.4,0,0.2,1)" }}
        >
          <source src="https://www.onelineage.com/sites/default/files/2023-05/main_page_032323_web.mp4" type="video/mp4" />
          Your browser does not support the video tag.
        </video>
        {/* Subtle dark gradient overlay from left */}
        <div
          className="absolute top-0 left-0 w-full h-full z-10 pointer-events-none"
          style={{
            background: "linear-gradient(to right, rgba(15, 23, 42, 0.8) 0%, rgba(15, 23, 42, 0.4) 50%, rgba(15, 23, 42, 0) 100%)",
            minHeight: "100vh",
            minWidth: "100vw",
            borderRadius: heroRadius,
            transition: "border-radius 0.5s cubic-bezier(0.4,0,0.2,1)"
          }}
        />
        {/* Content aligned to left and above the video */}
        <div className="max-w-5xl relative z-20 flex flex-col items-start px-8 md:px-16 ml-0 md:ml-8">
          <SplitText
            text="Bridging Retailers"
            className="text-5xl md:text-7xl py-2 font-bold leading-tight mb-2 tracking-tight text-white text-left"
            delay={80}
            duration={0.4}
            ease="power3.out"
            splitType="chars"
            from={{ opacity: 0, y: 40 }}
            to={{ opacity: 1, y: 0 }}
            threshold={0.1}
            rootMargin="-100px"
            textAlign="center"
            onLetterAnimationComplete={handleAnimationComplete}
          />
          <SplitText
            text="& Distributors"
            className="text-5xl md:text-7xl font-bold leading-tight mb-8 tracking-tight text-white text-left"
            delay={80}
            duration={0.4}
            ease="power3.out"
            splitType="chars"
            from={{ opacity: 0, y: 40 }}
            to={{ opacity: 1, y: 0 }}
            threshold={0.1}
            rootMargin="-100px"
            textAlign="center"
            onLetterAnimationComplete={handleAnimationComplete}
          />
          <button
            className="mt-8 px-8 py-3 border border-white/30 text-white rounded-full bg-white/10 backdrop-blur-md font-medium transition hover:bg-white/20 text-lg shadow-lg"
          >
            Learn more
          </button>
        </div>
      </section>
      {/* Why Do We Exist Section */}
      <section
        ref={whyExistRef}
        className="flex justify-between items-center py-24 bg-white px-4 w-full"
      >
        <div
          className="w-full max-w-7xl mx-auto bg-white rounded-3xl p-0 flex flex-col items-start overflow-hidden"
          style={{
            transform: `scale(${whyExistScale})`,
            transition: "transform 0.4s cubic-bezier(0.4,0,0.2,1)", // match hero section
            willChange: "transform"
          }}
        >
          <h2 className="text-4xl md:text-5xl font-bold leading-tight mb-8 tracking-tight text-left px-8 md:px-16 pt-12">
            <span className="bg-gradient-to-r from-indigo-600 via-violet-600 to-blue-500 bg-clip-text text-transparent">
              Why Do We Exist
            </span>
          </h2>
          <div className="text-xl md:text-2xl text-slate-600 mb-12 text-left px-8 md:px-16 font-normal max-w-4xl leading-relaxed">
            We exist to empower retailers and distributors with modern, efficient, and elegant software solutions that bridge the gap in the supply chain, enabling growth and clarity for every business.
          </div>
          {/* <img
              src={Earth}
              alt="Why Do We Exist"
              className="w-full object-cover shadow"
              style={{ height: "30rem " }}
            /> */}
        </div>
      </section>

      {/* Sledge Software Solutions Section */}
      <section
        ref={sledgeRef}
        className="text-center px-6 py-32 md:py-48 max-w-6xl mx-auto relative overflow-hidden"
        style={{ minHeight: "60vh" }}
      >
        {/* Background reveal: white to image, revealed from bottom */}
        <div className="absolute inset-0 w-full h-full pointer-events-none select-none z-0">
          {/* White background always */}
          <div className="absolute inset-0 bg-white" />
          {/* Image revealed from bottom as you scroll */}
          <img
            src={kiranaShop}
            alt="Background"
            className="absolute left-0 bottom-0 w-full object-cover transition-all duration-500"
            style={{
              height: `${bgReveal * 100}%`,
              opacity: bgReveal,
              filter: `blur(${10 - 10 * bgReveal}px)`,
              transition: "height 0.4s cubic-bezier(0.4,0,0.2,1), opacity 0.4s, filter 0.4s"
            }}
          />
        </div>
        <div
          className="relative z-10 transition-all duration-300"
          style={{
            transform: `scale(${sledgeScale}) translateY(${sledgeTranslate}px)`,
            transition: "transform 0.4s cubic-bezier(0.4,0,0.2,1)"
          }}
        >
          <h1 className="text-5xl md:text-7xl font-bold leading-tight mb-4 tracking-tight text-slate-900">
            Sledge
          </h1>
          <h1 className="text-5xl md:text-7xl font-bold leading-tight mb-8 tracking-tight text-indigo-600">
            Software Solutions
          </h1>
          <p className="text-xl md:text-2xl text-slate-600 mb-12 max-w-3xl mx-auto leading-relaxed">
            A premium UI crafted for clarity, elegance, and modern appeal. Designed for forward-thinkers.
          </p>
          <button className="bg-slate-900 text-white px-8 py-4 text-lg font-medium rounded-full hover:bg-slate-800 transition-all shadow-lg hover:shadow-xl transform hover:-translate-y-1">
            Explore Now
          </button>
        </div>
      </section>


      {/* --- Fullscreen Scrollable Rounded Rectangles Section --- */}
      <div>
        <ExploreSection />
      </div>
      {/* Modal Overlay */}
      {selectedFeature !== null && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setSelectedFeature(null)}
        >
          <div
            className="relative bg-white rounded-2xl p-8 w-full max-w-4xl max-h-[90vh] overflow-auto shadow-2xl"
            onClick={(e) => e.stopPropagation()} // prevent close on inner click
          >
            {/* Close Button */}
            <button
              onClick={() => setSelectedFeature(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition-colors"
            >
              <span className="sr-only">Close</span>
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            {/* Image */}
            <img
              src={kiranaShop}
              alt={features[selectedFeature].title}
              className="w-full h-72 object-cover rounded-xl mb-8"
            />

            {/* Title & Description */}
            <h2 className="text-3xl font-bold mb-4 text-slate-900">
              {features[selectedFeature].title}
            </h2>
            <p className="text-slate-600 text-lg leading-relaxed">{features[selectedFeature].desc}</p>
          </div>
        </div>
      )}

      {/* Section */}
      <section ref={whySledgeRef}
        className="relative flex flex-col justify-center overflow-hidden p-0 m-0 mx-auto transition-all duration-[0ms] ease-linear bg-slate-950 px-8 md:px-16"
        style={{
          width: heroWidth,
          height: "auto",
          minHeight: "100vh",
          borderRadius: heroRadius,
          background: "#020617", // slate-950
          paddingTop: "8rem",
          paddingBottom: "8rem",
          boxShadow: heroRadius !== "0px" ? "0 8px 32px 0 rgba(36,41,54,0.13)" : undefined,
        }}>
        <h2 className="text-4xl md:text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-violet-400 to-blue-400 mb-20 text-center md:text-left">
          Why Choose Sledge
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8 max-w-7xl mx-auto">
          {features.map((feature, idx) => (
            <div
              key={idx}
              onClick={() => setSelectedFeature(idx)}
              className="bg-slate-900 border border-slate-800 p-8 rounded-2xl cursor-pointer hover:bg-slate-800 transition-all duration-300 group flex flex-col justify-between h-[280px]"
            >
              <div className="flex-grow flex items-end">
                <h3 className="text-2xl font-semibold text-slate-100 group-hover:text-white transition-colors">
                  {feature.title}
                </h3>
              </div>
              <p className="mt-4 text-slate-400 text-base group-hover:text-slate-300 transition-colors leading-relaxed">{feature.desc}</p>
            </div>
          ))}
        </div>
      </section>
      <section className="w-full bg-white py-32 px-8 md:px-32">
        <h2 className="text-4xl md:text-6xl font-bold leading-tight mb-16 tracking-tight text-slate-900 max-w-4xl">
          Low On Margins, We Care Too
        </h2>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          {/* Left Content */}
          <div>
            <h1 className="text-9xl font-bold leading-none text-slate-900 mb-8 tracking-tighter">99</h1>
            <p className="text-2xl text-slate-600 leading-relaxed max-w-md">
              the cost for all this because,<br />
              <span className="font-semibold text-indigo-600"> Sledge is never a burden.</span>
            </p>
          </div>

          {/* Right Image Placeholder */}
          <div className="w-full h-[400px] md:h-[500px] bg-slate-100 rounded-3xl overflow-hidden shadow-lg">
            {/* Replace src with your image */}
            <img
              src={Money}
              alt="Sledge Pricing Visual"
              className="object-cover w-full h-full hover:scale-105 transition-transform duration-700"
            />
          </div>
        </div>
      </section>
      {/* Subscribe to Newsletter Section */}
      <div className="w-full bg-slate-50 py-32 flex flex-col items-center justify-center text-center px-4">
        <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">Subscribe to Our Newsletter</h2>
        <p className="text-lg text-slate-600 max-w-xl mb-10">
          Stay updated with the latest features, business tools, and tips to grow with Sledge.
        </p>

        <form className="w-full max-w-md flex flex-col gap-4">
          <input
            type="text"
            placeholder="Name"
            className="w-full px-6 py-4 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
          />
          <input
            type="email"
            placeholder="Email"
            className="w-full px-6 py-4 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
          />
          <button
            type="submit"
            className="w-full px-6 py-4 bg-indigo-600 text-white font-semibold rounded-xl hover:bg-indigo-700 transition duration-300 shadow-lg shadow-indigo-200"
          >
            Subscribe
          </button>
        </form>
      </div>
    </div>
  );
}
