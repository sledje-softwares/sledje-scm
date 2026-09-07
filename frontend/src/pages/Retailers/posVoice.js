// Voice / free-text order parsing for the POS.
//
// Lifted verbatim (behaviour-for-behaviour) from the old CreateOrder.js, which
// ran it against a hardcoded 100-item iPhone catalogue. The parsing itself is
// provider-agnostic and was the only non-trivial code in that file; the only
// change here is that the product catalogue is passed in rather than baked in,
// so it can be the retailer's real shelf (GET /sales/sellable).
import { wordsToNumbers } from "words-to-numbers";

export const knownUnits = [
  "kg", "kilogram", "g", "gram", "liters", "liter", "bottles", "packets",
  "pieces", "dozen", "box", "boxes", "l", "ml", "milliliter", "cups", "pints",
  "quarts", "ounces", "units", "pair", "pairs",
];

export function detectUnit(itemStr) {
  if (typeof itemStr !== "string") {
    return { unit: "unit", item: "unknown" };
  }
  const words = itemStr.trim().toLowerCase().split(/\s+/);

  if (knownUnits.includes(words[0])) {
    return { unit: words[0], item: words.slice(1).join(" ") || "unknown" };
  }

  const last = words[words.length - 1];
  if (knownUnits.includes(last)) {
    return { unit: last, item: words.slice(0, -1).join(" ") || "unknown" };
  }

  return { unit: "unit", item: itemStr.trim() };
}

/**
 * Turn a spoken/typed line ("2 kg rice, 3 packets parle g") into structured
 * items. `catalogue` is an array of { item, brand } used only for brand
 * extraction; pass [] if you have none.
 */
export function parseMultipleOrders(transcript, catalogue = []) {
  if (typeof transcript !== "string") return [];

  let normalized;
  try {
    transcript = transcript.replace(/[^a-zA-Z0-9\s.,]/g, "");
    transcript = transcript.replace(/\s+/g, " ").trim();
    transcript = transcript.replace(/\bto\b/g, "two");
    normalized = wordsToNumbers(transcript);
  } catch {
    normalized = transcript;
  }

  const orders = [];
  const regex = /(\d+(?:\.\d+)?)\s+([a-zA-Z][a-zA-Z\s]*?)(?=\s+\d+|$)/g;
  const knownBrands = [
    ...new Set(catalogue.map((p) => (p.brand || "").toLowerCase()).filter(Boolean)),
  ];

  let match;
  while ((match = regex.exec(normalized)) !== null) {
    const [, quantity, itemText] = match;
    const { unit, item } = detectUnit(itemText.trim());

    const words = item.split(" ");
    let extractedBrand = "";
    let cleanItem = item;

    const brandWord = words.find((word) => knownBrands.includes(word.toLowerCase()));
    if (brandWord) {
      extractedBrand = brandWord;
      cleanItem = words
        .filter((word) => word.toLowerCase() !== brandWord.toLowerCase())
        .join(" ");
    }

    orders.push({
      item: cleanItem || item,
      brand: extractedBrand,
      quantity: parseFloat(quantity),
      unit,
    });
  }

  return orders;
}

/** Best fuzzy match of a parsed item against the catalogue. */
export function findBestProductMatch(catalogue, itemText, brandText = "") {
  const searchText = `${brandText} ${itemText}`.toLowerCase().trim();

  if (brandText) {
    const exactMatch = catalogue.find(
      (p) =>
        (p.brand || "").toLowerCase() === brandText.toLowerCase() &&
        (p.item || "").toLowerCase().includes(itemText.toLowerCase())
    );
    if (exactMatch) return exactMatch;

    const brandMatch = catalogue.find(
      (p) => (p.brand || "").toLowerCase() === brandText.toLowerCase()
    );
    if (brandMatch) return brandMatch;
  }

  const brandInText = catalogue.find(
    (p) =>
      (p.brand || "") &&
      searchText.includes((p.brand || "").toLowerCase()) &&
      searchText.includes((p.item || "").toLowerCase().split(" ")[0])
  );
  if (brandInText) return brandInText;

  return catalogue.find(
    (p) =>
      (p.item || "").toLowerCase().includes(itemText.toLowerCase()) ||
      (itemText.toLowerCase().includes((p.item || "").toLowerCase().split(" ")[0]) &&
        (p.item || "").length > 0)
  );
}
