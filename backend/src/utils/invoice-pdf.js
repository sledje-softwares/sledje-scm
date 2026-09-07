import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";

export async function generateInvoicePDF(invoice, items) {
  return new Promise((resolve, reject) => {
    try {
      const invoicesDir = path.resolve("./invoices");
      // The directory is not part of the repo and nothing else creates it -
      // without this, the write stream below fails on a fresh checkout.
      fs.mkdirSync(invoicesDir, { recursive: true });
      const filePath = path.join(invoicesDir, `invoice-${invoice.id}.pdf`);
      const doc = new PDFDocument({ margin: 50 });
      const stream = fs.createWriteStream(filePath);

      doc.pipe(stream);

      doc.fontSize(22).text("TAX INVOICE (GST)", { align: "center" });
      doc.moveDown();

      doc.fontSize(12).text(`Invoice Number: ${invoice.invoiceNumber}`);
      doc.text(`Period: ${invoice.periodStart.toISOString().slice(0, 10)} → ${invoice.periodEnd.toISOString().slice(0, 10)}`);
      doc.text(`Total Taxable: ₹${invoice.totalTaxableValue}`);
      doc.text(`Total GST: ₹${invoice.totalGst}`);
      doc.text(`Total Amount: ₹${invoice.totalAmount}`);
      doc.moveDown();

      doc.fontSize(14).text("Items", { underline: true });
      doc.moveDown();

      items.forEach((i) => {
        doc.fontSize(10)
          .text(`Variant: ${i.variantId}`)
          .text(`HSN Code: ${i.metadata?.hsnCode || ""}`)
          .text(`GST Rate: ${i.metadata?.gstRate}%`)
          .text(`Quantity: ${i.quantity}`)
          .text(`Unit Price (Taxable): ₹${i.unitPrice}`)
          .text(`Amount: ₹${i.amount}`)
          .moveDown();
      });

      doc.end();

      stream.on("finish", () => resolve(filePath));
      stream.on("error", reject);
    } catch (err) {
      reject(err);
    }
  });
}
