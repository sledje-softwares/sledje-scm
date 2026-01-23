import React, { useState, useEffect, useCallback } from "react";
import {
  Search,
  Filter,
  Package,
  Plus,
  AlertTriangle,
  X,
  ChevronRight,
  Store,
  ArrowRight,
  LayoutGrid,
  List
} from "lucide-react";
import API from "../../api";

export default function DistributorProducts() {
  // --- STATE ---
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Inventory State (Main View)
  const [inventory, setInventory] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [viewMode, setViewMode] = useState("grid"); // 'grid' | 'list'
  const [activeTab, setActiveTab] = useState("all"); // 'all' | distributorshipId

  // Import Modal State
  const [showImportModal, setShowImportModal] = useState(false);
  const [distributorships, setDistributorships] = useState([]);
  const [modalActiveDistributorship, setModalActiveDistributorship] = useState(null);
  const [modalProducts, setModalProducts] = useState([]);
  const [modalSearch, setModalSearch] = useState("");
  const [importingVariant, setImportingVariant] = useState(null); // The variant being imported

  // Import Form State
  const [importForm, setImportForm] = useState({
    stock: 0,
    costPrice: 0,
    sellingPrice: 0,
    expiry: "",
    lowStockThreshold: 5
  });

  // --- INITIAL DATA FETCH (Inventory & Distributorships) ---
  const fetchInitialData = async () => {
    try {
      setLoading(true);
      const [invRes, distRes] = await Promise.all([
        API.get("/api/distributor-inventory/mine"),
        API.get("/api/distributorships")
      ]);

      setInventory(invRes.data.items || []);
      setDistributorships(distRes.data.distributorships || []);
    } catch (err) {
      console.error(err);
      setError("Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInitialData();
  }, []);

  // --- FETCH PRODUCTS FOR MODAL ---
  const fetchModalProducts = useCallback(async () => {
    if (!modalActiveDistributorship) return;
    try {
      const res = await API.get("/products/get", {
        params: {
          distributorshipId: modalActiveDistributorship,
          search: modalSearch.trim() || undefined,
        },
      });
      setModalProducts(res.data || []);
    } catch (err) {
      console.error(err);
    }
  }, [modalActiveDistributorship, modalSearch]);

  useEffect(() => {
    fetchModalProducts();
  }, [fetchModalProducts]);

  // --- HANDLERS ---

  const handleOpenImportModal = () => {
    setShowImportModal(true);
    if (distributorships.length > 0 && !modalActiveDistributorship) {
      setModalActiveDistributorship(distributorships[0].id);
    }
  };

  const handleImportClick = (product, variant) => {
    // Check if we already have this variant in inventory to pre-fill
    const existing = inventory.find(i => i.variantId === variant.id);

    setImportingVariant({ product, variant, isRestock: !!existing });
    setImportForm({
      stock: 0, // Always start with 0 for adding stock
      costPrice: existing ? existing.costPrice : (variant.mrp || 0),
      sellingPrice: existing ? existing.sellingPrice : (variant.mrp || 0),
      expiry: existing?.expiry ? new Date(existing.expiry).toISOString().split('T')[0] : "",
      lowStockThreshold: existing ? existing.lowStockThreshold : 5
    });
  };

  const handleImportSubmit = async (e) => {
    e.preventDefault();
    if (!importingVariant) return;

    try {
      const payload = {
        variantId: importingVariant.variant.id,
        stock: Number(importForm.stock),
        costPrice: Number(importForm.costPrice),
        sellingPrice: Number(importForm.sellingPrice),
        expiry: importForm.expiry || null,
        lowStockThreshold: Number(importForm.lowStockThreshold)
      };

      await API.post("/api/distributor-inventory/import", payload);

      // Refresh inventory
      const invRes = await API.get("/api/distributor-inventory/mine");
      setInventory(invRes.data.items || []);

      setImportingVariant(null); // Close the small form modal
      // alert(importingVariant.isRestock ? "Stock updated!" : "Product imported!");
    } catch (err) {
      console.error(err);
      // alert("Failed to save inventory.");
    }
  };

  // --- FILTERED INVENTORY ---
  const uniqueDistributorships = React.useMemo(() => {
    const map = new Map();
    inventory.forEach(item => {
      if (item.distributorship) {
        map.set(item.distributorship.id, item.distributorship);
      }
    });
    return Array.from(map.values());
  }, [inventory]);

  const filteredInventory = inventory.filter(item => {
    const term = searchTerm.toLowerCase();
    const matchesSearch = (
      item.variant?.name?.toLowerCase().includes(term) ||
      item.variant?.sku?.toLowerCase().includes(term)
    );
    const matchesTab = activeTab === "all" || item.distributorship?.id === activeTab;

    return matchesSearch && matchesTab;
  });

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      {/* --- HEADER --- */}
      <header className="bg-white border-b border-slate-200 px-4 sm:px-6 lg:px-8 py-6 sticky top-0 z-10">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">My Products</h1>
            <p className="text-sm text-slate-500 mt-1">Manage your inventory and pricing</p>
          </div>
          <button
            onClick={handleOpenImportModal}
            className="flex items-center justify-center gap-2 bg-indigo-600 text-white px-4 py-2.5 rounded-lg hover:bg-indigo-700 transition-colors shadow-sm font-medium"
          >
            <Plus size={20} />
            Import Products
          </button>
        </div>

        {/* Search & Filter Bar */}
        <div className="mt-6 flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
            <input
              type="text"
              placeholder="Search your inventory..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white shadow-sm"
            />
          </div>
          <div className="flex border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm self-start">
            <button
              onClick={() => setViewMode("grid")}
              className={`px-4 py-2.5 transition-colors ${viewMode === "grid" ? "bg-indigo-50 text-indigo-600" : "bg-white text-slate-500 hover:text-slate-700 hover:bg-slate-50"}`}
            >
              <LayoutGrid size={20} />
            </button>
            <div className="w-px bg-slate-200"></div>
            <button
              onClick={() => setViewMode("list")}
              className={`px-4 py-2.5 transition-colors ${viewMode === "list" ? "bg-indigo-50 text-indigo-600" : "bg-white text-slate-500 hover:text-slate-700 hover:bg-slate-50"}`}
            >
              <List size={20} />
            </button>
          </div>
        </div>
      </header>

      {/* --- TABS --- */}
      <div className="px-4 sm:px-6 lg:px-8 pt-4 border-b border-slate-200 bg-white flex gap-6 overflow-x-auto no-scrollbar">
        <button
          onClick={() => setActiveTab("all")}
          className={`pb-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === "all"
            ? "border-indigo-600 text-indigo-600"
            : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
        >
          All Products
        </button>
        {uniqueDistributorships.map(d => (
          <button
            key={d.id}
            onClick={() => setActiveTab(d.id)}
            className={`pb-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === d.id
              ? "border-indigo-600 text-indigo-600"
              : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
          >
            {d.name}
          </button>
        ))}
      </div>

      {/* --- INVENTORY LIST --- */}
      <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto">
        {loading && (
          <div className="flex items-center justify-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
          </div>
        )}

        {!loading && filteredInventory.length === 0 && (
          <div className="text-center py-20 bg-white rounded-xl border border-slate-200 border-dashed">
            <Package size={48} className="mx-auto mb-4 text-slate-300" />
            <p className="text-lg font-medium text-slate-900">No products in your inventory.</p>
            <p className="text-sm text-slate-500 mt-1">Click "Import Products" to get started.</p>
          </div>
        )}

        <div className={viewMode === "grid" ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6" : "space-y-4"}>
          {filteredInventory.map((item) => {
            const isLowStock = item.stock <= (item.lowStockThreshold || 5);
            return (
              <div key={item.id} className={`bg-white rounded-xl border ${isLowStock ? 'border-amber-200 ring-1 ring-amber-100' : 'border-slate-200'} shadow-sm hover:shadow-md transition-all overflow-hidden flex ${viewMode === "list" ? "flex-row h-32" : "flex-col"}`}>
                {/* Image Area */}
                <div className={`${viewMode === "list" ? "w-32" : "h-48"} bg-slate-100 flex items-center justify-center relative`}>
                  {item.product?.imageUrl ? (
                    <img
                      src={item.product.imageUrl}
                      alt={item.variant?.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <Package className="text-slate-400" size={viewMode === "list" ? 32 : 48} />
                  )}

                  {isLowStock && (
                    <div className="absolute top-2 right-2 bg-amber-100 text-amber-700 px-2 py-1 rounded-full text-xs font-medium flex items-center gap-1 shadow-sm border border-amber-200">
                      <AlertTriangle size={12} />
                      Low Stock
                    </div>
                  )}
                </div>

                {/* Content Area */}
                <div className="p-4 flex-1 flex flex-col">
                  <div className="mb-2">
                    <h3 className="font-semibold text-slate-900 line-clamp-1">{item.variant?.name || "Unknown Product"}</h3>
                    <p className="text-sm text-slate-500">SKU: {item.variant?.sku}</p>
                  </div>

                  <div className="mt-auto grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-slate-500 text-xs">Stock</p>
                      <p className={`font-medium ${isLowStock ? 'text-amber-600' : 'text-slate-900'}`}>{item.stock} units</p>
                    </div>
                    <div>
                      <p className="text-slate-500 text-xs">Selling Price</p>
                      <p className="font-medium text-slate-900">₹{item.sellingPrice}</p>
                    </div>
                  </div>

                  <div className="mt-4 pt-4 border-t border-slate-100 flex gap-2">
                    <button
                      onClick={() => handleImportClick({ name: item.variant?.name }, item.variant)}
                      className="flex-1 bg-indigo-50 text-indigo-600 py-2 rounded-lg text-sm font-medium hover:bg-indigo-100 transition-colors"
                    >
                      Restock
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </main>

      {/* --- IMPORT MODAL (Full Screen) --- */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white w-full max-w-6xl h-[90vh] rounded-2xl shadow-2xl flex overflow-hidden border border-slate-200">

            {/* Sidebar: Distributorships */}
            <div className="w-64 bg-slate-50 border-r border-slate-200 flex flex-col">
              <div className="p-4 border-b border-slate-200 bg-white">
                <h2 className="font-bold text-slate-800 flex items-center gap-2">
                  <Store size={20} className="text-indigo-600" />
                  Distributorships
                </h2>
              </div>
              <div className="flex-1 overflow-y-auto p-2 space-y-1">
                {distributorships.map(d => (
                  <button
                    key={d.id}
                    onClick={() => setModalActiveDistributorship(d.id)}
                    className={`w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium transition-colors flex items-center justify-between ${modalActiveDistributorship === d.id
                      ? "bg-indigo-50 text-indigo-700"
                      : "text-slate-600 hover:bg-slate-100"
                      }`}
                  >
                    <span className="truncate">{d.name}</span>
                    {modalActiveDistributorship === d.id && <ChevronRight size={16} />}
                  </button>
                ))}
              </div>
            </div>

            {/* Main Content: Products */}
            <div className="flex-1 flex flex-col bg-white">
              {/* Modal Header */}
              <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-white">
                <div className="relative flex-1 max-w-md">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input
                    type="text"
                    placeholder="Search products in this distributorship..."
                    value={modalSearch}
                    onChange={(e) => setModalSearch(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all text-sm"
                  />
                </div>
                <button
                  onClick={() => setShowImportModal(false)}
                  className="ml-4 p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
                >
                  <X size={24} />
                </button>
              </div>

              {/* Products List */}
              <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50">
                {modalProducts.length === 0 ? (
                  <div className="text-center py-20 text-slate-400">
                    <p>No products found.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {modalProducts.map(product => (
                      <div key={product.id} className="bg-white border border-slate-200 rounded-xl p-4 hover:border-indigo-300 hover:shadow-sm transition-all">
                        <div className="flex items-start gap-3">
                          <div className="w-12 h-12 bg-slate-100 rounded-lg flex items-center justify-center flex-shrink-0">
                            <Package size={24} className="text-slate-400" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <h3 className="font-medium text-slate-900 truncate">{product.name}</h3>
                            <p className="text-xs text-slate-500">{product.category}</p>
                          </div>
                        </div>

                        <div className="mt-4 space-y-2">
                          {product.variants.map(variant => {
                            const inInventory = inventory.find(i => i.variantId === variant.id);
                            return (
                              <div key={variant.id} className="flex items-center justify-between bg-slate-50 p-2.5 rounded-lg text-sm border border-slate-100">
                                <div>
                                  <p className="font-medium text-slate-700">{variant.name}</p>
                                  <p className="text-xs text-slate-500">MRP: ₹{variant.mrp}</p>
                                </div>
                                <button
                                  onClick={() => handleImportClick(product, variant)}
                                  className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${inInventory
                                    ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200"
                                    : "bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm"
                                    }`}
                                >
                                  {inInventory ? "Restock" : "Import"}
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- IMPORT/RESTOCK FORM DIALOG --- */}
      {importingVariant && (
        <div className="fixed inset-0 z-[60] bg-slate-900/50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-xl p-6 border border-slate-200">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-slate-900">
                {importingVariant.isRestock ? "Restock Inventory" : "Import Product"}
              </h3>
              <button onClick={() => setImportingVariant(null)} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>

            <div className="mb-6 bg-indigo-50 p-4 rounded-xl flex items-center gap-3 border border-indigo-100">
              <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center shadow-sm text-indigo-600">
                <Package size={20} />
              </div>
              <div>
                <p className="font-medium text-indigo-900">{importingVariant.product.name}</p>
                <p className="text-sm text-indigo-700">{importingVariant.variant.name}</p>
              </div>
            </div>

            <form onSubmit={handleImportSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    {importingVariant.isRestock ? "Add Stock" : "Initial Stock"}
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={importForm.stock}
                    onChange={e => setImportForm({ ...importForm, stock: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Low Stock Alert</label>
                  <input
                    type="number"
                    min="0"
                    value={importForm.lowStockThreshold}
                    onChange={e => setImportForm({ ...importForm, lowStockThreshold: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Cost Price (₹)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    value={importForm.costPrice}
                    onChange={e => setImportForm({ ...importForm, costPrice: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Selling Price (₹)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    value={importForm.sellingPrice}
                    onChange={e => setImportForm({ ...importForm, sellingPrice: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Expiry Date (Optional)</label>
                <input
                  type="date"
                  value={importForm.expiry}
                  onChange={e => setImportForm({ ...importForm, expiry: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>

              <button
                type="submit"
                className="w-full bg-indigo-600 text-white py-3 rounded-xl font-medium hover:bg-indigo-700 transition-colors mt-2 shadow-sm"
              >
                {importingVariant.isRestock ? "Update Inventory" : "Confirm Import"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
