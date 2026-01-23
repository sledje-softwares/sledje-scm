import { useEffect, useRef, useState } from "react";
import API from "../../api";
import {
  Package, Settings, MapPin, CreditCard, Phone, Users, UserPlus, Check, X, Search, Mail, Building,
  Clock, ChevronDown, ChevronUp, Filter, Send, AlertCircle, UserCheck
} from "lucide-react";
import Card1 from "../../assets/carousel/Card1.png";
import Card2 from "../../assets/carousel/Card2.png";
import Card3 from "../../assets/carousel/Card3.png";
import Card4 from "../../assets/carousel/Card4.png";
import NishantImage from "../../assets/founders/N.png";

// --- Connection Management Modal Component ---
const ConnectionModal = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState('requests');
  const [connectionRequests, setConnectionRequests] = useState([]);
  const [connectedRetailers, setConnectedRetailers] = useState([]);
  const [searchResults, setSearchResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFilters, setSearchFilters] = useState({
    location: '',
    businessType: '',
    pincode: ''
  });
  const [showFilters, setShowFilters] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [suggestedRetailers, setSuggestedRetailers] = useState([]);

  // Fetch connection requests and connected retailers from API
  useEffect(() => {
    if (isOpen) {
      fetchConnectionRequests();
      fetchConnectedRetailers();
      fetchSuggestedRetailers();
      setSearchResults([]); // Clear search results on open
    }
    // eslint-disable-next-line
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && activeTab === 'search') {
      fetchSuggestedRetailers();
    }
    // eslint-disable-next-line
  }, [isOpen, activeTab]);

  const fetchConnectionRequests = async () => {
    setLoading(true);
    try {
      const res = await API.get("/connections/distributor/requests");
      setConnectionRequests(res.data.requests || []);
    } catch (err) {
      setConnectionRequests([]);
    }
    setLoading(false);
  };

  const fetchConnectedRetailers = async () => {
    setLoading(true);
    try {
      const res = await API.get("/connections/distributor/retailers");
      setConnectedRetailers(res.data.retailers || []);
    } catch (err) {
      setConnectedRetailers([]);
    }
    setLoading(false);
  };

  const fetchSuggestedRetailers = async () => {
    setLoading(true);
    try {
      const res = await API.get("/connections/suggest/retailers");
      setSuggestedRetailers(res.data.retailers || []);
    } catch (err) {
      setSuggestedRetailers([]);
    }
    setLoading(false);
  };

  // Search retailers using API
  const handleSearch = async () => {
    setLoading(true);
    try {
      const params = {};
      if (searchQuery) params.businessName = searchQuery;
      if (searchFilters.location) params.location = searchFilters.location;
      if (searchFilters.businessType) params.businessType = searchFilters.businessType;
      if (searchFilters.pincode) params.pincode = searchFilters.pincode;
      const res = await API.get("/connections/retailers/search", { params });
      setSearchResults(res.data.retailers || []);
    } catch (err) {
      setSearchResults([]);
    }
    setLoading(false);
  };

  // Accept or reject a connection request
  const handleRequestResponse = async (requestId, action, rejectionReason = '') => {
    setLoading(true);
    try {
      await API.put(`/connections/respond/${requestId}`, { action, rejectionReason });
      await fetchConnectionRequests();
      await fetchConnectedRetailers();
      setSelectedRequest(null);
    } catch (err) {
      // Optionally show error
    }
    setLoading(false);
  };

  // Send connection request to a retailer
  const sendConnectionRequest = async (retailerId, message) => {
    setLoading(true);
    try {
      await API.post("/connections/request", { retailerId, message });
      // Optionally show a toast/snackbar
    } catch (err) {
      // Optionally show error
    }
    setLoading(false);
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const ConnectionRequestCard = ({ request }) => (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 mb-3 hover:shadow-md transition-all duration-300">
      <div className="flex flex-col sm:flex-row justify-between items-start gap-3">
        <div className="flex-1">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full flex items-center justify-center text-white font-bold text-sm shadow-sm">
              {request.retailer.businessName.charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <h3 className="text-lg font-bold text-slate-900 truncate">{request.retailer.businessName}</h3>
                <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 text-xs rounded-full font-medium border border-indigo-100">
                  {request.retailer.businessType}
                </span>
              </div>
              <p className="text-slate-600 text-sm mb-2">Owner: {request.retailer.ownerName}</p>
              <div className="flex flex-wrap gap-3 text-xs text-slate-500 mb-2">
                <div className="flex items-center gap-1">
                  <Mail className="w-3 h-3" />
                  <span className="truncate">{request.retailer.email}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Phone className="w-3 h-3" />
                  {request.retailer.phone}
                </div>
                <div className="flex items-center gap-1">
                  <MapPin className="w-3 h-3" />
                  {request.retailer.location}
                </div>
              </div>
              {request.message && (
                <div className="bg-slate-50 p-2 rounded-lg mb-2 border border-slate-100">
                  <p className="text-slate-700 text-sm italic">"{request.message}"</p>
                </div>
              )}
              <div className="flex items-center gap-1 text-xs text-slate-400">
                <Clock className="w-3 h-3" />
                {formatDate(request.createdAt)}
              </div>
            </div>
          </div>
        </div>

        {request.status === 'pending' && (
          <div className="flex gap-2">
            <button
              onClick={() => handleRequestResponse(request.id, 'approve')}
              disabled={loading}
              className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 shadow-sm"
            >
              <Check className="w-3 h-3" />
              Accept
            </button>
            <button
              onClick={() => setSelectedRequest(request)}
              disabled={loading}
              className="flex items-center gap-1 px-3 py-1.5 bg-white border border-red-200 text-red-600 hover:bg-red-50 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
            >
              <X className="w-3 h-3" />
              Reject
            </button>
          </div>
        )}
      </div>
    </div>
  );

  const RetailerCard = ({ retailer, isSearch = false }) => {
    const [showSendRequest, setShowSendRequest] = useState(false);
    const [message, setMessage] = useState('');

    return (
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 mb-3 hover:shadow-md transition-all duration-300">
        <div className="flex flex-col sm:flex-row justify-between items-start gap-3">
          <div className="flex-1">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-full flex items-center justify-center text-white font-bold text-sm shadow-sm">
                {retailer.businessName.charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <h3 className="text-lg font-bold text-slate-900 truncate">{retailer.businessName}</h3>
                  <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 text-xs rounded-full font-medium border border-emerald-100">
                    {retailer.businessType}
                  </span>
                </div>
                <p className="text-slate-600 text-sm mb-2">Owner: {retailer.ownerName}</p>
                <div className="flex flex-wrap gap-3 text-xs text-slate-500">
                  <div className="flex items-center gap-1">
                    <Mail className="w-3 h-3" />
                    <span className="truncate">{retailer.email}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Phone className="w-3 h-3" />
                    {retailer.phone}
                  </div>
                  <div className="flex items-center gap-1">
                    <MapPin className="w-3 h-3" />
                    {retailer.location}
                  </div>
                  {retailer.pincode && (
                    <div className="flex items-center gap-1">
                      <Building className="w-3 h-3" />
                      {retailer.pincode}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {isSearch && (
            <button
              onClick={() => setShowSendRequest(!showSendRequest)}
              className="flex items-center gap-1 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors shadow-sm"
            >
              <Send className="w-3 h-3" />
              Connect
            </button>
          )}
        </div>

        {showSendRequest && (
          <div
            className="mt-3 p-3 bg-slate-50 rounded-lg border border-slate-200"
            onClick={(e) => e.stopPropagation()}
          >
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Add a message (optional)"
              className="w-full p-2 border border-slate-300 rounded-lg resize-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm bg-white"
              rows="2"
            />
            <div className="flex gap-2 mt-2">
              <button
                onClick={() => {
                  sendConnectionRequest(retailer.id, message);
                  setShowSendRequest(false);
                  setMessage('');
                }}
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors shadow-sm"
              >
                Send Request
              </button>
              <button
                onClick={() => {
                  setShowSendRequest(false);
                  setMessage('');
                }}
                className="px-3 py-1.5 bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 rounded-lg text-sm font-medium transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

      </div>
    );
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-6xl w-full h-[90vh] overflow-hidden flex flex-col border border-slate-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-white border-b border-slate-200 p-4 flex justify-between items-center">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Connection Management</h1>
            <p className="text-slate-500 text-sm">Manage your retailer connections and expand your network</p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition-colors p-2 hover:bg-slate-100 rounded-full"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="border-b border-slate-200 flex-shrink-0 bg-slate-50/50">
          <nav className="flex space-x-6 px-6">
            <button
              onClick={() => setActiveTab('requests')}
              className={`py-3 px-2 border-b-2 font-medium text-sm transition-colors ${activeTab === 'requests'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
            >
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4" />
                Requests ({connectionRequests.filter(r => r.status === 'pending').length})
              </div>
            </button>
            <button
              onClick={() => setActiveTab('connected')}
              className={`py-3 px-2 border-b-2 font-medium text-sm transition-colors ${activeTab === 'connected'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
            >
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4" />
                Connected ({connectedRetailers.length})
              </div>
            </button>
            <button
              onClick={() => setActiveTab('search')}
              className={`py-3 px-2 border-b-2 font-medium text-sm transition-colors ${activeTab === 'search'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
            >
              <div className="flex items-center gap-2">
                <UserPlus className="w-4 h-4" />
                Find New
              </div>
            </button>
          </nav>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6 bg-slate-50">
          {activeTab === 'requests' && (
            <div>
              {connectionRequests.filter(r => r.status === 'pending').length === 0 ? (
                <div className="text-center py-16">
                  <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-4 border border-slate-200 shadow-sm">
                    <AlertCircle className="w-8 h-8 text-slate-300" />
                  </div>
                  <h3 className="text-lg font-semibold text-slate-900 mb-1">No Pending Requests</h3>
                  <p className="text-slate-500">You don't have any pending connection requests at the moment.</p>
                </div>
              ) : (
                <div className="max-w-3xl mx-auto">
                  {connectionRequests
                    .filter(r => r.status === 'pending')
                    .map(request => (
                      <ConnectionRequestCard key={request.id} request={request} />
                    ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'connected' && (
            <div>
              {connectedRetailers.length === 0 ? (
                <div className="text-center py-16">
                  <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-4 border border-slate-200 shadow-sm">
                    <Users className="w-8 h-8 text-slate-300" />
                  </div>
                  <h3 className="text-lg font-semibold text-slate-900 mb-1">No Connected Retailers</h3>
                  <p className="text-slate-500">Start connecting with retailers to grow your business network.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {connectedRetailers.map(retailer => (
                    <RetailerCard key={retailer.id} retailer={retailer} />
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'search' && (
            <div className="max-w-4xl mx-auto">
              {/* Search and Filters */}
              <div className="mb-6 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                <div className="flex flex-col sm:flex-row gap-3 mb-3">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search by business name..."
                      className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
                    />
                  </div>
                  <button
                    onClick={() => setShowFilters(!showFilters)}
                    className="flex items-center justify-center gap-1 px-3 py-2 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors text-sm text-slate-700"
                  >
                    <Filter className="w-4 h-4" />
                    {showFilters ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={handleSearch}
                    disabled={loading}
                    className="flex items-center justify-center gap-1 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 text-sm shadow-sm"
                  >
                    <Search className="w-4 h-4" />
                    Search
                  </button>
                </div>

                {showFilters && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-3 border-t border-slate-100">
                    <input
                      type="text"
                      value={searchFilters.location}
                      onChange={(e) => setSearchFilters(prev => ({ ...prev, location: e.target.value }))}
                      placeholder="Location"
                      className="p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
                    />
                    <input
                      type="text"
                      value={searchFilters.businessType}
                      onChange={(e) => setSearchFilters(prev => ({ ...prev, businessType: e.target.value }))}
                      placeholder="Business Type"
                      className="p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
                    />
                    <input
                      type="text"
                      value={searchFilters.pincode}
                      onChange={(e) => setSearchFilters(prev => ({ ...prev, pincode: e.target.value }))}
                      placeholder="Pincode"
                      className="p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
                    />
                  </div>
                )}
              </div>

              {/* Search Results */}
              {loading ? (
                <div className="text-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto"></div>
                  <p className="text-slate-500 mt-4">Searching for retailers...</p>
                </div>
              ) : (
                <div>
                  {searchResults.length === 0 ? (
                    <div className="text-center py-12">
                      <Search className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                      <h3 className="text-lg font-semibold text-slate-900 mb-1">No Results Found</h3>
                      <p className="text-slate-500">Try adjusting your search criteria to find retailers.</p>
                    </div>
                  ) : (
                    <div>
                      <div className="mb-3 text-sm text-slate-500 font-medium">
                        Found {searchResults.length} retailers
                      </div>
                      {searchResults.map(retailer => (
                        <RetailerCard key={retailer.id} retailer={retailer} isSearch={true} />
                      ))}
                    </div>
                  )}
                </div>
              )}

              {searchQuery.trim() === "" && suggestedRetailers.length > 0 && (
                <div className="mt-8">
                  <h4 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
                    <UserPlus className="w-4 h-4 text-indigo-600" />
                    Suggested Retailers
                  </h4>
                  {suggestedRetailers.map((retailer) => (
                    <RetailerCard key={retailer.id} retailer={retailer} isSearch={true} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Rejection Modal */}
        {selectedRequest && (
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-[60]">
            <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 border border-slate-200">
              <h3 className="text-lg font-bold text-slate-900 mb-2">Reject Connection Request</h3>
              <p className="text-slate-600 mb-4 text-sm">
                Are you sure you want to reject the connection request from <span className="font-semibold">{selectedRequest.retailer.businessName}</span>?
              </p>
              <textarea
                placeholder="Reason for rejection (optional)"
                className="w-full p-3 border border-slate-300 rounded-lg resize-none focus:ring-2 focus:ring-red-500 focus:border-transparent mb-4 text-sm"
                rows="3"
              />
              <div className="flex gap-3">
                <button
                  onClick={() => handleRequestResponse(selectedRequest.id, 'reject', 'Connection rejected by distributor')}
                  className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors text-sm shadow-sm"
                >
                  Reject Request
                </button>
                <button
                  onClick={() => setSelectedRequest(null)}
                  className="flex-1 px-4 py-2 bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 rounded-lg font-medium transition-colors text-sm"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

export default function DistributorProfile() {
  const [isConnectionModalOpen, setIsConnectionModalOpen] = useState(false);
  const [distributor, setDistributor] = useState(null);
  const [loading, setLoading] = useState(true);

  const carouselItems = [
    {
      title: "Slege Distributor Insights",
      description: "Track retailers, sales, orders all in one place.",
      image: Card1,
    },
    {
      title: "Automated Billing",
      description: "Focus on business, let us handle the books.",
      image: Card2,
    },
    {
      title: "Logistics Made Easy",
      description: "Plan delivery and pickups without calls.",
      image: Card3,
    },
    {
      title: "Everything Connected",
      description: "Your business. Your control. Anywhere.",
      image: Card4,
    },
  ];

  const carouselRef = useRef(null);
  const [scrollPos, setScrollPos] = useState(0);

  // Fetch distributor profile from backend
  useEffect(() => {
    const fetchDistributor = async () => {
      setLoading(true);
      try {
        const res = await API.get("/distributors/profile");
        setDistributor(res.data);
      } catch (err) {
        setDistributor(null);
      }
      setLoading(false);
    };
    fetchDistributor();
  }, []);

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

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8 flex flex-col lg:flex-row gap-6 font-sans">
      <div className="flex-1 bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
        <h1 className="text-2xl md:text-3xl font-bold mb-6 text-slate-900">Distributor Dashboard</h1>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-10">
          <div className="flex items-center bg-slate-50 p-4 rounded-xl border border-slate-200 hover:border-indigo-200 transition-colors group">
            <div className="w-12 h-12 bg-white rounded-lg flex items-center justify-center shadow-sm border border-slate-100 group-hover:scale-110 transition-transform">
              <Package className="w-6 h-6 text-indigo-600" />
            </div>
            <div className="ml-4">
              <h3 className="text-base font-bold text-slate-900">Manage Orders</h3>
              <p className="text-xs text-slate-500 mt-1">View and fulfill incoming retailer requests.</p>
            </div>
          </div>

          <div className="flex items-center bg-slate-50 p-4 rounded-xl border border-slate-200 hover:border-indigo-200 transition-colors group">
            <div className="w-12 h-12 bg-white rounded-lg flex items-center justify-center shadow-sm border border-slate-100 group-hover:scale-110 transition-transform">
              <Settings className="w-6 h-6 text-slate-600" />
            </div>
            <div className="ml-4">
              <h3 className="text-base font-bold text-slate-900">Account Settings</h3>
              <p className="text-xs text-slate-500 mt-1">Configure your distributor profile and regions.</p>
            </div>
          </div>

          <div className="flex items-center bg-slate-50 p-4 rounded-xl border border-slate-200 hover:border-indigo-200 transition-colors group">
            <div className="w-12 h-12 bg-white rounded-lg flex items-center justify-center shadow-sm border border-slate-100 group-hover:scale-110 transition-transform">
              <MapPin className="w-6 h-6 text-emerald-600" />
            </div>
            <div className="ml-4">
              <h3 className="text-base font-bold text-slate-900">Delivery Zones</h3>
              <p className="text-xs text-slate-500 mt-1">Set and update your delivery service areas.</p>
            </div>
          </div>

          <div className="flex items-center bg-slate-50 p-4 rounded-xl border border-slate-200 hover:border-indigo-200 transition-colors group">
            <div className="w-12 h-12 bg-white rounded-lg flex items-center justify-center shadow-sm border border-slate-100 group-hover:scale-110 transition-transform">
              <CreditCard className="w-6 h-6 text-purple-600" />
            </div>
            <div className="ml-4">
              <h3 className="text-base font-bold text-slate-900">Payments</h3>
              <p className="text-xs text-slate-500 mt-1">Track payments received from retailers.</p>
            </div>
          </div>

          {/* New Connection Management Card */}
          <div
            className="flex items-center bg-slate-50 p-4 rounded-xl border border-slate-200 hover:border-indigo-300 hover:shadow-md transition-all cursor-pointer group"
            onClick={() => setIsConnectionModalOpen(true)}
          >
            <div className="w-12 h-12 bg-white rounded-lg flex items-center justify-center shadow-sm border border-slate-100 group-hover:scale-110 transition-transform">
              <UserCheck className="w-6 h-6 text-amber-600" />
            </div>
            <div className="ml-4">
              <h3 className="text-base font-bold text-slate-900">Manage Connections</h3>
              <p className="text-xs text-slate-500 mt-1">Connect with retailers and manage partnerships.</p>
            </div>
          </div>

          <div className="flex items-center bg-slate-50 p-4 rounded-xl border border-slate-200 hover:border-indigo-200 transition-colors group">
            <div className="w-12 h-12 bg-white rounded-lg flex items-center justify-center shadow-sm border border-slate-100 group-hover:scale-110 transition-transform">
              <Phone className="w-6 h-6 text-pink-600" />
            </div>
            <div className="ml-4">
              <h3 className="text-base font-bold text-slate-900">Support</h3>
              <p className="text-xs text-slate-500 mt-1">Need help? Get in touch with our team.</p>
            </div>
          </div>
        </div>

        <div className="bg-slate-50 p-6 rounded-xl border border-slate-200">
          <h2 className="text-lg font-bold text-slate-900 mb-4">What’s New</h2>
          <div ref={carouselRef} className="flex gap-4 overflow-x-auto no-scrollbar scroll-smooth pb-2">
            {carouselItems.map((item, idx) => (
              <div
                key={idx}
                className="min-w-[80%] sm:min-w-[45%] bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex-shrink-0"
              >
                <img
                  src={item.image}
                  alt={item.title}
                  className="h-32 w-full object-cover rounded-lg mb-3"
                />
                <h3 className="text-base font-bold text-slate-900">{item.title}</h3>
                <p className="text-sm text-slate-500 mt-1">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="w-full lg:w-2/5 bg-white rounded-2xl shadow-sm border border-slate-200 p-6 h-fit sticky top-6">
        <h2 className="text-xl font-bold text-slate-900 mb-6">Your Profile</h2>
        {loading ? (
          <div className="text-center text-slate-500 py-8">Loading profile...</div>
        ) : distributor ? (
          <>
            <div className="flex flex-col items-center text-center mb-8">
              <div className="relative w-24 h-24 bg-slate-100 rounded-full overflow-hidden group mb-4 ring-4 ring-slate-50">
                <img
                  src={distributor.profilePictureUrl || NishantImage}
                  alt="Distributor"
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                  <label htmlFor="profile-upload" className="cursor-pointer text-white text-xs font-bold">
                    Change
                  </label>
                  <input
                    id="profile-upload"
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files[0];
                      if (!file) return;

                      const formData = new FormData();
                      formData.append("image", file);

                      try {
                        const res = await API.post("/upload/profile-picture", formData, {
                          headers: { "Content-Type": "multipart/form-data" }
                        });
                        setDistributor(prev => ({ ...prev, profilePictureUrl: res.data.url }));
                      } catch (err) {
                        console.error("Upload failed", err);
                        alert("Failed to upload image");
                      }
                    }}
                  />
                </div>
              </div>
              <h3 className="text-xl font-bold text-slate-900">{distributor.ownerName}</h3>
              <p className="text-sm text-slate-500">{distributor.companyName}</p>
              <div className="mt-2 px-3 py-1 bg-indigo-50 text-indigo-700 text-xs font-medium rounded-full border border-indigo-100 inline-block">
                {distributor.businessType}
              </div>
            </div>

            <div className="space-y-4 mb-8">
              <div className="flex items-center gap-3 text-sm">
                <Mail className="w-4 h-4 text-slate-400" />
                <span className="text-slate-600 break-all">{distributor.email}</span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <Phone className="w-4 h-4 text-slate-400" />
                <span className="text-slate-600">{distributor.phone}</span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <Building className="w-4 h-4 text-slate-400" />
                <span className="text-slate-600">GST: {distributor.gstNumber}</span>
              </div>
              <div className="flex items-start gap-3 text-sm">
                <MapPin className="w-4 h-4 text-slate-400 mt-0.5" />
                <span className="text-slate-600">
                  {distributor.address}, {distributor.location} - {distributor.pincode}
                </span>
              </div>
            </div>

            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
              <h3 className="text-sm font-bold text-slate-900 mb-3 flex items-center justify-between">
                <span>Top Retailers</span>
                <span className="text-xs font-normal text-slate-500">{distributor.retailers?.length || 0} connected</span>
              </h3>
              <div className="overflow-y-auto pr-2 space-y-2" style={{ maxHeight: "200px" }}>
                {distributor.retailers && distributor.retailers.length > 0 ? (
                  distributor.retailers.map((retailer, index) => (
                    <div
                      key={retailer.id || index}
                      className="flex items-center justify-between bg-white p-3 rounded-lg border border-slate-200 shadow-sm"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-700 text-xs font-bold">
                          {retailer.businessName.charAt(0)}
                        </div>
                        <div>
                          <p className="text-slate-900 font-medium text-sm">{retailer.businessName}</p>
                          <p className="text-slate-500 text-xs">{retailer.phone}</p>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-4 text-slate-400 text-sm">No connected retailers yet.</div>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="text-center text-red-600 py-8">Failed to load profile.</div>
        )}
      </div>

      {isConnectionModalOpen && (
        <ConnectionModal
          isOpen={isConnectionModalOpen}
          onClose={() => setIsConnectionModalOpen(false)}
        />
      )}
    </div>
  );
}
