import React, { useState, useEffect } from 'react';
import {
  ShoppingCart,
  Clock,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Eye,
  Search,
  Bell,
  Package,
  DollarSign,
  User,
  Phone,
  Mail,
  Edit3,
  Truck,
  Check,
  X,
  FileText,
  Building,
  Plus,
  Minus
} from 'lucide-react';
import API from "../../api"; // Adjust path as needed

const DistributorOrderManagement = () => {
  const [orders, setOrders] = useState([]);
  const [toast, setToast] = useState(null);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [activeTab, setActiveTab] = useState('pending');
  const [searchTerm, setSearchTerm] = useState('');
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [actionType, setActionType] = useState(''); // 'accept', 'reject', 'modify'
  const [loading, setLoading] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [modifiedItems, setModifiedItems] = useState([]);
  const [modificationNotes, setModificationNotes] = useState('');

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const res = await API.get('/orders/distributor/orders');
      setOrders(res.data.data || []);
    } catch {
      setOrders([]);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  const [assignFor, setAssignFor] = useState(null); // order awaiting an agent

  const dispatchOrder = async (order) => {
    setLoading(true);
    try {
      await API.put(`/orders/distributor/orders/${order.id}/dispatch`);
      setToast({ message: `${order.orderNumber} dispatched — assign a delivery agent next.`, type: 'success' });
      await fetchOrders();
    } catch (error) {
      setToast({ message: error.response?.data?.error || 'Could not dispatch order', type: 'error' });
    }
    setLoading(false);
  };

  const prettyStatus = (status) =>
    (status || "").replace(/_/g, " ");

  const getStatusIcon = (status) => {
    const iconProps = { size: 16 };
    switch (status) {
      case 'pending':
        return <Clock {...iconProps} className="text-amber-500" />;
      case 'processing':
        return <Package {...iconProps} className="text-blue-500" />;
      case 'dispatched':
        return <Truck {...iconProps} className="text-indigo-500" />;
      case 'out_for_delivery':
        return <Truck {...iconProps} className="text-violet-500" />;
      case 'delivered':
      case 'completed':
        return <CheckCircle {...iconProps} className="text-emerald-500" />;
      case 'cancelled':
        return <XCircle {...iconProps} className="text-red-500" />;
      case 'modified':
        return <Edit3 {...iconProps} className="text-orange-500" />;
      default:
        return <Clock {...iconProps} className="text-slate-500" />;
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'pending':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'processing':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'dispatched':
        return 'bg-indigo-50 text-indigo-700 border-indigo-200';
      case 'out_for_delivery':
        return 'bg-violet-50 text-violet-700 border-violet-200';
      case 'delivered':
      case 'completed':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'cancelled':
        return 'bg-red-50 text-red-700 border-red-200';
      case 'modified':
        return 'bg-orange-50 text-orange-700 border-orange-200';
      default:
        return 'bg-slate-50 text-slate-700 border-slate-200';
    }
  };

  const getUrgencyLevel = (createdAt) => {
    const hoursSinceCreated = (new Date() - new Date(createdAt)) / (1000 * 60 * 60);
    if (hoursSinceCreated > 24) return 'high';
    if (hoursSinceCreated > 12) return 'medium';
    return 'low';
  };

  const filteredOrders = orders.filter(order => {
    const orderNumber = order.orderNumber || "";
    const retailerName = order.retailer?.businessName || "";
    const matchesSearch =
      orderNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      retailerName.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesTab = activeTab === 'all' || order.status === activeTab;
    return matchesSearch && matchesTab;
  });

  const handleOrderAction = (order, action) => {
    // The list rows are already fully enriched (retailer, items, delivery),
    // so there is no need for a second round-trip here.
    setSelectedOrder(order);

    if (action === 'modify') {
      setModifiedItems((order.items || []).map(item => ({
        ...item,
        originalQuantity: item.quantity,
        newQuantity: item.quantity,
        isModified: false
      })));
      setModificationNotes('');
    }

    setActionType(action);
    setShowOrderModal(true);
  };

  const handleQuantityChange = (itemIndex, newQuantity) => {
    setModifiedItems(prev =>
      prev.map((item, index) => {
        if (index === itemIndex) {
          const quantity = Math.max(0, parseInt(newQuantity) || 0);
          return {
            ...item,
            newQuantity: quantity,
            isModified: quantity !== item.originalQuantity
          };
        }
        return item;
      })
    );
  };

  const calculateModifiedTotal = () => {
    return modifiedItems.reduce((sum, item) => {
      return sum + (item.newQuantity * item.variantSellingPrice);
    }, 0);
  };

  const getModificationSummary = () => {
    const changedItems = modifiedItems.filter(item => item.isModified);
    const removedItems = modifiedItems.filter(item => item.newQuantity === 0);
    const quantityChanges = changedItems.filter(item => item.newQuantity > 0);

    return {
      hasChanges: changedItems.length > 0,
      changedItems,
      removedItems,
      quantityChanges,
      originalTotal: selectedOrder.totalAmount,
      newTotal: calculateModifiedTotal(),
      totalDifference: calculateModifiedTotal() - selectedOrder.totalAmount
    };
  };

  const processOrder = async () => {
    setLoading(true);
    try {
      let successMessage = '';
      let apiData = {};

      if (actionType === 'accept') {
        apiData = { action: 'accept' };
        successMessage = `Order from ${selectedOrder.retailer.businessName} has been accepted successfully!`;
      } else if (actionType === 'reject') {
        if (!rejectionReason.trim()) {
          setToast({
            message: "Please provide a rejection reason",
            type: 'error'
          });
          setLoading(false);
          return;
        }
        apiData = { action: 'reject', rejectionReason };
        successMessage = `Order from ${selectedOrder.retailer.businessName} has been rejected.`;
      } else if (actionType === 'modify') {
        const summary = getModificationSummary();
        if (!summary.hasChanges) {
          setToast({
            message: "No modifications detected",
            type: 'error'
          });
          setLoading(false);
          return;
        }

        // Prepare modification data
        const modifications = {
          items: modifiedItems.map(item => ({
            productId: item.productId,
            variantId: item.variantId,
            originalQuantity: item.originalQuantity,
            newQuantity: item.newQuantity,
            isModified: item.isModified
          })),
          notes: modificationNotes,

        };

        apiData = { action: 'modify', modifications };
        successMessage = `Modification request sent for order to ${selectedOrder.retailer.businessName}.`;
      }

      await API.put(`/orders/distributor/orders/${selectedOrder.id}/process`, apiData);

      // Refresh orders after action (was GET .../order — singular, 404s)
      await fetchOrders();
      setShowOrderModal(false);
      setRejectionReason('');
      setModifiedItems([]);
      setModificationNotes('');

      // Show success toast
      setToast({ message: successMessage, type: 'success' });

    } catch (error) {
      const errorMessage = error.response?.data?.message || "Action failed. Please try again.";
      setToast({ message: errorMessage, type: 'error' });
    }
    setLoading(false);
  };

  const Toast = ({ message, type, onClose }) => {
    const [isVisible, setIsVisible] = useState(true);

    useEffect(() => {
      const timer = setTimeout(() => {
        setIsVisible(false);
        setTimeout(onClose, 300);
      }, 4000);
      return () => clearTimeout(timer);
    }, [onClose]);

    const handleClose = () => {
      setIsVisible(false);
      setTimeout(onClose, 300);
    };

    return (
      <div className={`fixed top-6 right-6 z-50 transition-all duration-300 transform ${isVisible ? 'translate-y-0 opacity-100' : '-translate-y-2 opacity-0'
        }`}>
        <div className={`relative flex items-center space-x-3 px-6 py-4 rounded-xl shadow-lg border-l-4 min-w-[320px] ${type === 'success'
            ? 'bg-white border-l-emerald-500'
            : type === 'error'
              ? 'bg-white border-l-red-500'
              : 'bg-white border-l-blue-500'
          }`}>
          <div className={`flex-shrink-0 p-1 rounded-full ${type === 'success'
              ? 'bg-emerald-100'
              : type === 'error'
                ? 'bg-red-100'
                : 'bg-blue-100'
            }`}>
            {type === 'success' && <CheckCircle className="w-5 h-5 text-emerald-600" />}
            {type === 'error' && <XCircle className="w-5 h-5 text-red-600" />}
            {type === 'info' && <AlertTriangle className="w-5 h-5 text-blue-600" />}
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-900 leading-relaxed">
              {message}
            </p>
          </div>

          <button
            onClick={handleClose}
            className="flex-shrink-0 p-1.5 rounded-full hover:bg-slate-100 transition-colors duration-200 group"
            aria-label="Close notification"
          >
            <X className="w-4 h-4 text-slate-400 group-hover:text-slate-600" />
          </button>
        </div>
      </div>
    );
  };

  const OrderCard = ({ order }) => {
    const urgency = getUrgencyLevel(order.createdAt);

    return (
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 hover:shadow-md transition-all duration-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-indigo-50 rounded-lg">
              <ShoppingCart className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-900">{order.retailer.businessName}</h3>
              <p className="text-sm text-slate-500">{order.orderNumber}</p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            {urgency === 'high' && (
              <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" title="Urgent" />
            )}
            <div className={`flex items-center space-x-2 px-2.5 py-1 rounded-full text-xs font-medium border ${getStatusColor(order.status)}`}>
              {getStatusIcon(order.status)}
              <span className="capitalize">{order.status}</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="flex items-center space-x-2">
            <Package className="w-4 h-4 text-slate-400" />
            <span className="text-sm text-slate-600">{order.itemCount} items</span>
          </div>
          <div className="flex items-center space-x-2">
            <DollarSign className="w-4 h-4 text-slate-400" />
            <span className="text-sm text-slate-600">₹{order.totalAmount.toLocaleString()}</span>
          </div>
        </div>

        <div className="bg-slate-50 rounded-lg p-3 mb-4 border border-slate-100">
          <div className="flex items-center space-x-2 mb-2">
            <Building className="w-4 h-4 text-slate-500" />
            <span className="text-sm font-medium text-slate-700">Retailer Info</span>
          </div>
          <div className="space-y-1">
            <div className="flex items-center space-x-2">
              <User className="w-3 h-3 text-slate-400" />
              <span className="text-xs text-slate-600">{order.retailer.ownerName || order.retailer.businessName}</span>
            </div>
            <div className="flex items-center space-x-2">
              <Phone className="w-3 h-3 text-slate-400" />
              <span className="text-xs text-slate-600">{order.retailer.phone || '—'}</span>
            </div>
          </div>
        </div>

        {order.delivery && (
          <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-3 mb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Truck className="w-4 h-4 text-indigo-600" />
                <span className="text-sm font-medium text-indigo-800">
                  {order.delivery.agentName
                    ? `${order.delivery.agentName}`
                    : 'Awaiting agent assignment'}
                </span>
              </div>
              <span className="text-xs font-medium text-indigo-600 capitalize">
                {prettyStatus(order.delivery.status)}
              </span>
            </div>
            {order.delivery.agentPhone && (
              <p className="text-xs text-indigo-600 mt-1">{order.delivery.agentPhone}</p>
            )}
          </div>
        )}

        {order.notes && (
          <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 mb-4">
            <div className="flex items-start space-x-2">
              <FileText className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
              <div>
                <span className="text-sm font-medium text-blue-800">Order Notes:</span>
                <p className="text-sm text-blue-700 mt-1">{order.notes}</p>
              </div>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between pt-4 border-t border-slate-100">
          <div className="text-xs text-slate-500">
            {new Date(order.createdAt).toLocaleString()}
          </div>
          <div className="flex space-x-2">
            <button
              onClick={() => handleOrderAction(order, 'view')}
              className="flex items-center space-x-1 px-3 py-1.5 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
            >
              <Eye className="w-4 h-4" />
              <span>View</span>
            </button>
            {order.status === 'pending' && (
              <>
                <button
                  onClick={() => handleOrderAction(order, 'accept')}
                  className="flex items-center space-x-1 px-3 py-1.5 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors shadow-sm"
                >
                  <Check className="w-4 h-4" />
                  <span>Accept</span>
                </button>
                <button
                  onClick={() => handleOrderAction(order, 'reject')}
                  className="flex items-center space-x-1 px-3 py-1.5 text-sm font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition-colors"
                >
                  <X className="w-4 h-4" />
                  <span>Reject</span>
                </button>
                <button
                  onClick={() => handleOrderAction(order, 'modify')}
                  className="flex items-center space-x-1 px-3 py-1.5 text-sm font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 transition-colors"
                >
                  <Edit3 className="w-4 h-4" />
                  <span>Modify</span>
                </button>
              </>
            )}
            {order.status === 'processing' && (
              <button
                onClick={() => dispatchOrder(order)}
                disabled={loading}
                className="flex items-center space-x-1 px-3 py-1.5 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors shadow-sm disabled:opacity-50"
              >
                <Truck className="w-4 h-4" />
                <span>Dispatch</span>
              </button>
            )}
            {['dispatched', 'out_for_delivery'].includes(order.status) &&
              (!order.delivery?.agentId) && (
                <button
                  onClick={() => setAssignFor(order)}
                  className="flex items-center space-x-1 px-3 py-1.5 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors shadow-sm"
                >
                  <User className="w-4 h-4" />
                  <span>Assign agent</span>
                </button>
              )}
          </div>
        </div>
      </div>
    );
  };

  const OrderModal = () => {
    if (!selectedOrder) return null;

    const modificationSummary = actionType === 'modify' ? getModificationSummary() : null;

    return (
      <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto border border-slate-200">
          <div className="p-6 border-b border-slate-200">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-slate-900">
                {actionType === 'view' ? 'Order Details' :
                  actionType === 'accept' ? 'Accept Order' :
                    actionType === 'reject' ? 'Reject Order' :
                      actionType === 'modify' ? 'Modify Order' : 'Complete Order'}
              </h2>
              <button
                onClick={() => setShowOrderModal(false)}
                className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>
          </div>

          <div className="p-6">
            {/* Order Header */}
            <div className="bg-slate-50 rounded-lg p-4 mb-6 border border-slate-200">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h3 className="font-semibold text-slate-900 mb-3">Order Information</h3>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-sm text-slate-600">Order Number:</span>
                      <span className="text-sm font-medium text-slate-900">{selectedOrder.orderNumber}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-slate-600">Status:</span>
                      <div className={`px-2 py-0.5 rounded-full text-xs font-medium border ${getStatusColor(selectedOrder.status)}`}>
                        {selectedOrder.status}
                      </div>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-slate-600">Total Amount:</span>
                      <span className="text-sm font-medium text-slate-900">₹{selectedOrder.totalAmount.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-slate-600">Created:</span>
                      <span className="text-sm font-medium text-slate-900">
                        {new Date(selectedOrder.createdAt).toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900 mb-3">Retailer Information</h3>
                  <div className="space-y-2">
                    <div className="flex items-center space-x-2">
                      <User className="w-4 h-4 text-slate-400" />
                      <span className="text-sm text-slate-900">{selectedOrder.retailer.businessName}</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Mail className="w-4 h-4 text-slate-400" />
                      <span className="text-sm text-slate-600">{selectedOrder.retailer.email}</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Phone className="w-4 h-4 text-slate-400" />
                      <span className="text-sm text-slate-600">{selectedOrder.retailer.phone}</span>
                    </div>
                    <div className="flex items-start space-x-2">
                      <Building className="w-4 h-4 text-slate-400 mt-0.5" />
                      <span className="text-sm text-slate-600">{selectedOrder.retailer.pincode}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Modification Summary */}
            {actionType === 'modify' && modificationSummary && (
              <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 mb-6">
                <h3 className="font-semibold text-orange-900 mb-2">Modification Summary</h3>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm text-orange-800">Original Total:</span>
                    <span className="text-sm font-medium text-orange-900">₹{modificationSummary.originalTotal.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-orange-800">New Total:</span>
                    <span className="text-sm font-medium text-orange-900">₹{modificationSummary.newTotal.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-orange-800">Difference:</span>
                    <span className={`text-sm font-medium ${modificationSummary.totalDifference >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                      {modificationSummary.totalDifference >= 0 ? '+' : ''}₹{modificationSummary.totalDifference.toLocaleString()}
                    </span>
                  </div>
                  <div className="text-sm text-orange-800">
                    Items Modified: {modificationSummary.changedItems.length}
                  </div>
                </div>
              </div>
            )}

            {/* Order Items */}
            <div className="mb-6">
              <h3 className="font-semibold text-slate-900 mb-4">Order Items</h3>
              <div className="overflow-x-auto border border-slate-200 rounded-lg">
                <table className="w-full">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="text-left py-3 px-4 text-xs font-medium text-slate-500 uppercase tracking-wider">Product</th>
                      <th className="text-left py-3 px-4 text-xs font-medium text-slate-500 uppercase tracking-wider">SKU</th>
                      <th className="text-right py-3 px-4 text-xs font-medium text-slate-500 uppercase tracking-wider">Quantity</th>
                      <th className="text-right py-3 px-4 text-xs font-medium text-slate-500 uppercase tracking-wider">Price</th>
                      <th className="text-right py-3 px-4 text-xs font-medium text-slate-500 uppercase tracking-wider">Stock</th>
                      <th className="text-right py-3 px-4 text-xs font-medium text-slate-500 uppercase tracking-wider">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {(actionType === 'modify' ? modifiedItems : selectedOrder.items).map((item, index) => (
                      <tr key={index} className={`${actionType === 'modify' && item.isModified ? 'bg-orange-50' : 'bg-white'}`}>
                        <td className="py-3 px-4">
                          <div>
                            <div className="font-medium text-slate-900">{item.productName}-{item.variantName}</div>
                            <div className="text-sm text-slate-500">per {item.unit}</div>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-sm text-slate-600">{item.sku}</td>
                        <td className="py-3 px-4 text-right">
                          {actionType === 'modify' ? (
                            <div className="flex items-center justify-end space-x-2">
                              <button
                                onClick={() => handleQuantityChange(index, item.newQuantity - 1)}
                                className="p-1 hover:bg-slate-100 rounded border border-slate-200"
                                disabled={item.newQuantity <= 0}
                              >
                                <Minus className="w-3 h-3 text-slate-600" />
                              </button>
                              <input
                                type="number"
                                value={item.newQuantity}
                                onChange={(e) => handleQuantityChange(index, e.target.value)}
                                className="w-16 px-2 py-1 text-sm border border-slate-300 rounded text-center focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                                min="0"
                                max={item.stock}
                              />
                              <button
                                onClick={() => handleQuantityChange(index, item.newQuantity + 1)}
                                className="p-1 hover:bg-slate-100 rounded border border-slate-200"
                                disabled={item.newQuantity >= item.stock}
                              >
                                <Plus className="w-3 h-3 text-slate-600" />
                              </button>
                            </div>
                          ) : (
                            <span className="font-medium text-slate-900">{item.quantity}</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right text-slate-600">₹{item.variantSellingPrice}</td>
                        <td className="py-3 px-4 text-right">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${item.stock < (actionType === 'modify' ? item.newQuantity : item.quantity) ? 'bg-red-100 text-red-800' :
                              item.stock < (actionType === 'modify' ? item.newQuantity : item.quantity) * 2 ? 'bg-amber-100 text-amber-800' :
                                'bg-emerald-100 text-emerald-800'
                            }`}>
                            {item.stock} available
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right font-medium text-slate-900">
                          ₹{((actionType === 'modify' ? item.newQuantity : item.quantity) * item.variantSellingPrice).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Notes */}
            {selectedOrder.notes && (
              <div className="mb-6">
                <h3 className="font-semibold text-slate-900 mb-2">Order Notes</h3>
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <p className="text-sm text-blue-800">{selectedOrder.notes}</p>
                </div>
              </div>
            )}

            {/* Action-specific content */}
            {actionType === 'reject' && (
              <div className="mb-6">
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Rejection Reason <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                  rows="3"
                  placeholder="Please provide a reason for rejecting this order..."
                />
              </div>
            )}


            {actionType === 'modify' && (
              <div className="mb-6">
                <h3 className="font-semibold text-slate-900 mb-2">Modification Notes</h3>
                <textarea
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  rows="3"
                  placeholder="Explain the modifications made to this order..."
                  value={modificationNotes}
                  onChange={(e) => setModificationNotes(e.target.value)}
                />
              </div>
            )}

            {/* Action Buttons */}
            {actionType !== 'view' && (
              <div className="flex space-x-3 pt-4 border-t border-slate-200">
                <button
                  onClick={() => setShowOrderModal(false)}
                  className="flex-1 px-4 py-2.5 text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={processOrder}
                  disabled={loading || (actionType === 'reject' && !rejectionReason.trim())}
                  className={`flex-1 px-4 py-2.5 text-white rounded-lg transition-colors flex items-center justify-center space-x-2 font-medium shadow-sm ${actionType === 'accept' ? 'bg-emerald-600 hover:bg-emerald-700' :
                      actionType === 'reject' ? 'bg-red-600 hover:bg-red-700' :
                        actionType === 'modify' ? 'bg-amber-600 hover:bg-amber-700' :
                          'bg-blue-600 hover:bg-blue-700'
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  {loading ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      {actionType === 'accept' && <Check className="w-4 h-4" />}
                      {actionType === 'reject' && <X className="w-4 h-4" />}
                      {actionType === 'modify' && <Edit3 className="w-4 h-4" />}
                      {actionType === 'complete' && <CheckCircle className="w-4 h-4" />}
                      <span>
                        {actionType === 'accept' ? 'Accept Order' :
                          actionType === 'reject' ? 'Reject Order' :
                            actionType === 'modify' ? 'Save Modifications' :
                              'Mark as Complete'}
                      </span>
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans">
      {/* Header */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-20">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Order Management</h1>
              <p className="text-sm text-slate-500 mt-1">Manage and track your incoming orders</p>
            </div>
            <div className="flex items-center space-x-4">
              <div className="relative">
                <button className="p-2 text-slate-400 hover:text-slate-600 transition-colors rounded-full hover:bg-slate-100">
                  <Bell className="w-6 h-6" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Filters and Search */}
        <div className="mb-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex space-x-1 bg-white p-1 rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
              {['pending', 'processing', 'dispatched', 'out_for_delivery', 'delivered', 'cancelled'].map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-4 py-2 text-sm font-medium rounded-lg transition-all whitespace-nowrap ${activeTab === tab
                      ? 'bg-indigo-50 text-indigo-700 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                    }`}
                >
                  <span className="capitalize">{prettyStatus(tab)}</span>
                </button>
              ))}
            </div>
            <div className="relative w-full md:w-72">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
              <input
                type="text"
                placeholder="Search orders..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white shadow-sm transition-shadow"
              />
            </div>
          </div>
        </div>

        {/* Order Stats */}


        {loading && (
          <div className="flex items-center justify-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
          </div>
        )}

        {/* Orders List */}
        {!loading && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {filteredOrders.map(order => (
              <OrderCard key={order.id} order={order} />
            ))}
          </div>
        )}


        {/* No orders message */}
        {!loading && filteredOrders.length === 0 && (
          <div className="text-center py-16 bg-white rounded-xl border border-slate-200 border-dashed">
            <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <ShoppingCart className="w-8 h-8 text-slate-400" />
            </div>
            <h3 className="text-lg font-medium text-slate-900 mb-2">No orders found</h3>
            <p className="text-slate-500 max-w-sm mx-auto">
              {searchTerm ? 'Try adjusting your search terms to find what you are looking for.' : `You don't have any ${activeTab} orders at the moment.`}
            </p>
          </div>
        )}

      </div>

      {/* Modal */}
      {showOrderModal && <OrderModal />}
      {assignFor && (
        <AssignAgentModal
          order={assignFor}
          onClose={() => setAssignFor(null)}
          onAssigned={async () => {
            setAssignFor(null);
            await fetchOrders();
          }}
          setToast={setToast}
        />
      )}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
};

function AssignAgentModal({ order, onClose, onAssigned, setToast }) {
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [assigning, setAssigning] = useState(null);

  useEffect(() => {
    API.get('/deliveries/agents/available')
      .then((r) => setAgents(r.data.agents || []))
      .catch(() => setAgents([]))
      .finally(() => setLoading(false));
  }, []);

  const assign = async (agentId) => {
    setAssigning(agentId);
    try {
      await API.put(`/deliveries/${order.delivery.id}/assign`, { agentId });
      setToast({ message: 'Delivery agent assigned', type: 'success' });
      onAssigned();
    } catch (e) {
      setToast({ message: e.response?.data?.error || 'Could not assign agent', type: 'error' });
      setAssigning(null);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md border border-slate-200 flex flex-col max-h-[80vh]">
        <div className="p-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-slate-900">Assign delivery agent</h2>
            <p className="text-xs text-slate-500">
              {order.orderNumber} → {order.retailer?.businessName}
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>
        <div className="p-4 overflow-y-auto flex-1">
          {loading ? (
            <p className="text-sm text-slate-400">Loading available agents…</p>
          ) : agents.length === 0 ? (
            <p className="text-sm text-slate-500">
              No agents are marked available right now. Agents self-register and toggle their
              own availability.
            </p>
          ) : (
            <div className="space-y-2">
              {agents.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center justify-between p-3 border border-slate-200 rounded-lg"
                >
                  <div>
                    <p className="text-sm font-medium text-slate-900">{a.name}</p>
                    <p className="text-xs text-slate-500">
                      {a.phone || '—'}
                      {a.vehicleNumber ? ` · ${a.vehicleNumber}` : ''}
                      {a.operatingPincode ? ` · ${a.operatingPincode}` : ''}
                    </p>
                  </div>
                  <button
                    onClick={() => assign(a.id)}
                    disabled={!!assigning}
                    className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {assigning === a.id ? 'Assigning…' : 'Assign'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default DistributorOrderManagement;