import React, { useState, useEffect, useRef } from "react";
import { X, Mic, MicOff, ShoppingCart, Plus, Trash2, Search } from "lucide-react";
import { parseMultipleOrders, findBestProductMatch } from "./posVoice";

/**
 * POS "add items to the sale" modal.
 *
 * The voice/manual parsing machinery is unchanged from the original (now in
 * posVoice.js); what changed is that the catalogue is the retailer's real
 * shelf, passed in as `products`, instead of a hardcoded list. Each product is
 * { variantId, item, brand, rate, unit, category, stock }.
 *
 * onAddItems receives an array of { variantId, item, brand, quantity, rate, unit }.
 */
const CreateOrder = ({ isOpen, onClose, onAddItems, products = [] }) => {
  const [voiceInput, setVoiceInput] = useState({
    transcript: "",
    isListening: false,
    isSupported: false,
  });
  const [staged, setStaged] = useState([]); // items parsed but not yet added
  const [manualQuery, setManualQuery] = useState("");
  const [manualQty, setManualQty] = useState(1);
  const [errors, setErrors] = useState({});
  const [activeTab, setActiveTab] = useState("search");
  const recognitionRef = useRef(null);

  const initSpeech = () => {
    if (typeof window === "undefined") return null;
    if ("webkitSpeechRecognition" in window || "SpeechRecognition" in window) {
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      const recognition = new SR();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = "en-US";
      recognition.onstart = () => {
        setVoiceInput((p) => ({ ...p, isListening: true }));
        setErrors((p) => ({ ...p, voice: "" }));
      };
      recognition.onresult = (event) => {
        const t = event.results[0][0].transcript;
        setVoiceInput((p) => ({
          ...p,
          transcript: p.transcript ? p.transcript + " " + t : t,
        }));
      };
      recognition.onerror = (event) => {
        setVoiceInput((p) => ({ ...p, isListening: false }));
        const msgs = {
          "not-allowed": "Microphone access denied. Allow microphone permissions.",
          "no-speech": "No speech detected. Try speaking clearly.",
          network: "Network error. Check your connection.",
          "audio-capture": "No microphone found.",
        };
        setErrors((p) => ({ ...p, voice: msgs[event.error] || "Speech recognition error." }));
      };
      recognition.onend = () => setVoiceInput((p) => ({ ...p, isListening: false }));
      setVoiceInput((p) => ({ ...p, isSupported: true }));
      return recognition;
    }
    setVoiceInput((p) => ({ ...p, isSupported: false }));
    return null;
  };

  useEffect(() => {
    if (isOpen) {
      recognitionRef.current = initSpeech();
      setStaged([]);
      setVoiceInput({ transcript: "", isListening: false, isSupported: false });
      setErrors({});
    }
    return () => {
      if (recognitionRef.current) recognitionRef.current.stop();
    };
  }, [isOpen]);

  const startVoice = () => {
    if (!recognitionRef.current) {
      setErrors((p) => ({ ...p, voice: "Speech recognition not supported in this browser." }));
      return;
    }
    try {
      recognitionRef.current.start();
    } catch {
      setErrors((p) => ({ ...p, voice: "Could not start voice input. Try again." }));
    }
  };
  const stopVoice = () => {
    recognitionRef.current?.stop();
    setVoiceInput((p) => ({ ...p, isListening: false }));
  };

  const relatedFor = (parsedItem) =>
    products
      .filter((product) => {
        const itemWords = parsedItem.item.toLowerCase().split(" ");
        const productWords = (product.item || "").toLowerCase().split(" ");
        const itemMatch = itemWords.some((w) =>
          productWords.some((pw) => pw.includes(w) || w.includes(pw))
        );
        const brandMatch = parsedItem.brand
          ? (product.brand || "").toLowerCase().includes(parsedItem.brand.toLowerCase())
          : false;
        const catMatch = itemWords.some((w) => (product.category || "").toLowerCase().includes(w));
        return itemMatch || brandMatch || catMatch;
      })
      .slice(0, 8);

  const parseVoiceOrder = () => {
    const parsed = parseMultipleOrders(voiceInput.transcript, products);
    if (parsed.length === 0) {
      setErrors((p) => ({ ...p, parse: "Could not parse any items. Try again." }));
      return;
    }
    const mapped = parsed.map((pi) => {
      const match = findBestProductMatch(products, pi.item, pi.brand);
      return {
        key: Date.now() + Math.random(),
        variantId: match ? match.variantId : null,
        item: match ? match.item : pi.item,
        brand: match ? match.brand : pi.brand || "",
        quantity: pi.quantity || 1,
        rate: match ? match.rate : 0,
        unit: pi.unit || match?.unit || "unit",
        related: relatedFor(pi),
      };
    });
    setStaged((s) => [...s, ...mapped]);
    setVoiceInput((p) => ({ ...p, transcript: "" }));
    setErrors((p) => ({ ...p, parse: "" }));
  };

  const searchResults = manualQuery.trim()
    ? products
        .filter((p) => {
          const q = manualQuery.toLowerCase();
          return (
            (p.item || "").toLowerCase().includes(q) ||
            (p.brand || "").toLowerCase().includes(q) ||
            (p.category || "").toLowerCase().includes(q)
          );
        })
        .slice(0, 20)
    : products.slice(0, 20);

  const addFromCatalogue = (product) => {
    setStaged((s) => [
      ...s,
      {
        key: Date.now() + Math.random(),
        variantId: product.variantId,
        item: product.item,
        brand: product.brand || "",
        quantity: Number(manualQty) || 1,
        rate: product.rate,
        unit: product.unit || "unit",
        related: [],
      },
    ]);
    setManualQty(1);
  };

  const pickRelated = (key, product) =>
    setStaged((s) =>
      s.map((it) =>
        it.key === key
          ? { ...it, variantId: product.variantId, item: product.item, brand: product.brand, rate: product.rate }
          : it
      )
    );

  const setQty = (key, q) =>
    setStaged((s) => s.map((it) => (it.key === key ? { ...it, quantity: Math.max(1, q) } : it)));
  const removeStaged = (key) => setStaged((s) => s.filter((it) => it.key !== key));

  const commit = () => {
    const unmatched = staged.filter((it) => !it.variantId);
    if (unmatched.length) {
      setErrors((p) => ({
        ...p,
        commit: `${unmatched.length} item(s) aren't matched to your shelf. Pick a product for each.`,
      }));
      return;
    }
    onAddItems(
      staged.map((it) => ({
        variantId: it.variantId,
        item: it.item,
        brand: it.brand,
        quantity: it.quantity,
        rate: it.rate,
        unit: it.unit,
      }))
    );
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden border border-slate-200 flex flex-col">
        <div className="p-5 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-indigo-50 rounded-lg">
              <ShoppingCart className="w-5 h-5 text-indigo-600" />
            </div>
            <h2 className="text-lg font-semibold text-slate-900">Add items to sale</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg transition-colors">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        <div className="px-5 pt-4">
          <div className="flex border-b border-slate-200">
            {["search", "voice"].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 text-sm font-medium capitalize transition-colors ${
                  activeTab === tab
                    ? "border-b-2 border-indigo-500 text-indigo-600"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {tab === "search" ? "Search shelf" : "Voice / text"}
              </button>
            ))}
          </div>
        </div>

        <div className="p-5 overflow-y-auto flex-1">
          {activeTab === "search" && (
            <div>
              <div className="flex gap-2 mb-3">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    autoFocus
                    value={manualQuery}
                    onChange={(e) => setManualQuery(e.target.value)}
                    placeholder="Search your shelf…"
                    className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  />
                </div>
                <input
                  type="number"
                  min="1"
                  value={manualQty}
                  onChange={(e) => setManualQty(parseInt(e.target.value) || 1)}
                  className="w-16 px-2 py-2 border border-slate-300 rounded-lg text-sm"
                />
              </div>
              <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg max-h-64 overflow-y-auto">
                {searchResults.length === 0 && (
                  <p className="p-4 text-sm text-slate-500">Nothing on your shelf matches.</p>
                )}
                {searchResults.map((p) => (
                  <button
                    key={p.variantId}
                    onClick={() => addFromCatalogue(p)}
                    className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-slate-50 text-left"
                  >
                    <div>
                      <p className="text-sm font-medium text-slate-900">{p.item}</p>
                      <p className="text-xs text-slate-500">
                        {p.brand || "—"} · {p.stock} in stock
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-slate-700">₹{p.rate}</span>
                      <Plus className="w-4 h-4 text-indigo-600" />
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {activeTab === "voice" && (
            <div>
              <textarea
                placeholder="Type or dictate, e.g. '2 kg rice, 3 packets biscuits'"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg h-24 resize-none text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                value={voiceInput.transcript}
                onChange={(e) => setVoiceInput((p) => ({ ...p, transcript: e.target.value }))}
              />
              <div className="flex justify-between items-center mt-3">
                {voiceInput.isListening ? (
                  <button
                    onClick={stopVoice}
                    className="flex items-center bg-red-500 text-white px-3 py-2 rounded-lg text-sm hover:bg-red-600"
                  >
                    <MicOff className="w-4 h-4 mr-2" /> Stop
                  </button>
                ) : (
                  <button
                    onClick={startVoice}
                    className="flex items-center bg-slate-100 text-slate-700 px-3 py-2 rounded-lg text-sm hover:bg-slate-200"
                  >
                    <Mic className="w-4 h-4 mr-2" /> Record
                  </button>
                )}
                <button
                  onClick={parseVoiceOrder}
                  disabled={!voiceInput.transcript.trim()}
                  className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-indigo-700 disabled:bg-slate-300"
                >
                  Parse
                </button>
              </div>
              {errors.voice && <p className="text-red-500 text-xs mt-2">{errors.voice}</p>}
              {errors.parse && <p className="text-red-500 text-xs mt-2">{errors.parse}</p>}
            </div>
          )}

          {staged.length > 0 && (
            <div className="mt-5">
              <h3 className="text-sm font-semibold text-slate-700 mb-2">Staged ({staged.length})</h3>
              <div className="space-y-2">
                {staged.map((it) => (
                  <div
                    key={it.key}
                    className={`p-3 rounded-lg border ${
                      it.variantId ? "border-slate-200 bg-white" : "border-amber-300 bg-amber-50"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-900 truncate">{it.item}</p>
                        <p className="text-xs text-slate-500">
                          {it.brand || "—"} · ₹{it.rate} / {it.unit}
                          {!it.variantId && " · not on your shelf"}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 ml-3">
                        <input
                          type="number"
                          min="1"
                          value={it.quantity}
                          onChange={(e) => setQty(it.key, parseInt(e.target.value) || 1)}
                          className="w-14 px-2 py-1 border border-slate-300 rounded text-sm"
                        />
                        <button onClick={() => removeStaged(it.key)}>
                          <Trash2 className="w-4 h-4 text-red-500" />
                        </button>
                      </div>
                    </div>
                    {it.related && it.related.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {it.related.map((r) => (
                          <button
                            key={r.variantId}
                            onClick={() => pickRelated(it.key, r)}
                            className={`text-xs px-2 py-1 rounded-full border ${
                              r.variantId === it.variantId
                                ? "bg-indigo-50 border-indigo-300 text-indigo-700"
                                : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                            }`}
                          >
                            {r.item} · ₹{r.rate}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              {errors.commit && <p className="text-red-500 text-xs mt-2">{errors.commit}</p>}
            </div>
          )}
        </div>

        <div className="p-4 border-t border-slate-200 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg text-sm hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            onClick={commit}
            disabled={staged.length === 0}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 disabled:bg-slate-300"
          >
            Add {staged.length || ""} to sale
          </button>
        </div>
      </div>
    </div>
  );
};

export default CreateOrder;
