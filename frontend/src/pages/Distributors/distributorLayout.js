import { NavLink, Outlet } from "react-router-dom";
import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { PlaneTakeoff, BanknoteArrowUp, Landmark, User, ScanBarcode, MoreVertical, LogOut } from "lucide-react";
import { useAuth } from "../../components/AuthContext.js"; // Import the AuthContext

function TogglingPaymentIcon() {
  const [showFirst, setShowFirst] = useState(true);

  useEffect(() => {
    const interval = setInterval(() => {
      setShowFirst((prev) => !prev);
    }, 3000); // Change every 3 seconds
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="transition-opacity duration-500 ease-in-out">
      {showFirst ? (
        <BanknoteArrowUp className="w-5 h-5 mb-1" />
      ) : (
        <Landmark className="w-5 h-5 mb-1" />
      )}
    </div>
  );
}

export default function Layout() {

  const navItems = [
    { name: "Orders", to: "/distributor/", icon: PlaneTakeoff },
    { name: "Products", to: "/distributor/products", icon: ScanBarcode },
    { name: "Overview", to: "/distributor/overview", icon: Landmark },
    { name: "Payments", to: "/distributor/payments", icon: BanknoteArrowUp },
    { name: "Profile", to: "/distributor/profile", icon: User },
  ];


  const navigate = useNavigate();
  const location = useLocation();
  const [activeItemPosition, setActiveItemPosition] = useState({ left: 0, width: 0 });
  const [showMobileDropdown, setShowMobileDropdown] = useState(false);

  useEffect(() => {
    // Small delay to ensure DOM is ready
    const timer = setTimeout(() => {
      const activeIndex = navItems.findIndex(item => location.pathname === item.to);
      if (activeIndex !== -1) {
        const navElement = document.querySelector(`[data-nav-index="${activeIndex}"]`);
        const navbarElement = document.querySelector('.fixed.top-0');

        if (navElement && navbarElement) {
          const rect = navElement.getBoundingClientRect();
          const navbarRect = navbarElement.getBoundingClientRect();
          setActiveItemPosition({
            left: rect.left - navbarRect.left,
            width: rect.width
          });
        }
      }
    }, 50);

    return () => clearTimeout(timer);
  }, [location.pathname]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (showMobileDropdown && !event.target.closest('.mobile-dropdown-container')) {
        setShowMobileDropdown(false);
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [showMobileDropdown]);
  const { logout } = useAuth(); // Import the logout function from AuthContext
  const handleLogout = () => {
    // Clear user session or token (if stored in localStorage or cookies)
    localStorage.removeItem("userInfo");
    logout(); // Call the logout function from AuthContext
    alert("You have been logged out successfully.");
    // Close dropdown
    setShowMobileDropdown(false);
    // Redirect to the home page
    navigate("/");
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Top Navigation Bar */}
      <div className="fixed top-0 left-0 w-full bg-white border-b border-slate-200 shadow-sm z-50 relative">
        <div className="px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16 nav-container">
            {/* Left Section: Logo and Navigation Items */}
            <div className="flex items-center space-x-2 md:space-x-8 w-full md:w-auto">
              {/* Logo - Hidden on mobile */}
              <img
                src={process.env.PUBLIC_URL + "/logo192.png"}
                alt="Logo"
                className="hidden md:block h-10 w-auto cursor-pointer"
                onClick={() => navigate("/")}
              />

              {/* Navigation Items */}
              <div className="flex items-center space-x-1 md:space-x-2 w-full md:w-auto overflow-x-auto no-scrollbar">
                {navItems.map(({ name, to, icon: Icon }, index) => {
                  const isActive = location.pathname === to;
                  return (
                    <button
                      key={index}
                      data-nav-index={index}
                      onClick={() => {
                        navigate(to);
                        setShowMobileDropdown(false);
                      }}
                      className={`flex flex-col md:flex-row items-center justify-center min-w-0 flex-shrink-0 text-sm font-medium transition-all px-3 py-2 rounded-lg ${isActive
                          ? "bg-indigo-50 text-indigo-700"
                          : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                        }`}
                    >
                      {/* Show icon on mobile, hide on desktop */}
                      <div className="block md:hidden mb-1">
                        {typeof Icon === 'function' ? <Icon size={18} /> : <Icon className="w-4 h-4" />}
                      </div>
                      <span className="text-center">{name}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Right Section: Logout Button - Hidden on mobile, but add mobile dropdown trigger */}
            <div className="hidden md:block">
              <button
                onClick={handleLogout}
                className="bg-white text-slate-700 border border-slate-200 px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-50 hover:text-slate-900 transition-colors shadow-sm"
              >
                Logout
              </button>
            </div>

            {/* Mobile Dropdown Toggle Button */}
            <div className="md:hidden mobile-dropdown-container relative">
              <button
                onClick={() => setShowMobileDropdown(!showMobileDropdown)}
                className={`p-2 rounded-lg transition-colors duration-200 ${showMobileDropdown
                    ? 'bg-slate-100 text-slate-900'
                    : 'text-slate-600 hover:bg-slate-50'
                  }`}
                aria-label="Menu"
              >
                <MoreVertical className="w-5 h-5" />
              </button>

              {/* Mobile Dropdown Menu */}
              {showMobileDropdown && (
                <div className="absolute top-full right-0 mt-2 w-48 bg-white rounded-xl shadow-lg border border-slate-200 py-1 z-50">
                  <button
                    onClick={handleLogout}
                    className="w-full text-left px-4 py-3 text-red-600 hover:bg-red-50 font-medium transition-colors duration-150 flex items-center space-x-2"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Logout</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Content Area */}
      <div className="pt-0">
        <Outlet />
      </div>
    </div>
  );
}