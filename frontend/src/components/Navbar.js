import { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import logo from "../assets/navBarLogo1.png";
import { Menu, X, ChevronDown } from "lucide-react";

export default function Navbar({ onLoginClick }) {
  const [openDropdown, setOpenDropdown] = useState(null);
  const [showNavbar, setShowNavbar] = useState(true);
  const [lastScrollY, setLastScrollY] = useState(0);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const navbarRef = useRef(null);
  const navigate = useNavigate();

  const toggleDropdown = (name) => {
    setOpenDropdown((prev) => (prev === name ? null : name));
  };

  const closeDropdown = () => {
    setOpenDropdown(null);
  };

  const toggleMobileMenu = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen);
    setOpenDropdown(null);
  };

  const closeMobileMenu = () => {
    setIsMobileMenuOpen(false);
    setOpenDropdown(null);
  };

  useEffect(() => {
    const handleScroll = () => {
      const currentY = window.scrollY;

      // Show/hide logic
      if (currentY < lastScrollY || currentY < 10) {
        setShowNavbar(true);
      } else {
        setShowNavbar(false);
      }
      setLastScrollY(currentY);

      // Scrolled state logic
      setIsScrolled(currentY > 10);
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, [lastScrollY]);

  // Navigation Items Data
  const navItems = [
    {
      name: "Vision",
      id: "vision",
      links: [
        { to: "/vision/goals", label: "Our Goals" },
        { to: "/vision/founders", label: "Founders" },
        { to: "/vision/investors", label: "Investors" },
      ]
    },
    {
      name: "Support",
      id: "support",
      links: [
        { to: "/support/tracking", label: "Tracking" },
        { to: "/support/grievances", label: "Grievances" },
        { to: "/support/contact-us", label: "Contact Us" },
      ]
    },
    {
      name: "Services",
      id: "services",
      links: [
        { to: "/services/inventory-management", label: "Inventory Management" },
        { to: "/services/billing-credit-management", label: "Billing & Credit" },
        { to: "/services/customer-automation", label: "Customer Automation" },
        { to: "/services/supply-chain-optimizations", label: "Supply Chain" },
        { to: "/services/ai-driven-analytics", label: "AI Analytics" },
      ]
    },
    {
      name: "Partners",
      id: "partners",
      links: [
        { to: "/partners/retailers", label: "Retailers" },
        { to: "/partners/distributors", label: "Distributors" },
        { to: "/partners/delivery-partners", label: "Delivery Partners" },
      ]
    }
  ];

  return (
    <>
      <nav
        ref={navbarRef}
        className={`fixed top-0 left-0 w-full z-50 transition-all duration-300 font-sans ${showNavbar ? "translate-y-0" : "-translate-y-full"
          } ${isScrolled || isMobileMenuOpen
            ? "bg-slate-900/95 backdrop-blur-md shadow-md py-3"
            : "bg-transparent py-5"
          }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">

            {/* Logo */}
            <div className="flex-shrink-0">
              <Link to="/" onClick={closeMobileMenu}>
                <img src={logo} alt="Sledge" className="h-10 w-auto" />
              </Link>
            </div>

            {/* Desktop Navigation */}
            <div className="hidden lg:flex items-center space-x-8">
              {navItems.map((item) => (
                <div key={item.id} className="relative group">
                  <button
                    onClick={() => toggleDropdown(item.id)}
                    className="flex items-center text-slate-200 hover:text-white font-medium transition-colors text-sm uppercase tracking-wide"
                  >
                    {item.name}
                    <ChevronDown className={`ml-1 w-4 h-4 transition-transform duration-200 ${openDropdown === item.id ? "rotate-180" : ""}`} />
                  </button>

                  {/* Dropdown Menu */}
                  {openDropdown === item.id && (
                    <div
                      className="absolute left-0 mt-3 w-56 bg-white rounded-xl shadow-xl border border-slate-100 overflow-hidden py-2 animate-in fade-in slide-in-from-top-2 duration-200"
                      onMouseLeave={closeDropdown}
                    >
                      {item.links.map((link) => (
                        <Link
                          key={link.to}
                          to={link.to}
                          className="block px-4 py-2.5 text-sm text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                          onClick={closeDropdown}
                        >
                          {link.label}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Desktop Login Button */}
            <div className="hidden lg:flex items-center">
              <button
                onClick={onLoginClick}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded-full font-medium transition-all shadow-sm hover:shadow-indigo-500/30 text-sm"
              >
                Login
              </button>
            </div>

            {/* Mobile Menu Button */}
            <div className="lg:hidden flex items-center">
              <button
                onClick={toggleMobileMenu}
                className="text-white p-2 rounded-lg hover:bg-white/10 transition-colors"
              >
                {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Menu Overlay */}
        {isMobileMenuOpen && (
          <div className="lg:hidden absolute top-full left-0 w-full bg-slate-900 border-t border-slate-800 shadow-xl max-h-[calc(100vh-80px)] overflow-y-auto">
            <div className="px-4 py-6 space-y-4">
              {navItems.map((item) => (
                <div key={item.id} className="border-b border-slate-800 pb-4 last:border-0">
                  <button
                    onClick={() => toggleDropdown(item.id)}
                    className="flex items-center justify-between w-full text-left text-slate-200 font-medium py-2"
                  >
                    {item.name}
                    <ChevronDown className={`w-5 h-5 transition-transform ${openDropdown === item.id ? "rotate-180" : ""}`} />
                  </button>

                  {openDropdown === item.id && (
                    <div className="mt-2 pl-4 space-y-2 border-l-2 border-slate-700 ml-2">
                      {item.links.map((link) => (
                        <Link
                          key={link.to}
                          to={link.to}
                          className="block py-2 text-sm text-slate-400 hover:text-white transition-colors"
                          onClick={closeMobileMenu}
                        >
                          {link.label}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              ))}

              <div className="pt-4">
                <button
                  onClick={() => {
                    onLoginClick();
                    closeMobileMenu();
                  }}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-3 rounded-lg font-medium transition-colors"
                >
                  Login
                </button>
              </div>
            </div>
          </div>
        )}
      </nav>

      {/* Overlay to close dropdowns when clicking outside */}
      {openDropdown && !isMobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-transparent"
          onClick={closeDropdown}
        />
      )}
    </>
  );
}