import React, { useState, useEffect } from 'react';
import API from "../../api";
import {
  ShoppingCart, Clock, CheckCircle, XCircle, AlertTriangle, Eye, Plus, Filter, Search, Bell,
  Package, Calendar, DollarSign, ArrowRight, RefreshCw, FileText, X, Check, Edit, Truck,
  User, Phone, Mail, MapPin, ArrowLeft, Trash2, Save, Download, Upload, MessageSquare,
  History, Settings, AlertCircle
} from 'lucide-react';

const RetailerOrders = () => {
  const [orders, setOrders] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [activeTab, setActiveTab] = useState('all');
  const [showNotifications, setShowNotifications] = useState(false);
  const [showCreateOrder, setShowCreateOrder] = useState(false);
  const [showOrderDetails, setShowOrderDetails] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [distributors, setDistributors] = useState([]);
  const [products, setProducts] = useState([]);
  const [createOrderData, setCreateOrderData] = useState({
    distributorId: '',
    items: [],
    notes: ''
  });

  const [editMode, setEditMode] = useState(false);
  const [editOrderData, setEditOrderData] = useState({ items: [], notes: '' });

  // Fetch orders and notifications from backend
  useEffect(() => {
    fetchOrders();
    fetchNotifications();
    fetchDistributors();
    fetchProducts();
  }, []);

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const res = await API.get('orders/retailer/orders');
      setOrders(res.data.data || []);
      console.log("Fetched orders:", res.data.data);
    } catch (e) {
      setOrders([]);
    }
    setLoading(false);
  };

  const fetchNotifications = async () => {
    try {
      const res = await API.get('/notifications');
      setNotifications(res.data.data.notifications || []);
    } catch (e) {
      setNotifications([]);
    }
  };

  const fetchDistributors = async () => {
    // Replace with your actual API endpoint for distributors
    try {
      const res = await API.get('orders/distributors');
      setDistributors(res.data.data || []);
    } catch {
      setDistributors([]);
    }
  };

  const fetchProducts = async () => {
    // Replace with your actual API endpoint for products
    try {
      const res = await API.get('orders/products');
      setProducts(res.data.data || []);
    } catch {
      setProducts([]);
    }
  };

  // Create order
  const handleCreateOrder = async () => {
    if (!createOrderData.distributorId || createOrderData.items.length === 0) {
      alert("Please select distributor and add at least one product.");
      return;
    }
    setLoading(true);
    try {
      const res = await API.post('orders/create', createOrderData);
      setShowCreateOrder(false);
      setCreateOrderData({ distributorId: '', items: [], notes: '' });
      fetchOrders();

    } catch (e) {
      alert(e.response?.data?.message || "Failed to create order");
    }
    setLoading(false);
  };

  // Complete order (distributor enters code, retailer confirms)
  const handleCompleteOrder = async (orderId) => {
    const code = prompt("Enter the 6-digit code provided by the distributor to complete the order:");
    if (!code || code.length !== 6) {
      alert("Invalid code.");
      return;
    }
    setLoading(true);
    try {
      // Backend should verify code and mark order as completed
      await API.put(`/orders/retailer/orders/${orderId}/complete`, { code });
      // Update inventory after order is fulfilled
      await API.post('/inventory/checkout', { orderId });
      fetchOrders();
      alert("Order completed and inventory updated!");
    } catch (e) {
      alert(e.response?.data?.message || "Failed to complete order");
    }
    setLoading(false);
  };

  // Cancel order
  const handleCancelOrder = async (orderId, reason) => {
    if (!reason) return;
    setLoading(true);
    try {
      await API.put(`/orders/retailer/orders/${orderId}/cancel`, { reason });
      fetchOrders();
    } catch (e) {
      alert(e.response?.data?.message || "Failed to cancel order");
    }
    setLoading(false);
  };

  // Approve modified order
  const handleApproveModifiedOrder = async (orderId, approved) => {
    setLoading(true);
    try {
      await API.put(`/orders/retailer/orders/${orderId}/approve`, { approved });
      fetchOrders();
    } catch (e) {
      alert(e.response?.data?.message || "Failed to update order");
    }
    setLoading(false);
  };

  const openEditOrder = () => {
    setEditOrderData({
      items: (selectedOrder.items || []).map(item => ({
        sku: item.sku,
        quantity: item.quantity,
        unit: item.unit || 'box',
        name: item.productName || item.name,
        variantName: item.variantName || item.category
      })),
      notes: selectedOrder.notes || ''
    });
    setEditMode(true);
  };

  const handleEditOrderChange = (idx, field, value) => {
    setEditOrderData(prev => {
      const items = [...prev.items];
      items[idx][field] = value;
      return { ...prev, items };
    });
  };

  const handleEditOrderNotes = (value) => {
    setEditOrderData(prev => ({ ...prev, notes: value }));
  };

  const saveEditOrder = async () => {
    setLoading(true);
    console.log(selectedOrder);
    try {
      await API.put(`/orders/retailer/orders/${selectedOrder._id}/modify`, {
        items: editOrderData.items.map(({ sku, quantity, unit }) => ({ sku, quantity, unit })),
        notes: editOrderData.notes
      });
      setEditMode(false);
      setShowOrderDetails(false);
      fetchOrders();
    } catch (e) {
      alert(e.response?.data?.message || "Failed to modify order");
    }
    setLoading(false);
  };

  // ...inside RetailerOrders component

  const OrderDetailsModal = () => {
    if (!selectedOrder) return null;

    // Handler to close modal when clicking outside the modal content
    const handleOverlayClick = (e) => {
      if (e.target === e.currentTarget) {
        setShowOrderDetails(false);
      }
    };

    return (
      <div
        className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50"
        onClick={handleOverlayClick}
      >
        <div
          className="bg-white rounded-xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto"
          onClick={e => e.stopPropagation()}
        >
          <div className="p-6 border-b border-slate-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <button
                  onClick={() => {
                    setShowOrderDetails(false);
                    setEditMode(false);
                  }}
                  className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  <ArrowLeft className="w-5 h-5 text-slate-500" />
                </button>
                <div>
                  <h2 className="text-xl font-semibold text-slate-900">{selectedOrder.orderNumber}</h2>
                  <p className="text-sm text-slate-500">{selectedOrder.distributor?.businessName || selectedOrder.distributorId}</p>
                </div>
              </div>
              <div className={`flex items-center space-x-2 px-3 py-1 rounded-full text-sm font-medium border ${getStatusColor(selectedOrder.status)}`}>
                {getStatusIcon(selectedOrder.status)}
                <span className="capitalize">{selectedOrder.status}</span>
              </div>
            </div>
          </div>

          <div className="p-6 space-y-6">
            {/* Pending Actions */}
            {selectedOrder.status === 'pending' && !editMode && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <div className="flex items-center space-x-2 mb-3">
                  <Clock className="w-5 h-5 text-amber-600" />
                  <h3 className="font-semibold text-amber-800">Pending Order</h3>
                </div>
                <p className="text-sm text-amber-700 mb-4">
                  This order is pending. You can modify or cancel it before the distributor responds.
                </p>
                <div className="flex space-x-3">
                  <button
                    onClick={() => handleCancelOrder(selectedOrder.id, prompt("Reason for cancellation?"))}
                    className="flex items-center space-x-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors shadow-sm"
                  >
                    <XCircle className="w-4 h-4" />
                    <span>Cancel Order</span>
                  </button>
                  <button
                    onClick={openEditOrder}
                    className="flex items-center space-x-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors shadow-sm"
                  >
                    <Edit className="w-4 h-4" />
                    <span>Modify Order</span>
                  </button>
                </div>
              </div>
            )}

            {/* Editable product section */}
            {selectedOrder.status === 'pending' && editMode && (
              <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4">
                <h3 className="font-semibold text-indigo-800 mb-4">Edit Products</h3>
                <div className="space-y-2">
                  {editOrderData.items.map((item, idx) => (
                    <div key={item.sku} className="flex items-center space-x-2 mb-2">
                      <span className="flex-1 text-slate-900">{item.name} <span className="text-xs text-slate-500">({item.variantName})</span></span>
                      <input
                        type="number"
                        min={1}
                        value={item.quantity}
                        onChange={e => handleEditOrderChange(idx, 'quantity', Number(e.target.value))}
                        className="w-20 border border-slate-300 rounded px-2 py-1 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                      />
                      <span className="text-xs text-slate-500">{item.unit}</span>
                    </div>
                  ))}
                  <textarea
                    className="w-full border border-slate-300 rounded px-2 py-1 mt-2 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    rows={2}
                    value={editOrderData.notes}
                    onChange={e => handleEditOrderNotes(e.target.value)}
                    placeholder="Notes"
                  />
                </div>
                <div className="flex space-x-2 mt-4">
                  <button
                    onClick={() => setEditMode(false)}
                    className="px-4 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={saveEditOrder}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors shadow-sm"
                    disabled={loading}
                  >
                    {loading ? "Saving..." : "Save Changes"}
                  </button>
                </div>
              </div>
            )}

            {/* Order Items (read-only if not editing) */}
            {!editMode && (
              <div>
                <h3 className="text-lg font-semibold text-slate-900 mb-4">Order Items</h3>
                <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                  <table className="min-w-full divide-y divide-slate-200">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Product</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Category</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Quantity</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Price</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Total</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-slate-200">
                      {(selectedOrder.items || []).map(item => (
                        <tr key={item.id || item.sku}>
                          <td className="px-4 py-3 text-sm text-slate-900">{item.name || item.productName}</td>
                          <td className="px-4 py-3 text-sm text-slate-500">{item.category || item.variantName}</td>
                          <td className="px-4 py-3 text-sm text-slate-900">{item.quantity}</td>
                          <td className="px-4 py-3 text-sm text-slate-900">₹{item.variantSellingPrice?.toLocaleString()}</td>
                          <td className="px-4 py-3 text-sm font-medium text-slate-900">
                            ₹{(item.quantity * item.variantSellingPrice)?.toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Contact & Shipping Info */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h3 className="text-lg font-semibold text-slate-900 mb-4">Distributor Contact</h3>
                <div className="bg-slate-50 rounded-lg p-4 space-y-3 border border-slate-200">
                  <div className="flex items-center space-x-2">
                    <User className="w-4 h-4 text-slate-500" />
                    <span className="text-sm text-slate-900">{selectedOrder.distributor?.ownerName || '-'}</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Phone className="w-4 h-4 text-slate-500" />
                    <span className="text-sm text-slate-900">{selectedOrder.distributor?.phone || '-'}</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Mail className="w-4 h-4 text-slate-500" />
                    <span className="text-sm text-slate-900">{selectedOrder.distributor?.email || '-'}</span>
                  </div>
                </div>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-slate-900 mb-4">Shipping Address</h3>
                <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                  <div className="flex items-start space-x-2">
                    <MapPin className="w-4 h-4 text-slate-500 mt-0.5" />
                    <div className="text-sm text-slate-900">
                      <p>{selectedOrder.shippingAddress?.street || '-'}</p>
                      <p>{selectedOrder.shippingAddress?.city || ''} {selectedOrder.shippingAddress?.state || ''}</p>
                      <p>{selectedOrder.retailer?.pincode || ''}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Order History */}
            <div>
              <h3 className="text-lg font-semibold text-slate-900 mb-4">Order History</h3>
              <div className="space-y-3">
                {(selectedOrder.orderHistory || []).map((entry, index) => (
                  <div key={index} className="flex items-center space-x-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <div className="w-2 h-2 bg-indigo-500 rounded-full"></div>
                    <div className="flex-1">
                      <p className="text-sm text-slate-900">{entry.action}</p>
                      <p className="text-xs text-slate-500">
                        {entry.date ? new Date(entry.date).toLocaleString() : ""} • {entry.user}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Notes */}
            {selectedOrder.notes && (
              <div>
                <h3 className="text-lg font-semibold text-slate-900 mb-4">Notes</h3>
                <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                  <p className="text-sm text-slate-900">{selectedOrder.notes}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const getStatusIcon = (status) => {
    const iconProps = { size: 16 };
    switch (status) {
      case 'pending':
        return <Clock {...iconProps} className="text-amber-600" />;
      case 'confirmed':
        return <CheckCircle {...iconProps} className="text-indigo-600" />;
      case 'shipped':
        return <Truck {...iconProps} className="text-purple-600" />;
      case 'delivered':
        return <Package {...iconProps} className="text-emerald-600" />;
      case 'cancelled':
        return <XCircle {...iconProps} className="text-red-600" />;
      case 'modified':
        return <Edit {...iconProps} className="text-orange-600" />;
      default:
        return <Clock {...iconProps} className="text-slate-600" />;
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'pending':
        return 'bg-amber-100 text-amber-800 border-amber-200';
      case 'confirmed':
        return 'bg-indigo-100 text-indigo-800 border-indigo-200';
      case 'shipped':
        return 'bg-purple-100 text-purple-800 border-purple-200';
      case 'delivered':
        return 'bg-emerald-100 text-emerald-800 border-emerald-200';
      case 'cancelled':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'modified':
        return 'bg-orange-100 text-orange-800 border-orange-200';
      default:
        return 'bg-slate-100 text-slate-800 border-slate-200';
    }
  };



  const OrderCard = ({ order }) => (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 hover:shadow-md transition-all duration-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-semibold text-slate-900">{order.distributor?.name || order.distributorId}</h3>
          <p className="text-xs text-slate-500">{order.orderNumber}</p>
        </div>
        <div className="flex items-center space-x-2">
          <div className={`flex items-center space-x-2 px-3 py-1 rounded-full text-xs font-medium border ${getStatusColor(order.status)}`}>
            <span className="capitalize">{order.status}</span>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-4 mb-4">
        <div className="flex items-center space-x-2">
          <Package className="w-4 h-4 text-slate-400" />
          <span className="text-sm text-slate-600">{order.itemCount || (order.items ? order.items.length : 0)} items</span>
        </div>
        <div className="flex items-center space-x-2">
          <DollarSign className="w-4 h-4 text-slate-400" />
          <span className="text-sm text-slate-600">₹{order.totalAmount?.toLocaleString()}</span>
        </div>
        <div className="flex items-center space-x-2">
          <Calendar className="w-4 h-4 text-slate-400" />
          <span className="text-sm text-slate-600">{new Date(order.createdAt).toLocaleDateString()}</span>
        </div>
      </div>
      <div className="flex items-center justify-between pt-4 border-t border-slate-100">
        <button
          onClick={() => {
            openOrderModal(order.id)
          }}
          className="flex items-center space-x-1 px-3 py-1.5 text-sm font-medium text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition-colors"
        >
          <Eye className="w-4 h-4" />
          <span>View</span>
        </button>
        <div className="flex space-x-2">
          {order.status === 'processing' && (
            <button
              onClick={() => handleCompleteOrder(order.id)}
              className="flex items-center space-x-1 px-3 py-1.5 text-sm font-medium text-emerald-600 bg-emerald-50 rounded-lg hover:bg-emerald-100 transition-colors"
            >
              <CheckCircle className="w-4 h-4" />
              <span>Complete</span>
            </button>
          )}
          {order.status === 'pending' && (
            <button
              onClick={() => handleCancelOrder(order.id, prompt("Reason for cancellation?"))}
              className="flex items-center space-x-1 px-3 py-1.5 text-sm font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-colors"
            >
              <XCircle className="w-4 h-4" />
              <span>Cancel</span>
            </button>
          )}
          {order.status === 'modified' && (
            <>
              <button
                onClick={() => handleApproveModifiedOrder(order.id, true)}
                className="flex items-center space-x-1 px-3 py-1.5 text-sm font-medium text-emerald-600 bg-emerald-50 rounded-lg hover:bg-emerald-100 transition-colors"
              >
                <Check className="w-4 h-4" />
                <span>Approve</span>
              </button>
              <button
                onClick={() => handleApproveModifiedOrder(order.id, false)}
                className="flex items-center space-x-1 px-3 py-1.5 text-sm font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-colors"
              >
                <X className="w-4 h-4" />
                <span>Reject</span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );

  const CreateOrderModal = () => (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-slate-200">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-slate-900">Create New Order</h2>
            <button
              onClick={() => setShowCreateOrder(false)}
              className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <XCircle className="w-5 h-5 text-slate-500" />
            </button>
          </div>
        </div>
        <div className="p-6">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Select Distributor
              </label>
              <select
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white"
                value={createOrderData.distributorId}
                onChange={e => setCreateOrderData(d => ({ ...d, distributorId: e.target.value }))}
              >
                <option value="">Select distributor</option>
                {distributors.map(d => (
                  <option key={d.id} value={d.id}>{d.businessName}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Add Products
              </label>
              {/* You can implement a product selection UI here */}
              <div className="border border-slate-300 rounded-lg p-4 bg-slate-50">
                <p className="text-sm text-slate-500 text-center py-8">
                  Product selection interface would go here
                </p>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Notes (Optional)
              </label>
              <textarea
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                rows="3"
                placeholder="Add any special instructions..."
                value={createOrderData.notes}
                onChange={e => setCreateOrderData(d => ({ ...d, notes: e.target.value }))}
              />
            </div>
          </div>
          <div className="flex space-x-3 mt-6">
            <button
              onClick={() => setShowCreateOrder(false)}
              className="flex-1 px-4 py-2 text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleCreateOrder}
              className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors shadow-sm"
              disabled={loading}
            >
              {loading ? "Creating..." : "Send Order Request"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );



  // Filtered orders
  const filteredOrders = orders.filter(order => {
    const matchesSearch = (order.orderNumber || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (order.distributor?.ownerName || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchesTab = activeTab === 'all' || order.status === activeTab;
    return matchesSearch && matchesTab;
  });

  const openOrderModal = async (orderId) => {
    setShowOrderDetails(true);
    setSelectedOrder(null); // show loading state if needed
    try {
      const res = await API.get(`/orders/retailer/orders/${orderId}`);
      setSelectedOrder(res.data.data);
    } catch (e) {
      alert("Failed to fetch order details");
      setShowOrderDetails(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <h1 className="text-2xl font-bold text-slate-900">Order Management</h1>
            <div className="flex items-center space-x-4">
              <button
                onClick={() => setShowNotifications(!showNotifications)}
                className="relative p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <Bell className="w-5 h-5" />
                {notifications.filter(n => !n.read).length > 0 && (
                  <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center border-2 border-white">
                    {notifications.filter(n => !n.read).length}
                  </span>
                )}
              </button>
              <button
                onClick={() => setShowCreateOrder(true)}
                className="flex items-center space-x-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors shadow-sm"
              >
                <Plus className="w-4 h-4" />
                <span>New Order</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Filters and Search */}
        <div className="mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex space-x-1 bg-white border border-slate-200 rounded-lg p-1 shadow-sm overflow-x-auto">
              {['all', 'pending', 'processing', 'modified', 'completed'].map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-4 py-2 text-sm font-medium rounded-md transition-colors whitespace-nowrap ${activeTab === tab
                      ? 'bg-indigo-50 text-indigo-700'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                    }`}
                >
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                </button>
              ))}
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
              <input
                type="text"
                placeholder="Search orders..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full sm:w-64 pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white"
              />
            </div>
          </div>
        </div>

        {/* Orders List */}
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
          {filteredOrders.map(order => (
            <OrderCard key={order.id} order={order} />
          ))}
        </div>

        {filteredOrders.length === 0 && (
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <ShoppingCart className="w-8 h-8 text-slate-400" />
            </div>
            <h3 className="text-lg font-medium text-slate-900 mb-2">No orders found</h3>
            <p className="text-slate-500">
              {searchTerm ? 'Try adjusting your search terms' : 'Create your first order to get started'}
            </p>
          </div>
        )}
      </div>

      {/* Modals */}
      {showCreateOrder && <CreateOrderModal />}
      {showOrderDetails && selectedOrder && <OrderDetailsModal order={selectedOrder} />}
      {showNotifications && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-200">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-slate-900">Notifications</h2>
                <button
                  onClick={() => setShowNotifications(false)}
                  className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  <XCircle className="w-5 h-5 text-slate-500" />
                </button>
              </div>
            </div>
            <div className="p-6 space-y-4">
              {notifications.map((notification, index) => (
                <div key={index} className={`p-4 rounded-lg border ${notification.read ? 'bg-slate-50 border-slate-200' : 'bg-indigo-50 border-indigo-100'}`}>
                  <h3 className="font-semibold text-slate-900">{notification.title}</h3>
                  <p className="text-sm text-slate-600 mt-1">{notification.message}</p>
                  <span className="text-xs text-slate-500 mt-2 block">{new Date(notification.date).toLocaleString()}</span>
                </div>
              ))}
              {notifications.length === 0 && (
                <p className="text-center text-slate-500 py-4">No new notifications</p>
              )}
            </div>
          </div>
        </div>
      )}
      {editMode && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-200">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-slate-900">Edit Order</h2>
                <button
                  onClick={() => setEditMode(false)}
                  className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  <XCircle className="w-5 h-5 text-slate-500" />
                </button>
              </div>
            </div>
            <div className="p-6 space-y-4">
              {/* Editable product section */}
              <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4">
                <h3 className="font-semibold text-indigo-800 mb-4">Edit Products</h3>
                <div className="space-y-2">
                  {editOrderData.items.map((item, idx) => (
                    <div key={item.sku} className="flex items-center space-x-2 mb-2">
                      <span className="flex-1 text-slate-900">{item.name} <span className="text-xs text-slate-500">({item.variantName})</span></span>
                      <input
                        type="number"
                        min={1}
                        value={item.quantity}
                        onChange={e => handleEditOrderChange(idx, 'quantity', Number(e.target.value))}
                        className="w-20 border border-slate-300 rounded px-2 py-1 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                      />
                      <span className="text-xs text-slate-500">{item.unit}</span>
                    </div>
                  ))}
                  <textarea
                    className="w-full border border-slate-300 rounded px-2 py-1 mt-2 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    rows={2}
                    value={editOrderData.notes}
                    onChange={e => handleEditOrderNotes(e.target.value)}
                    placeholder="Notes"
                  />
                </div>
                <div className="flex space-x-2 mt-4">
                  <button
                    onClick={() => setEditMode(false)}
                    className="px-4 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={saveEditOrder}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors shadow-sm"
                  >
                    Save
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RetailerOrders;