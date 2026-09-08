import { useState, useEffect, useRef } from "react";
import {
  Menu,
  Search,
  Filter,
  Plus,
  Minus,
  Mic,
  ShoppingCart,
  Grid3X3,
  List,
  Package,
  TrendingUp,
  AlertTriangle,
  Loader2,
  PlusCircle,
  X,
  Eye,
  ChevronDown,
  ChevronRight,
  Star,
  Building2,
  Tag,
  MicOff,
  Trash2
} from "lucide-react";
import API from "../../api"; // Adjust the import path as needed
import { useAuth } from "../../components/AuthContext";
import RetailerCart from "./retailerCart";
import { useLocation } from "react-router-dom";

export default function Shelf() {
  // --- STATE ---
  const { user } = useAuth();
  const [productsLoaded, setProductsLoaded] = useState(false);
  const [productData, setProductData] = useState([]);
  const [categoryStructure, setCategoryStructure] = useState({});
  const [hoveredProduct, setHoveredProduct] = useState(null);
  const [filterType, setFilterType] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState(Object.keys(categoryStructure)[0]);
  const [activesubcategory, setActivesubcategory] = useState(null);
  const [cartItems, setCartItems] = useState([]);
  const [showCart, setShowCart] = useState(false);
  const [orderQuantities, setOrderQuantities] = useState({});
  const [viewMode, setViewMode] = useState("categories"); // categories or distributors
  const [sortBy, setSortBy] = useState("name");
  const [sortOrder, setSortOrder] = useState("asc");
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [showGlobalSearch, setShowGlobalSearch] = useState(false);
  const [inventoryArr, setInventoryArr] = useState([]);
  const [selectedDistributors, setSelectedDistributors] = useState({});
  const [fade, setFade] = useState(true);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  // Distributor modal state
  const [showDistributorModal, setShowDistributorModal] = useState(false);
  const [distributorSearch, setDistributorSearch] = useState("");
  const [modalDistributor, setModalDistributor] = useState(null);

  // New state for new products
  const [newProducts, setNewProducts] = useState([]);
  const [selectedNewVariants, setSelectedNewVariants] = useState({});
  const [isAddingToInventory, setIsAddingToInventory] = useState(false);

  // State for inventory variants

  const [inventoryStockMap, setInventoryStockMap] = useState({});

  const recognitionRef = useRef(null);

  // --- PLACEHOLDER SCROLL DATA ---
  const placeholders = [
    "Search products...",
    "Search distributors...",
    "Search variants...",
    "Search orders...",
    "Search categories...",
  ];
  // ---SAMPLE IMAGES---//
  const myImages = [
    "https://cdn.grofers.com/cdn-cgi/image/f=auto,fit=scale-down,q=70,metadata=none,w=720/app/images/category/cms_images/icon/1487_1679466558536.png",
    "https://cdn.grofers.com/cdn-cgi/image/f=auto,fit=scale-down,q=70,metadata=none,w=720/app/images/category/cms_images/icon/14_1678949253289.png",
    "https://cdn.grofers.com/cdn-cgi/image/f=auto,fit=scale-down,q=70,metadata=none,w=360/app/images/category/cms_images/icon/888_1688712847171.png",
    "https://cdn.grofers.com/cdn-cgi/image/f=auto,fit=scale-down,q=70,metadata=none,w=360/app/images/category/cms_images/icon/12_1670926444151.png",
    "https://cdn.grofers.com/cdn-cgi/image/f=auto,fit=scale-down,q=70,metadata=none,w=360/app/images/category/cms_images/icon/15_1676610279582.png",
    "https://cdn.grofers.com/cdn-cgi/image/f=auto,fit=scale-down,q=70,metadata=none,w=720/app/images/category/cms_images/icon/332_1680269009421.png",
    // Add as many as you want
  ];
  const imageCache = JSON.parse(localStorage.getItem("imageCache") || "{}");

  const hashString = (str) => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0; // Convert to 32bit integer
    }
    return Math.abs(hash);
  };

  const getConsistentRandomImage = (productId) => {
    const key = `${productId}-${9999}`;
    const hash = hashString(key);
    const index = hash % myImages.length;
    return myImages[index];
  };

  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [displayedPlaceholder, setDisplayedPlaceholder] = useState(placeholders[0]);

  useEffect(() => {
    const interval = setInterval(() => {
      setFade(false); // start fade-out
      setTimeout(() => {
        setPlaceholderIndex((prev) => (prev + 1) % placeholders.length);
        setFade(true); // fade-in after placeholder change
      }, 300); // delay sync with transition
    }, 1500);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    setDisplayedPlaceholder(placeholders[placeholderIndex]);
  }, [placeholderIndex]);


  // --- FETCH THE CATALOGUE A RETAILER CAN ORDER FROM ---
  //
  // GET /products/connected-distributors returns a FLAT list: one row per
  // (distributor, variant). The UI needs it grouped into products, each with a
  // `variants` array and a single distributor. One card per (product,
  // distributor) pair, so the same catalogue item stocked by two distributors
  // stays orderable from each.
  const groupSellableItems = (rows, distributorNames = {}) => {
    const byCard = new Map();
    (rows || []).forEach((r) => {
      const productId = r.productId ?? r.product_id;
      const distributorId = r.distributorId ?? r.distributor_id;
      if (!productId || !distributorId) return;
      const cardId = `${productId}__${distributorId}`;
      if (!byCard.has(cardId)) {
        byCard.set(cardId, {
          id: cardId,
          productId,
          name: r.productName || r.name || "Unnamed product",
          category: r.category || "Other",
          subcategory: r.subcategory || "General",
          imageUrl: r.imageUrl || r.image_url || null,
          distributorId,
          distributor:
            distributorNames[distributorId] ||
            r.distributorName ||
            r.distributorCompanyName ||
            "Distributor",
          variants: [],
        });
      }
      byCard.get(cardId).variants.push({
        id: r.variantId ?? r.variant_id,
        name: r.variantName || r.name || "Default",
        sku: r.sku || "",
        unit: r.unit || "",
        mrp: Number(r.mrp) || 0,
        stock: Number(r.stock) || 0,
        sellingPrice: Number(r.sellingPrice ?? r.selling_price ?? r.price) || 0,
      });
    });
    return Array.from(byCard.values());
  };

  const applyCatalogue = (grouped) => {
    setProductData(grouped);
    setInventoryArr(grouped);

    const structure = {};
    grouped.forEach((product) => {
      const category = product.category || "Other";
      const subcategory = product.subcategory || "General";
      if (!structure[category]) structure[category] = {};
      if (!structure[category][subcategory]) structure[category][subcategory] = [];
      if (!structure[category][subcategory].includes(product.name)) {
        structure[category][subcategory].push(product.name);
      }
    });
    setCategoryStructure(structure);

    setActiveCategory((prev) =>
      prev && structure[prev] ? prev : Object.keys(structure)[0] || null
    );
  };

  const loadCatalogue = async () => {
    setIsLoading(true);
    try {
      // Distributor names are cosmetic - the sellable-items rows only carry ids.
      const names = {};
      try {
        const dRes = await API.get("/connections/retailer/distributors");
        (dRes.data?.distributors || []).forEach((d) => {
          names[d.id || d._id] = d.companyName || d.company_name || d.name;
        });
      } catch {
        /* fall back to "Distributor" */
      }

      const response = await API.get("/products/connected-distributors");
      const rows = Array.isArray(response.data)
        ? response.data
        : response.data?.products || response.data?.items || [];
      applyCatalogue(groupSellableItems(rows, names));
    } catch (error) {
      setProductData([]);
      setInventoryArr([]);
      setCategoryStructure({});
    }
    setIsLoading(false);
  };

  useEffect(() => {
    loadCatalogue();
    // eslint-disable-next-line
  }, []);

  // --- ORDER QUANTITIES ---
  useEffect(() => {
    const initialQuantities = {};
    productData.forEach(product => {
      (product.variants || []).forEach(variant => {
        initialQuantities[`${product.id}-${variant.id}`] = {
          quantity: 0,
          unit: "box"
        };
      });
    });
    setOrderQuantities(initialQuantities);
  }, [productData]);

  useEffect(() => {
    // Only run if inventoryArr or productData are loaded
    if (inventoryArr.length === 0 && productData.length === 0) return;

    const fetchCart = async () => {
      try {
        // 1. Fetch from backend
        const res = await API.get('/cart');
        let backendCart = Array.isArray(res.data) ? res.data : [];
        // 3. Enrich cart items with product/variant info
        const enrichedCart = backendCart.map(item => {

          // Find product in inventoryArr or productData
          const product =
            productData.find(p => String(p.productId) === String(item.productId));
          if (!product) return item;
          // Find variant by id or _id
          const variant =
            (product.variants || []).find(
              v => String(v.id) === String(item.variantId) || String(v._id) === String(item.variantId)
            );
          if (!variant) return item;

          return {
            ...item,
            id: `${product.id}-${variant.id || variant._id}`,
            productName: product.name,
            productIcon: product.icon,
            variantName: variant.name || "",
            price: variant.sellingPrice || 0,
            totalPrice: (variant.sellingPrice || 0) * (item.quantity || 1),
            distributor: product.distributor || "Unknown Distributor",
            sku: variant.sku || "",
            distributorId: product.distributorId || item.distributorId,
            distributorName: product.distributor || "Unknown Distributor"
          };
        });
        console.log("Enriched cart items:", enrichedCart);

        setCartItems(enrichedCart);
      } catch (error) {
        setCartItems([]);
      }
      setProductsLoaded(true);
    };

    fetchCart();
    // eslint-disable-next-line
  }, [inventoryArr, productData]);

  // Persist newly added lines to the server cart. There is no bulk "save" endpoint;
  // POST /cart/add upserts one (variant) line at a time.
  const persistCartLines = (lines) => {
    lines.forEach((line) => {
      API.post('/cart/add', {
        variantId: line.variantId,
        distributorId: line.distributorId,
        quantity: line.quantity,
        unit: line.unit,
        price: line.price,
      }).catch((e) => console.warn('cart/add failed:', e?.message));
    });
  };

  // --- UTILITY FUNCTIONS ---
  const updateUnit = (productId, variantId, unit) => {
    const key = `${productId}-${variantId}`;
    setOrderQuantities(prev => ({
      ...prev,
      [key]: {
        ...prev[key],
        unit
      }
    }));
  };

  const addToCart = (product) => {
    const newItems = (product.variants || []).map(variant => {
      const key = `${product.id}-${variant.id}`;
      const quantity = orderQuantities[key]?.quantity || 0;
      if (quantity > 0) {
        return {
          id: key,
          productId: product.productId,
          variantId: variant.id,
          productName: product.name,
          productIcon: product.icon,
          sku: variant.sku || "",
          variantName: variant.name,
          price: variant.sellingPrice,
          quantity,
          unit: orderQuantities[key]?.unit || "box",
          totalPrice: variant.sellingPrice * quantity,
          distributorId: product.distributorId,
          distributor: product.distributor || "Unknown Distributor",
          distributorName: product.distributor || "Unknown Distributor"
        };
      }
      return null;
    }).filter(Boolean);

    if (newItems.length === 0) {
      alert("Please select quantity for at least one variant");
      return;
    }

    persistCartLines(newItems);

    setCartItems(prevCart => {
      const updatedCart = [...prevCart];

      newItems.forEach(newItem => {
        const existingIndex = updatedCart.findIndex(
          item => item.productId === newItem.productId && item.variantId === newItem.variantId
        );

        if (existingIndex !== -1) {
          const existingItem = updatedCart[existingIndex];
          const newQuantity = existingItem.quantity + newItem.quantity;
          updatedCart[existingIndex] = {
            ...existingItem,
            quantity: newQuantity,
            totalPrice: newQuantity * existingItem.price,
          };
        } else {
          updatedCart.push(newItem);
        }
      });

      return updatedCart;
    });

    // Reset input quantities
    const resetQuantities = {};
    (product.variants || []).forEach(variant => {
      const key = `${product.id}-${variant.id}`;
      resetQuantities[key] = {
        ...orderQuantities[key],
        quantity: 0
      };
    });

    setOrderQuantities(prev => ({
      ...prev,
      ...resetQuantities
    }));
  };


  const removeFromCart = (itemId) => {
    setCartItems(prev => prev.filter(item => item.id !== itemId));
  };

  const getCartTotal = () => {
    return cartItems.reduce((total, item) => total + item.totalPrice, 0).toLocaleString();
  };

  // First, add this helper function inside your component
  const hasAnyQuantities = () => {
    return Object.values(orderQuantities).some(item => item.quantity > 0);
  };

  // Add this function to handle adding all items
  const addAllToCart = () => {
    const itemsToAdd = [];

    currentProducts.forEach(product => {
      (product.variants || []).forEach(variant => {
        const key = `${product.id}-${variant.id}`;
        const quantity = orderQuantities[key]?.quantity || 0;
        if (quantity > 0) {
          itemsToAdd.push({
            id: key,
            distributorId: product.distributorId,
            sku: variant.sku || "",
            productId: product.productId,
            variantId: variant.id,
            productName: product.name,
            productIcon: product.icon,
            variantName: variant.name,
            price: variant.sellingPrice,
            quantity,
            unit: orderQuantities[key]?.unit || "box",
            totalPrice: variant.sellingPrice * quantity,
            distributor: product.distributor || "Unknown Distributor",
            distributorName: product.distributor || "Unknown Distributor"
          });
        }
      });
    });

    if (itemsToAdd.length === 0) {
      alert("Please select quantity for at least one item");
      return;
    }

    persistCartLines(itemsToAdd);

    setCartItems(prevCart => {
      const updatedCart = [...prevCart];

      itemsToAdd.forEach(newItem => {
        const existingIndex = updatedCart.findIndex(
          item => item.productId === newItem.productId && item.variantId === newItem.variantId
        );

        if (existingIndex !== -1) {
          const existingItem = updatedCart[existingIndex];
          const newQuantity = existingItem.quantity + newItem.quantity;
          updatedCart[existingIndex] = {
            ...existingItem,
            quantity: newQuantity,
            totalPrice: newQuantity * existingItem.price,
          };
        } else {
          updatedCart.push(newItem);
        }
      });

      return updatedCart;
    });

    // Reset all selected quantities
    const resetQuantities = {};
    Object.keys(orderQuantities).forEach(key => {
      resetQuantities[key] = { ...orderQuantities[key], quantity: 0 };
    });

    setOrderQuantities(prev => ({
      ...prev,
      ...resetQuantities
    }));
  };


  // Add this JSX right before the closing </div> of the main container
  // (before the Cart Sidebar)
  const handleCheckout = async () => {
    try {
      setIsLoading(true);
      const selectedItems = getSelectedCartItems();
      // Group by distributor
      const distributorGroups = {};
      selectedItems.forEach(item => {
        const distributor = item.distributorId; // Only use the ID!
        if (!distributorGroups[distributor]) distributorGroups[distributor] = [];
        distributorGroups[distributor].push(item);
      });
      console.log("Placing order payload:", { distributorGroups });

      // Place an order for each distributor
      for (const [distributorId, items] of Object.entries(distributorGroups)) {
        await API.post('/orders/create', {
          distributorId,
          items: items.map(item => ({
            productId: item.productId,
            variantId: item.variantId,
            sku: item.sku,
            quantity: item.quantity,
            unit: item.unit
          }))
        });
      }

      setCartItems([]);
      setShowCart(false);
      alert('Order(s) placed successfully!');
    } catch (error) {
      console.error('Checkout error:', error);
      alert('Failed to place order. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // --- SEARCH ---
  const performGlobalSearch = (query) => {
    if (!query.trim()) {
      setSearchResults([]);
      setShowGlobalSearch(false);
      return;
    }
    const results = [];
    const queryLower = query.toLowerCase();
    productData.forEach(product => {
      const name = (product.name || "").toLowerCase();
      const distributor = (product.distributor || "").toLowerCase();
      if (name.includes(queryLower)) {
        results.push({ ...product, matchType: 'product' });
      } else if (distributor.includes(queryLower)) {
        results.push({ ...product, matchType: 'distributor' });
      } else {
        const matchingVariants = (product.variants || []).filter(variant =>
          (variant.name || "").toLowerCase().includes(queryLower)
        );
        if (matchingVariants.length > 0) {
          results.push({ ...product, matchType: 'variant', matchingVariants });
        }
      }
    });
    setSearchResults(results);
    setShowGlobalSearch(results.length > 0);
  };

  // --- VOICE SEARCH ---
  const startVoiceSearch = () => {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'en-US';
      recognition.onstart = () => setIsListening(true);
      recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        setSearchQuery(transcript);
        performGlobalSearch(transcript);
      };
      recognition.onerror = () => setIsListening(false);
      recognition.onend = () => setIsListening(false);
      recognitionRef.current = recognition;
      recognition.start();
    } else {
      alert('Speech recognition not supported in this browser');
    }
  };
  const stopVoiceSearch = () => {
    if (recognitionRef.current) recognitionRef.current.stop();
    setIsListening(false);
  };

  const navigateToProduct = (product) => {
    console.log("Navigating to product:", product);
    setActiveCategory(product.category);
    setActivesubcategory(product.subcategory);
    setShowGlobalSearch(false);
    setSearchQuery("");
    setSearchResults([]);
  };

  const highlightText = (text, query) => {
    if (!query) return text;
    const regex = new RegExp(`(${query})`, "gi");
    return (
      <span
        dangerouslySetInnerHTML={{
          __html: text.replace(regex, (match) => `<mark class="bg-yellow-200 px-1 rounded">${match}</mark>`),
        }}
      />
    );
  };
  const getStockStatus = (variants) => {
    const totalStock = variants.reduce((sum, v) => sum + v.stock, 0);
    const hasOutOfStock = variants.some(v => v.stock === 0);
    const hasLowStock = variants.some(v => v.stock > 0 && v.stock <= 5);
    if (totalStock === 0) return { status: 'out', color: 'red', text: 'Out of Stock' };
    if (hasOutOfStock || hasLowStock) return { status: 'low', color: 'yellow', text: 'Low Stock' };
    return { status: 'good', color: 'green', text: 'In Stock' };
  };

  const getPriceRange = (variants) => {
    const prices = variants.map(v => v.sellingPrice);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    return min === max ? `₹${min.toLocaleString()}` : `₹${min.toLocaleString()} - ₹${max.toLocaleString()}`;
  };

  const updateQuantity = (productId, variantId, value) => {
    const key = `${productId}-${variantId}`;
    setOrderQuantities(prev => ({
      ...prev,
      [key]: {
        ...prev[key],
        quantity: Math.max(0, value)
      }
    }));
  };

  // --- CATEGORY/subcategory LOGIC ---
  const handleCategoryClick = (category) => {
    setActiveCategory(category);
    setActivesubcategory(null); // Reset subcategory when changing category
  };

  const handlesubcategoryClick = (subcategory) => {
    setActivesubcategory(subcategory);
  };

  // --- PRODUCT FILTERING ---
  const getCurrentProducts = () => {
    let products;
    if (viewMode === "categories") {
      products = inventoryArr.filter(p =>
        p.category === activeCategory &&
        (!activesubcategory || p.subcategory === activesubcategory)
      );
    } else {
      // Group by distributors
      const distributorProducts = {};
      inventoryArr.forEach(product => {
        if (!distributorProducts[product.distributor]) {
          distributorProducts[product.distributor] = [];
        }
        distributorProducts[product.distributor].push(product);
      });
      products = distributorProducts[activeCategory] || [];
    }
    // Apply filters
    return products.filter(product => {
      const variants = product.variants || [];
      if (filterType === "low-stock") {
        return variants.some(v => v.stock > 0 && v.stock <= 5);
      } else if (filterType === "out-of-stock") {
        return variants.some(v => v.stock === 0);
      }
      return true;
    }).sort((a, b) => {
      let aVal, bVal;
      const aVars = a.variants || [];
      const bVars = b.variants || [];
      switch (sortBy) {
        case 'stock':
          aVal = aVars.reduce((sum, v) => sum + v.stock, 0);
          bVal = bVars.reduce((sum, v) => sum + v.stock, 0);
          break;
        case 'price':
          aVal = aVars.length ? Math.min(...aVars.map(v => v.sellingPrice)) : 0;
          bVal = bVars.length ? Math.min(...bVars.map(v => v.sellingPrice)) : 0;
          break;
        default:
          aVal = (a.name || "").toLowerCase();
          bVal = (b.name || "").toLowerCase();
      }
      if (sortOrder === 'desc') {
        return aVal < bVal ? 1 : -1;
      }
      return aVal > bVal ? 1 : -1;
    });
  };

  const currentProducts = getCurrentProducts();

  // --- DISTRIBUTOR MODAL LOGIC ---
  const allDistributors = [...new Set(productData.map(p => p.distributorId).filter(Boolean))];
  const filteredDistributors = allDistributors.filter(d =>
    d.toLowerCase().includes(distributorSearch.toLowerCase())
  );

  // Fetch products for the selected distributor (from Products model)
  const [modalProducts, setModalProducts] = useState([]);
  const fetchDistributorProducts = async (distributorId) => {
    setIsLoading(true);
    try {
      const res = await API.get(`/products/get?distributorId=${distributorId}`);
      setModalProducts(res.data || []);
    } catch {
      setModalProducts([]);
    }
    setIsLoading(false);
  };

  // When modalDistributor changes, fetch products
  useEffect(() => {
    if (modalDistributor) fetchDistributorProducts(modalDistributor);
  }, [modalDistributor]);

  // Cache for distributor products
  const [distributorProductsCache, setDistributorProductsCache] = useState({});

  // Fetch products for the selected distributor (from Products model)
  useEffect(() => {
    if (!modalDistributor) return;

    // If already cached, use cache
    if (distributorProductsCache[modalDistributor]) {
      setModalProducts(distributorProductsCache[modalDistributor]);
      return;
    }
    // Otherwise, fetch and cache
    setIsLoading(true);
    API.get(`/products/get?distributorId=${modalDistributor}`)
      .then(res => {
        const products = res.data || [];
        setModalProducts(products);
        setDistributorProductsCache(prev => ({
          ...prev,
          [modalDistributor]: products
        }));
      })
      .catch(() => setModalProducts([]))
      .finally(() => setIsLoading(false));
  }, [modalDistributor]);

  const updateCartItemQuantity = (itemId, newQuantity) => {
    setCartItems(prev =>
      prev.map(item =>
        item.id === itemId
          ? { ...item, quantity: newQuantity, totalPrice: item.price * newQuantity }
          : item
      )
    );
  };

  const handleAddVariantToInventory = async (variantId) => {
    setIsAddingToInventory(true);
    try {
      await API.post("/inventory/add", { variantId });
      await loadCatalogue();
      alert("Variant added to your inventory!");
    } catch {
      alert("Failed to add variant to inventory.");
    }
    setIsAddingToInventory(false);
  };

  // New function to group cart items by distributor
  const groupCartByDistributor = () => {
    const groups = {};
    cartItems.forEach(item => {
      const distributorId = item.distributorId;
      if (!distributorId) {
        console.warn('Cart item missing distributorId:', item);
        return;
      }
      if (!groups[distributorId]) groups[distributorId] = [];
      groups[distributorId].push(item);
    });
    return groups;
  };

  const getSelectedCartItems = () => {
    const groups = groupCartByDistributor();
    let selected = [];
    Object.entries(groups).forEach(([distributor, items]) => {
      if (selectedDistributors[distributor] !== false) {
        selected = selected.concat(items);
      }
    });
    return selected;
  };

  const location = useLocation();

  useEffect(() => {
    setShowDistributorModal(false);
    setModalDistributor(null);
  }, [location.pathname]);


  // --- RENDER ---
  return (
    <div className="min-h-screen bg-slate-50 font-sans">
      <div className="relative">
        {/* Header */}
        <header className="sticky top-0 z-40 h-20 bg-white border-b border-slate-200 shadow-sm pr-4 sm:pr-10 pt-4">
          <div className="w-full px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-full">

              {/* Brand Section */}
              <div className="flex items-center space-x-4 min-w-0">
                <div className="flex items-center space-x-3">
                  <div className="hidden sm:block">
                    <h1 className="text-xl lg:text-2xl font-bold text-slate-900 tracking-tight pl-12">
                      Tiwari Stores
                      <div className="relative inline-block ml-3">
                        <span className="relative -top-0.5 left-0 text-xs font-medium text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200">
                          {currentProducts.length}
                        </span>
                      </div>
                    </h1>
                  </div>
                </div>
              </div>

              {/* Search Section with highest z-index */}
              <div className="flex-1 max-w-2xl mx-4 lg:mx-8 relative z-50">
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <Search className="h-5 w-5 text-slate-400 group-focus-within:text-indigo-500 transition-colors" />
                  </div>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      performGlobalSearch(e.target.value);
                    }}
                    className="block w-full pl-11 pr-12 py-3 border border-slate-200 rounded-xl leading-5 bg-slate-50 placeholder-slate-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all duration-200 shadow-sm"
                    placeholder={displayedPlaceholder}
                  />
                  <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
                    <button
                      onClick={isListening ? stopVoiceSearch : startVoiceSearch}
                      className={`p-2 rounded-lg transition-all duration-200 ${isListening
                          ? 'bg-red-50 text-red-500 hover:bg-red-100'
                          : 'text-slate-400 hover:text-indigo-500 hover:bg-slate-100'
                        }`}
                    >
                      {isListening ? <MicOff className="h-5 w-5 animate-pulse" /> : <Mic className="h-5 w-5" />}
                    </button>
                  </div>

                  {/* Search Results Dropdown */}
                  {showGlobalSearch && searchResults.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl shadow-xl border border-slate-200 max-h-[60vh] overflow-y-auto z-50 divide-y divide-slate-100">
                      {searchResults.map((result, index) => (
                        <div
                          key={index}
                          onClick={() => navigateToProduct(result)}
                          className="p-4 hover:bg-slate-50 cursor-pointer transition-colors duration-150 group"
                        >
                          <div className="flex items-start space-x-4">
                            <div className="flex-shrink-0">
                              <div className="h-12 w-12 rounded-lg bg-slate-100 flex items-center justify-center group-hover:bg-white group-hover:shadow-sm transition-all">
                                <img
                                  src={result.imageUrl || getConsistentRandomImage(result.id)}
                                  alt={result.name}
                                  className="h-8 w-8 object-contain opacity-75 group-hover:opacity-100 transition-opacity"
                                />
                              </div>
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between">
                                <h4 className="text-sm font-medium text-slate-900 truncate group-hover:text-indigo-600 transition-colors">
                                  {highlightText(result.name, searchQuery)}
                                </h4>
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-800">
                                  {result.category}
                                </span>
                              </div>
                              <p className="text-sm text-slate-500 mt-0.5">
                                {result.distributor}
                              </p>
                              {result.matchType === 'variant' && (
                                <div className="mt-2 space-y-1">
                                  {result.matchingVariants.map(v => (
                                    <div key={v.id} className="text-xs text-slate-500 flex items-center">
                                      <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 mr-2"></div>
                                      {highlightText(v.name, searchQuery)} - ₹{v.sellingPrice}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Right Actions */}
              <div className="flex items-center space-x-2 sm:space-x-4">
                <button
                  onClick={() => setShowCart(true)}
                  className="relative p-2 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all duration-200 group"
                >
                  <ShoppingCart className="h-6 w-6" />
                  {cartItems.length > 0 && (
                    <span className="absolute top-1.5 right-1.5 block h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white transform scale-100 group-hover:scale-110 transition-transform" />
                  )}
                </button>
              </div>
            </div>
          </div>
        </header>

        <div className="flex h-[calc(100vh-5rem)]">
          {/* Sidebar Navigation */}
          <aside className="w-64 bg-white border-r border-slate-200 flex-shrink-0 overflow-y-auto hidden lg:block">
            <div className="p-4">
              <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4 px-2">
                Categories
              </h2>
              <nav className="space-y-1">
                {Object.keys(categoryStructure).map((category) => (
                  <div key={category} className="space-y-1">
                    <button
                      onClick={() => handleCategoryClick(category)}
                      className={`w-full flex items-center justify-between px-3 py-2 text-sm font-medium rounded-lg transition-colors duration-150 ${activeCategory === category
                          ? 'bg-indigo-50 text-indigo-700'
                          : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                        }`}
                    >
                      <div className="flex items-center">
                        <span className="truncate">{category}</span>
                      </div>
                      {activeCategory === category && (
                        <ChevronRight className="h-4 w-4 text-indigo-500" />
                      )}
                    </button>

                    {/* Subcategories */}
                    {activeCategory === category && (
                      <div className="pl-4 space-y-1 mt-1">
                        {Object.keys(categoryStructure[category]).map((sub) => (
                          <button
                            key={sub}
                            onClick={(e) => {
                              e.stopPropagation();
                              handlesubcategoryClick(sub);
                            }}
                            className={`w-full flex items-center px-3 py-1.5 text-sm rounded-md transition-colors duration-150 ${activesubcategory === sub
                                ? 'text-indigo-600 bg-indigo-50/50 font-medium'
                                : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'
                              }`}
                          >
                            <div className={`w-1.5 h-1.5 rounded-full mr-2 ${activesubcategory === sub ? 'bg-indigo-500' : 'bg-slate-300'
                              }`} />
                            <span className="truncate">{sub}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </nav>
            </div>
          </aside>

          {/* Main Content */}
          <main className="flex-1 overflow-y-auto bg-slate-50 p-4 sm:p-6 lg:p-8">
            {/* Filters Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
              <div className="flex items-center space-x-2 overflow-x-auto pb-2 sm:pb-0 no-scrollbar">
                <button
                  onClick={() => setFilterType('all')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${filterType === 'all'
                      ? 'bg-slate-900 text-white shadow-sm'
                      : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                    }`}
                >
                  All Products
                </button>
                <button
                  onClick={() => setFilterType('low-stock')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors flex items-center ${filterType === 'low-stock'
                      ? 'bg-amber-100 text-amber-800 border border-amber-200'
                      : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                    }`}
                >
                  <AlertTriangle className="w-4 h-4 mr-2" />
                  Low Stock
                </button>
                <button
                  onClick={() => setFilterType('out-of-stock')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors flex items-center ${filterType === 'out-of-stock'
                      ? 'bg-red-100 text-red-800 border border-red-200'
                      : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                    }`}
                >
                  <X className="w-4 h-4 mr-2" />
                  Out of Stock
                </button>
              </div>

              <div className="flex items-center space-x-2">
                <div className="relative">
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                    className="appearance-none bg-white border border-slate-200 text-slate-700 py-2 pl-4 pr-10 rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent shadow-sm cursor-pointer"
                  >
                    <option value="name">Name</option>
                    <option value="price">Price</option>
                    <option value="stock">Stock</option>
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                </div>
                <button
                  onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
                  className="p-2 bg-white border border-slate-200 rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-slate-50 transition-colors shadow-sm"
                >
                  {sortOrder === 'asc' ? <TrendingUp className="w-4 h-4" /> : <TrendingUp className="w-4 h-4 transform rotate-180" />}
                </button>
              </div>
            </div>

            {/* Products Grid */}
            {isLoading ? (
              <div className="flex items-center justify-center h-64">
                <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
              </div>
            ) : currentProducts.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-center">
                <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
                  <Package className="w-8 h-8 text-slate-400" />
                </div>
                <h3 className="text-lg font-medium text-slate-900">No products found</h3>
                <p className="text-slate-500 mt-1">Try adjusting your filters or search query</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-20">
                {currentProducts.map((product) => (
                  <div
                    key={product.id}
                    className="bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden group flex flex-col"
                    onMouseEnter={() => setHoveredProduct(product.id)}
                    onMouseLeave={() => setHoveredProduct(null)}
                  >
                    {/* Product Image */}
                    <div className="aspect-[4/3] bg-slate-50 relative overflow-hidden border-b border-slate-100">
                      <img
                        src={product.imageUrl || getConsistentRandomImage(product.id)}
                        alt={product.name}
                        className="w-full h-full object-contain p-4 transition-transform duration-300 group-hover:scale-105"
                      />
                      <div className="absolute top-2 right-2 flex flex-col gap-2">
                        {(product.variants || []).some(v => v.stock <= 5 && v.stock > 0) && (
                          <span className="bg-amber-100 text-amber-800 text-xs font-medium px-2 py-1 rounded-full shadow-sm border border-amber-200">
                            Low Stock
                          </span>
                        )}
                        {(product.variants || []).length > 0 && product.variants.every(v => v.stock === 0) && (
                          <span className="bg-red-100 text-red-800 text-xs font-medium px-2 py-1 rounded-full shadow-sm border border-red-200">
                            Out of Stock
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Product Info */}
                    <div className="p-4 flex-1 flex flex-col">
                      <div className="mb-2">
                        <h3 className="text-base font-semibold text-slate-900 line-clamp-1 group-hover:text-indigo-600 transition-colors">
                          {product.name}
                        </h3>
                        <p className="text-xs text-slate-500 mt-1 flex items-center">
                          <Building2 className="w-3 h-3 mr-1" />
                          {product.distributor}
                        </p>
                      </div>

                      {/* Variants */}
                      <div className="space-y-3 mt-auto">
                        {(product.variants || []).map((variant) => {
                          const key = `${product.id}-${variant.id}`;
                          const quantity = orderQuantities[key]?.quantity || 0;
                          const stockStatus = getStockStatus([variant]);

                          return (
                            <div key={variant.id} className="bg-slate-50 rounded-lg p-2 border border-slate-100">
                              <div className="flex justify-between items-center mb-2">
                                <span className="text-sm font-medium text-slate-700">{variant.name}</span>
                                <span className="text-sm font-semibold text-slate-900">₹{variant.sellingPrice}</span>
                              </div>

                              <div className="flex items-center justify-between">
                                <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${stockStatus.status === 'out' ? 'bg-red-100 text-red-700' :
                                    stockStatus.status === 'low' ? 'bg-amber-100 text-amber-700' :
                                      'bg-emerald-100 text-emerald-700'
                                  }`}>
                                  {variant.stock} left
                                </span>

                                <div className="flex items-center bg-white rounded-lg border border-slate-200 shadow-sm">
                                  <button
                                    onClick={() => updateQuantity(product.id, variant.id, quantity - 1)}
                                    className="p-1 hover:bg-slate-50 text-slate-600 rounded-l-lg disabled:opacity-50"
                                    disabled={quantity === 0}
                                  >
                                    <Minus className="w-3 h-3" />
                                  </button>
                                  <input
                                    type="number"
                                    value={quantity}
                                    onChange={(e) => updateQuantity(product.id, variant.id, parseInt(e.target.value) || 0)}
                                    className="w-8 text-center text-xs font-medium border-x border-slate-200 py-1 focus:outline-none"
                                  />
                                  <button
                                    onClick={() => updateQuantity(product.id, variant.id, quantity + 1)}
                                    className="p-1 hover:bg-slate-50 text-slate-600 rounded-r-lg disabled:opacity-50"
                                    disabled={quantity >= variant.stock}
                                  >
                                    <Plus className="w-3 h-3" />
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      <button
                        onClick={() => addToCart(product)}
                        disabled={!(product.variants || []).some(v => (orderQuantities[`${product.id}-${v.id}`]?.quantity || 0) > 0)}
                        className="w-full mt-4 bg-indigo-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed transition-colors shadow-sm"
                      >
                        Add to Cart
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </main>
        </div>
      </div>

      {/* Cart Sidebar */}
      {showCart && (
        <RetailerCart
          cartItems={cartItems}
          onClose={() => setShowCart(false)}
          onUpdateQuantity={updateCartItemQuantity}
          onRemoveItem={removeFromCart}
          onCheckout={handleCheckout}
          isLoading={isLoading}
        />
      )}
    </div>
  );
}