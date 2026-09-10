import { useEffect, useRef, useState } from "react";
import {
  Trash,
  Check,
  CircleCheck,
  CreditCard,
  Phone,
  Plus,
  Search,
  Clock,
  CheckCircle,
  XCircle,
  UserPlus,
  Building2,
  AlertTriangle
} from "lucide-react";
import { useAuth } from "../../components/AuthContext";
import API from "../../api";
import { Skeleton } from "../../components/Skeleton";

// Mock images (replace with your actual imports)
const GunjanImage = "https://via.placeholder.com/100x100/4F46E5/FFFFFF?text=GS";
const Card1 = "https://via.placeholder.com/300x200/3B82F6/FFFFFF?text=Delivery";
const Card2 = "https://via.placeholder.com/300x200/10B981/FFFFFF?text=Billing";
const Card3 = "https://via.placeholder.com/300x200/F59E0B/FFFFFF?text=IoT";
const Card4 = "https://via.placeholder.com/300x200/EF4444/FFFFFF?text=All-in-One";

export default function RetailerYou() {
  // State management
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('distributors');
  const [connectedDistributors, setConnectedDistributors] = useState([]);
  const [connectionRequests, setConnectionRequests] = useState([]);
  const [searchResults, setSearchResults] = useState([]);
  const [suggestedDistributors, setSuggestedDistributors] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null);
  const [confirmMessage, setConfirmMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [retailerProfile, setRetailerProfile] = useState(null);

  const carouselItems = [
    {
      title: "Slege Delivery Solutions",
      description: "Forget the hectic: from loading to unloading: All Covered.",
      image: Card1,
    },
    {
      title: "Slege Billing Solutions",
      description: "1 Click and Done: No tangling in bills.",
      image: Card2,
    },
    {
      title: "Slege Business IOT Solutions",
      description: "We build, you enjoy.",
      image: Card3,
    },
    {
      title: "Slege Black ALL-IN-ONE",
      description: "Everything everywhere all at once.",
      image: Card4,
    },
  ];

  // Carousel auto-scroll logic
  const carouselRef = useRef(null);
  const [scrollPos, setScrollPos] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      if (carouselRef.current) {
        const container = carouselRef.current;
        const cardWidth = container.offsetWidth / 2;
        const maxScroll = container.scrollWidth - container.offsetWidth;

        const newPos = scrollPos + cardWidth;
        container.scrollTo({
          left: newPos >= maxScroll ? 0 : newPos,
          behavior: "smooth",
        });
        setScrollPos(newPos >= maxScroll ? 0 : newPos);
      }
    }, 3500);

    return () => clearInterval(interval);
  }, [scrollPos]);

  // Confirmation modal helper
  const showConfirmation = (message, action) => {
    setConfirmMessage(message);
    setConfirmAction(() => action);
    setShowConfirmModal(true);
  };

  const handleConfirm = () => {
    if (confirmAction) {
      confirmAction();
    }
    setShowConfirmModal(false);
    setConfirmAction(null);
    setConfirmMessage('');
  };

  const handleCancel = () => {
    setShowConfirmModal(false);
    setConfirmAction(null);
    setConfirmMessage('');
  };

  // API Functions
  const fetchConnectedDistributors = async () => {
    try {
      setLoading(true);
      const response = await API.get('/connections/retailer/distributors');
      // Ensure we always set an array
      const distributors = response.data?.distributors || response.data || [];
      setConnectedDistributors(Array.isArray(distributors) ? distributors : []);
    } catch (error) {
      console.error('Error fetching connected distributors:', error);
      setConnectedDistributors([]); // Set to empty array on error
    } finally {
      setLoading(false);
    }
  };

  const fetchConnectionRequests = async () => {
    try {
      setLoading(true);
      const response = await API.get('/connections/retailer/requests');
      const requests = response.data?.requests || response.data || [];
      setConnectionRequests(Array.isArray(requests) ? requests : []);
    } catch (error) {
      console.error('Error fetching connection requests:', error);
      setConnectionRequests([]); // Set to empty array on error
    } finally {
      setLoading(false);
    }
  };


  const searchDistributors = async (query) => {
    if (!query.trim()) return;

    try {
      setIsSearching(true);
      const response = await API.get(`/connections/search/distributors?companyName=${encodeURIComponent(query)}`);

      // Fix: Don't call response.json() on axios response
      if (response.status === 200) {
        const results = response.data?.results || response.data || [];
        setSearchResults(Array.isArray(results) ? results : []);
      }
    } catch (error) {
      console.error('Error searching distributors:', error);
      setSearchResults([]); // Set to empty array on error
    } finally {
      setIsSearching(false);
    }
  };

  const sendConnectionRequest = async (distributorId, message = '') => {
    try {
      const response = await API.post('/connections/request', {
        retailer: user.id,
        distributorId,
        message
      });

      // Fix: Don't call response.json() on axios response
      if (response.status === 200 || response.status === 201) {
        alert('Connection request sent successfully!');
        setSearchResults(prev => prev.filter(d => d.id !== distributorId));
        fetchConnectionRequests(); // Refresh requests
      } else {
        alert(response.data?.message || 'Failed to send connection request');
      }
    } catch (error) {
      console.error('Error sending connection request:', error);
      alert('Error sending connection request');
    }
  };

  const removeConnection = async (distributorId) => {
    const actualRemove = async () => {

      try {
        const response = await API.delete(`/connections/remove/${distributorId}`);
        if (response.status === 200) {
          alert('Connection removed successfully!');
          fetchConnectedDistributors(); // Refresh connected distributors
        } else {
          alert(response.data?.message || 'Failed to remove connection');
        }
      } catch (error) {
        console.error('Error removing connection:', error);
        alert('Error removing connection');
      }
    };

    showConfirmation('Are you sure you want to remove this connection?', actualRemove);
  };

  const fetchRetailerProfile = async () => {
    try {
      setLoading(true);
      const response = await API.get('/retailers/profile');
      setRetailerProfile(response.data);
    } catch (error) {
      console.error('Error fetching retailer profile:', error);
    } finally {
      setLoading(false);
    }
  };

  // Load data on component mount
  useEffect(() => {
    fetchRetailerProfile();
    fetchConnectedDistributors();
    fetchConnectionRequests();
  }, []);

  useEffect(() => {
    if (showSearchModal && retailerProfile) {
      fetchSuggestedDistributors();
    }
  }, [showSearchModal, retailerProfile]);

  const getStatusIcon = (status) => {
    switch (status) {
      case 'pending':
        return <Clock className="w-4 h-4 text-amber-600" />;
      case 'approved':
        return <CheckCircle className="w-4 h-4 text-emerald-600" />;
      case 'rejected':
        return <XCircle className="w-4 h-4 text-red-600" />;
      default:
        return <Clock className="w-4 h-4 text-slate-600" />;
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'pending':
        return 'bg-amber-100 text-amber-800 border-amber-200';
      case 'approved':
        return 'bg-emerald-100 text-emerald-800 border-emerald-200';
      case 'rejected':
        return 'bg-red-100 text-red-800 border-red-200';
      default:
        return 'bg-slate-100 text-slate-800 border-slate-200';
    }
  };

  const fetchSuggestedDistributors = async () => {
    try {
      setLoading(true);
      const pincode = retailerProfile?.retailers.pincode;
      const businessType = retailerProfile?.retailers.businessType;
      if (!pincode && !businessType) return;
      const response = await API.get(`/connections/suggestions?retailerUserId=${retailerProfile.users.id}`);
      const distributors = response.data?.distributors || response.data || [];
      setSuggestedDistributors(Array.isArray(distributors) ? distributors : []);
    } catch (error) {
      console.error('Error fetching suggested distributors:', error);
      setSuggestedDistributors([]); // Set to empty array on error
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8 font-sans">
      <div className="max-w-7xl mx-auto flex flex-col lg:flex-row gap-6">
        {/* Your Account Section */}
        <div className="flex-1 bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <h1 className="text-2xl font-bold mb-6 text-slate-900">Your Account</h1>

          {/* Account Areas */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
            <div className="flex items-center bg-white border border-slate-200 p-4 rounded-xl hover:shadow-md transition-shadow cursor-pointer group">
              <div className="w-12 h-12 bg-emerald-50 rounded-full flex items-center justify-center flex-shrink-0 group-hover:bg-emerald-100 transition-colors">
                <CircleCheck className="w-6 h-6 text-emerald-600" />
              </div>
              <div className="ml-4">
                <h3 className="text-base font-semibold text-slate-900 group-hover:text-indigo-600 transition-colors">Orders History</h3>
                <p className="text-sm text-slate-500">View and manage past orders</p>
              </div>
            </div>

            <div className="flex items-center bg-white border border-slate-200 p-4 rounded-xl hover:shadow-md transition-shadow cursor-pointer group">
              <div className="w-12 h-12 bg-amber-50 rounded-full flex items-center justify-center flex-shrink-0 group-hover:bg-amber-100 transition-colors">
                <Check className="w-6 h-6 text-amber-600" />
              </div>
              <div className="ml-4">
                <h3 className="text-base font-semibold text-slate-900 group-hover:text-indigo-600 transition-colors">Login & Security</h3>
                <p className="text-sm text-slate-500">Update password and settings</p>
              </div>
            </div>

            <div className="flex items-center bg-white border border-slate-200 p-4 rounded-xl hover:shadow-md transition-shadow cursor-pointer group">
              <div className="w-12 h-12 bg-red-50 rounded-full flex items-center justify-center flex-shrink-0 group-hover:bg-red-100 transition-colors">
                <Trash className="w-6 h-6 text-red-600" />
              </div>
              <div className="ml-4">
                <h3 className="text-base font-semibold text-slate-900 group-hover:text-indigo-600 transition-colors">Your Addresses</h3>
                <p className="text-sm text-slate-500">Manage delivery addresses</p>
              </div>
            </div>

            <div className="flex items-center bg-white border border-slate-200 p-4 rounded-xl hover:shadow-md transition-shadow cursor-pointer group">
              <div className="w-12 h-12 bg-purple-50 rounded-full flex items-center justify-center flex-shrink-0 group-hover:bg-purple-100 transition-colors">
                <CreditCard className="w-6 h-6 text-purple-600" />
              </div>
              <div className="ml-4">
                <h3 className="text-base font-semibold text-slate-900 group-hover:text-indigo-600 transition-colors">Cards & Payments</h3>
                <p className="text-sm text-slate-500">Manage payment methods</p>
              </div>
            </div>

            <div className="flex items-center bg-white border border-slate-200 p-4 rounded-xl hover:shadow-md transition-shadow cursor-pointer group sm:col-span-2">
              <div className="w-12 h-12 bg-pink-50 rounded-full flex items-center justify-center flex-shrink-0 group-hover:bg-pink-100 transition-colors">
                <Phone className="w-6 h-6 text-pink-600" />
              </div>
              <div className="ml-4">
                <h3 className="text-base font-semibold text-slate-900 group-hover:text-indigo-600 transition-colors">Contact Us</h3>
                <p className="text-sm text-slate-500">Reach out for support or inquiries</p>
              </div>
            </div>
          </div>

          {/* Carousel Section */}
          <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl">
            <h2 className="text-lg font-bold text-slate-900 mb-4">Discover More with Sledje</h2>
            <div
              ref={carouselRef}
              className="flex gap-4 overflow-x-auto no-scrollbar scroll-smooth pb-2"
              style={{ scrollBehavior: "smooth" }}
            >
              {carouselItems.map((item, idx) => (
                <div
                  key={idx}
                  className="min-w-[80%] sm:min-w-[45%] bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex-shrink-0"
                >
                  <div className="aspect-video bg-slate-100 rounded-lg mb-3 overflow-hidden">
                    <img
                      src={item.image}
                      alt={item.title}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <h3 className="text-base font-bold text-slate-900 mb-1">{item.title}</h3>
                  <p className="text-sm text-slate-500">{item.description}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Personal Details Section */}
        <div className="w-full lg:w-2/5 bg-white rounded-xl shadow-sm border border-slate-200 p-6 h-fit">
          <h2 className="text-xl font-bold text-slate-900 mb-4">Personal Details</h2>
          <div className="flex flex-col sm:flex-row items-center sm:items-start bg-slate-50 p-4 rounded-xl border border-slate-200 mb-6">
            <div className="w-20 h-20 bg-slate-200 rounded-full overflow-hidden flex-shrink-0 mb-3 sm:mb-0 border-2 border-white shadow-sm">
              <img src={GunjanImage} alt="Owner" className="w-full h-full object-cover" />
            </div>
            <div className="sm:ml-4 text-center sm:text-left w-full">
              {retailerProfile ? (
                <>
                  <h3 className="text-lg font-semibold text-slate-900">
                    {retailerProfile.retailers.ownerName}
                  </h3>
                  <p className="text-sm text-slate-600 font-medium">
                    {retailerProfile.retailers.businessName}
                  </p>
                  <div className="mt-2 space-y-1">
                    <p className="text-xs text-slate-500 flex items-center justify-center sm:justify-start">
                      <span className="w-16 text-slate-400">Email:</span>
                      {retailerProfile.users.email}
                    </p>
                    <p className="text-xs text-slate-500 flex items-center justify-center sm:justify-start">
                      <span className="w-16 text-slate-400">Phone:</span>
                      {retailerProfile.users.phone}
                    </p>
                  </div>
                </>
              ) : (
                <div className="space-y-2 flex flex-col items-center sm:items-start">
                  <Skeleton className="h-5 w-40" />
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-3 w-48 mt-1" />
                  <Skeleton className="h-3 w-36" />
                </div>
              )}
            </div>
          </div>

          {/* Distributor Management Section */}
          <div className="bg-white rounded-xl">
            <h3 className="text-lg font-bold text-slate-900 mb-4">Distributor Network</h3>

            {/* Tab Navigation */}
            <div className="flex mb-4 bg-slate-100 rounded-lg p-1">
              <button
                onClick={() => setActiveTab('distributors')}
                className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-all duration-200 ${activeTab === 'distributors'
                    ? 'bg-white text-indigo-600 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                  }`}
              >
                <Building2 className="w-4 h-4 inline mr-2" />
                Connected ({connectedDistributors.length})
              </button>
              <button
                onClick={() => setActiveTab('requests')}
                className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-all duration-200 ${activeTab === 'requests'
                    ? 'bg-white text-indigo-600 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                  }`}
              >
                <Clock className="w-4 h-4 inline mr-2" />
                Requests ({connectionRequests.length})
              </button>
            </div>

            {/* Add New Distributor Button */}
            <button
              onClick={() => setShowSearchModal(true)}
              className="w-full mb-4 bg-indigo-600 hover:bg-indigo-700 text-white py-2.5 px-4 rounded-lg transition-colors flex items-center justify-center font-medium shadow-sm"
            >
              <Plus className="w-4 h-4 mr-2" />
              Find New Distributors
            </button>

            {/* Content based on active tab */}
            <div className="max-h-[400px] overflow-y-auto pr-1 custom-scrollbar">
              {activeTab === 'distributors' && (
                <div className="space-y-3">
                  {loading ? (
                    <div className="space-y-3">
                      {[0, 1, 2].map((i) => (
                        <div key={i} className="bg-white p-4 rounded-xl border border-slate-200 space-y-2">
                          <Skeleton className="h-4 w-2/5" />
                          <Skeleton className="h-3 w-3/5" />
                          <Skeleton className="h-3 w-1/4" />
                        </div>
                      ))}
                    </div>
                  ) : connectedDistributors.length === 0 ? (
                    <div className="text-center py-8 bg-slate-50 rounded-xl border border-slate-200 border-dashed">
                      <Building2 className="w-12 h-12 mx-auto mb-2 text-slate-300" />
                      <p className="text-slate-900 font-medium">No connections yet</p>
                      <p className="text-xs text-slate-500 mt-1">Start by finding distributors</p>
                    </div>
                  ) : (
                    connectedDistributors.map((distributor) => (
                      <div
                        key={distributor.id}
                        className="flex flex-col sm:flex-row sm:justify-between sm:items-center bg-white p-4 rounded-xl border border-slate-200 hover:border-indigo-200 hover:shadow-sm transition-all group"
                      >
                        <div className="flex-1 mb-2 sm:mb-0">
                          <p className="text-slate-900 font-semibold text-sm">{distributor.companyName}</p>
                          <p className="text-slate-500 text-xs mt-0.5">{distributor.ownerName} • {distributor.location}</p>
                          <p className="text-slate-400 text-xs mt-0.5">{distributor.phone}</p>
                        </div>
                        <button
                          onClick={() => removeConnection(distributor.id)}
                          className="bg-red-50 hover:bg-red-100 text-red-600 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors opacity-0 group-hover:opacity-100"
                        >
                          Remove
                        </button>
                      </div>
                    ))
                  )}
                </div>
              )}

              {activeTab === 'requests' && (
                <div className="space-y-3">
                  {loading ? (
                    <div className="space-y-3">
                      {[0, 1, 2].map((i) => (
                        <div key={i} className="bg-white p-4 rounded-xl border border-slate-200 space-y-2">
                          <Skeleton className="h-4 w-2/5" />
                          <Skeleton className="h-3 w-3/5" />
                        </div>
                      ))}
                    </div>
                  ) : connectionRequests.length === 0 ? (
                    <div className="text-center py-8 bg-slate-50 rounded-xl border border-slate-200 border-dashed">
                      <Clock className="w-12 h-12 mx-auto mb-2 text-slate-300" />
                      <p className="text-slate-900 font-medium">No pending requests</p>
                    </div>
                  ) : (
                    connectionRequests.map((request) => (
                      <div
                        key={request.id}
                        className="bg-white p-4 rounded-xl border border-slate-200 hover:shadow-sm transition-all"
                      >
                        <div className="flex justify-between items-start mb-2">
                          <div className="flex-1">
                            <p className="text-slate-900 font-semibold text-sm">
                              {request.distributor.companyName}
                            </p>
                            <p className="text-slate-500 text-xs mt-0.5">{request.distributor.ownerName}</p>
                          </div>
                          <div className={`flex items-center px-2 py-1 rounded-full text-xs font-medium border ${getStatusColor(request.status)}`}>
                            {getStatusIcon(request.status)}
                            <span className="ml-1 capitalize">{request.status}</span>
                          </div>
                        </div>
                        <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-50">
                          <p className="text-xs text-slate-400">
                            Sent: {new Date(request.createdAt).toLocaleDateString()}
                          </p>
                          {request.message && (
                            <p className="text-xs text-slate-500 italic max-w-[150px] truncate">"{request.message}"</p>
                          )}
                        </div>
                        {request.rejectionReason && (
                          <p className="text-xs text-red-600 mt-2 bg-red-50 p-2 rounded-lg">Reason: {request.rejectionReason}</p>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Search Modal */}
      {showSearchModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-2xl max-h-[80vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-slate-900">Find Distributors</h3>
              <button
                onClick={() => setShowSearchModal(false)}
                className="p-2 hover:bg-slate-100 rounded-lg transition-colors text-slate-400 hover:text-slate-600"
              >
                <XCircle className="w-6 h-6" />
              </button>
            </div>

            {/* Search Bar */}
            <div className="relative mb-6">
              <input
                type="text"
                placeholder="Search by company name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && searchDistributors(searchQuery)}
                className="w-full p-3 pl-10 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
              <Search className="absolute left-3 top-3.5 w-5 h-5 text-slate-400" />
              <button
                onClick={() => searchDistributors(searchQuery)}
                disabled={isSearching}
                className="absolute right-2 top-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-1.5 rounded-lg text-sm font-medium disabled:opacity-50 transition-colors"
              >
                {isSearching ? 'Searching...' : 'Search'}
              </button>
            </div>

            {/* Search Results */}
            <div className="space-y-4">
              {searchQuery.trim() === "" && suggestedDistributors.length === 0 && (
                <div className="text-center text-slate-500 py-12 bg-slate-50 rounded-xl border border-slate-200 border-dashed">
                  <p>No distributor suggestions found for your area.</p>
                </div>
              )}

              {searchQuery.trim() === "" && suggestedDistributors.length > 0 && (
                <div>
                  <h4 className="font-semibold text-slate-900 mb-3 flex items-center">
                    <Building2 className="w-4 h-4 mr-2 text-indigo-600" />
                    Suggested Distributors
                  </h4>
                  <div className="space-y-3">
                    {suggestedDistributors.map((distributor) => (
                      <div key={distributor.id} className="bg-white border border-slate-200 p-4 rounded-xl hover:border-indigo-200 hover:shadow-sm transition-all">
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <h4 className="font-semibold text-slate-900">{distributor.companyName}</h4>
                            <p className="text-sm text-slate-600 mt-0.5">{distributor.ownerName} • {distributor.businessType}</p>
                            <p className="text-xs text-slate-500 mt-1">{distributor.location}</p>
                          </div>
                          {!distributor.requestStatus && !distributor.connectionStatus ? (
                            <button
                              onClick={() => sendConnectionRequest(distributor.id)}
                              className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center"
                            >
                              <UserPlus className="w-4 h-4 mr-1.5" /> Connect
                            </button>
                          ) : (
                            <span className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${distributor.connectionStatus ? 'bg-emerald-50 text-emerald-700 border-emerald-100' :
                                distributor.requestStatus === 'pending' ? 'bg-amber-50 text-amber-700 border-amber-100' :
                                  'bg-slate-50 text-slate-600 border-slate-100'
                              }`}>
                              {distributor.connectionStatus ? "Connected" :
                                distributor.requestStatus === "pending" ? "Requested" :
                                  distributor.requestStatus === "rejected" ? "Rejected" : "Approved"}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Existing search results rendering */}
              {searchResults.length === 0 && !isSearching && searchQuery.trim() !== "" ? (
                <div className="text-center py-12 bg-slate-50 rounded-xl border border-slate-200 border-dashed">
                  <Search className="w-12 h-12 mx-auto mb-2 text-slate-300" />
                  <p className="text-slate-900 font-medium">No distributors found</p>
                  <p className="text-sm text-slate-500">Try a different search term</p>
                </div>
              ) : (
                searchResults.map((distributor) => (
                  <div
                    key={distributor.id}
                    className="bg-white border border-slate-200 p-4 rounded-xl hover:border-indigo-200 hover:shadow-sm transition-all"
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <h4 className="font-semibold text-slate-900">{distributor.companyName}</h4>
                        <p className="text-sm text-slate-600 mt-0.5">{distributor.ownerName} • {distributor.businessType}</p>
                        <p className="text-xs text-slate-500 mt-1">{distributor.location}</p>
                      </div>
                      <button
                        onClick={() => sendConnectionRequest(distributor.id)}
                        className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center"
                      >
                        <UserPlus className="w-4 h-4 mr-1.5" />
                        Connect
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Custom Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl">
            <div className="flex items-center mb-4">
              <div className="w-12 h-12 bg-red-50 rounded-full flex items-center justify-center flex-shrink-0 mr-4">
                <AlertTriangle className="w-6 h-6 text-red-600" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">Confirm Action</h3>
                <p className="text-sm text-slate-500">This action cannot be undone.</p>
              </div>
            </div>

            <p className="text-slate-700 mb-6">{confirmMessage}</p>

            <div className="flex justify-end space-x-3">
              <button
                onClick={handleCancel}
                className="px-4 py-2 text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirm}
                className="px-4 py-2 text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors font-medium shadow-sm"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}