import ProductsService from "../../modules/products/products.service.js";
import Papa from "papaparse";
import xlsx from "xlsx";

export async function getProducts(req, res, next) {
  try {
    const { distributorshipId, search, page = 1, limit = 20 } = req.query;
    const data = await ProductsService.getCatalog({ distributorshipId, search, page: Number(page), limit: Number(limit) });
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function getConnectedDistributorsProducts(req, res, next) {
  try {
    const userId = req.user.id;
    const data = await ProductsService.getProductsFromConnectedDistributors(userId);
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function getSingleProduct(req, res, next) {
  try {
    const { productId } = req.params;
    const product = await ProductsService.getProductById(productId);
    if (!product) return res.status(404).json({ message: "Product not found" });
    res.json(product);
  } catch (err) {
    next(err);
  }
}

export async function addProduct(req, res, next) {
  try {
    // only distributor allowed
    if (!req.user || req.user.role !== "distributor") return res.status(403).json({ message: "Forbidden" });

    const distributorUserId = req.user.id;
    // require distributor id mapping inside service
    const payload = req.body;
    const product = await ProductsService.createCatalogProduct(req.user, payload);
    res.status(201).json({ message: "Product added successfully", product });
  } catch (err) {
    next(err);
  }
}

export async function updateProduct(req, res, next) {
  try {
    if (!req.user || req.user.role !== "distributor") return res.status(403).json({ message: "Forbidden" });

    const distributorUserId = req.user.id;
    const { productId } = req.params;
    const payload = req.body;
    const product = await ProductsService.updateCatalogProduct(req.user, productId, payload);
    res.json({ message: "Product updated successfully", product });
  } catch (err) {
    next(err);
  }
}

export async function deleteProduct(req, res, next) {
  try {
    if (!req.user || req.user.role !== "distributor") return res.status(403).json({ message: "Forbidden" });

    const distributorUserId = req.user.id;
    const { productId } = req.params;
    await ProductsService.deleteCatalogProduct(req.user, productId);
    res.json({ message: "Product deleted successfully" });
  } catch (err) {
    next(err);
  }
}


export async function bulkImportProducts(req, res, next) {
  try {
    // only distributor allowed
    if (!req.user || req.user.role !== "distributor") {
      return res.status(403).json({ message: "Forbidden" });
    }

    const { file } = req;
    if (!file) {
      return res.status(400).json({ message: "file is required" });
    }

    // Parse rows
    let rows = [];
    if (file.mimetype.includes("csv")) {
      const parsed = Papa.parse(file.buffer.toString("utf8"), {
        header: true,
        skipEmptyLines: true,
      });
      rows = parsed.data;
    } else {
      const workbook = xlsx.read(file.buffer);
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      rows = xlsx.utils.sheet_to_json(sheet);
    }

    // Pass logged-in distributor user id + rows
    await ProductsService.bulkImportForDistributor(req.user.id, rows);

    res.json({ message: "Bulk import successful" });
  } catch (err) {
    console.error("bulkImportProducts error:", err);
    next(err);
  }
}