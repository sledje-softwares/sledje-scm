import { NavLink, Outlet } from "react-router-dom";
import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { PlaneLanding, Library, BanknoteArrowUp, Landmark, User, ScanBarcode, MoreVertical, LogOut } from "lucide-react";
import { useAuth } from "../../components/AuthContext.js"; // Import the AuthContext
import API from "../../api"; // Adjust the import based on your project structure

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

export default function RetailerLayout() {
  const navItems = [
    { name: "Shop", to: "/retailer/shop", icon: ScanBarcode },
    { name: "Shelf", to: "/retailer/shelf", icon: Library },
    { name: "Payments", to: "/retailer/payment", icon: TogglingPaymentIcon },
    { name: "Orders", to: "/retailer/orders", icon: PlaneLanding },
    { name: "You", to: "/retailer/you", icon: User },
  ];

  const navigate = useNavigate();
  const location = useLocation();
  const [showMobileDropdown, setShowMobileDropdown] = useState(false);

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
  const handleLogout = async () => {
    // Step 1: Confirm logout
    if (!window.confirm("Are you sure you want to logout? Unsaved cart items will be sent to backend.")) return;

    // Step 2: Send cart to backend before logout


    // Step 3: Proceed with logout
    localStorage.removeItem("userInfo");
    logout();
    alert("You have been logged out successfully.");
    setShowMobileDropdown(false);
    navigate("/");
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans">
      {/* Top Navigation Bar */}
      <div className="fixed top-0 left-0 w-full bg-white border-b border-slate-200 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            {/* Left Section: Logo and Navigation Items */}
            <div className="flex items-center space-x-8 w-full md:w-auto">
              {/* Logo - Hidden on mobile */}
              <div
                className="hidden md:flex items-center cursor-pointer"
                onClick={() => navigate("/")}
              >
                <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center mr-2">
                  <span className="text-white font-bold text-xl">S</span>
                </div>
                <span className="text-xl font-bold text-slate-900">Sledje</span>
              </div>

              {/* Navigation Items */}
              <div className="flex items-center justify-between md:justify-start space-x-1 md:space-x-2 w-full md:w-auto overflow-x-auto no-scrollbar">
                {navItems.map(({ name, to, icon: Icon }, index) => {
                  const isActive = location.pathname === to;
                  return (
                    <button
                      key={index}
                      onClick={() => {
                        navigate(to);
                        setShowMobileDropdown(false);
                      }}
                      className={`flex flex-col md:flex-row items-center justify-center min-w-[4rem] md:min-w-0 px-3 py-2 rounded-lg transition-all duration-200 ${isActive
                          ? "bg-indigo-50 text-indigo-600"
                          : "text-slate-500 hover:text-slate-900 hover:bg-slate-50"
                        }`}
                    >
                      {/* Show icon on mobile, hide on desktop */}
                      <div className="block md:hidden mb-1">
                        {typeof Icon === 'function' ? <Icon /> : <Icon className="w-5 h-5" />}
                      </div>
                      <span className={`text-xs md:text-sm font-medium ${isActive ? 'font-semibold' : ''}`}>{name}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Right Section: Logout Button - Hidden on mobile */}
            <div className="hidden md:block">
              <button
                onClick={handleLogout}
                className="flex items-center space-x-2 px-4 py-2 text-sm font-medium text-slate-700 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              >
                <LogOut className="w-4 h-4" />
                <span>Logout</span>
              </button>
            </div>

            {/* Mobile Dropdown Toggle Button */}
            <div className="md:hidden mobile-dropdown-container relative ml-2">
              <button
                onClick={() => setShowMobileDropdown(!showMobileDropdown)}
                className={`p-2 rounded-lg transition-colors duration-200 ${showMobileDropdown
                    ? 'bg-slate-100 text-slate-900'
                    : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
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
      <div className="pt-16">
        <Outlet />
      </div>
    </div>
  );
}