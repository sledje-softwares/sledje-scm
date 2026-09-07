import CartRepo from "./cart.repository.js";
import OrdersService from "../orders/orders.service.js";
import OrdersRepo from "../orders/orders.repository.js";

export default {
  async getCart(userId) {
    const retailer = await OrdersRepo.findRetailerByUserId(userId);
    return CartRepo.getCart(retailer.id);
  },

  async addToCart(userId, payload) {
    const retailer = await OrdersRepo.findRetailerByUserId(userId);

    return CartRepo.addToCart(retailer.id, payload);
  },

  async updateCartItem(userId, payload) {
    const retailer = await OrdersRepo.findRetailerByUserId(userId);
    return CartRepo.updateCartItem(retailer.id, payload);
  },

  async removeCartItem(userId, variantId) {
    const retailer = await OrdersRepo.findRetailerByUserId(userId);
    return CartRepo.removeCartItem(retailer.id, variantId);
  },

  async clearCart(userId) {
    const retailer = await OrdersRepo.findRetailerByUserId(userId);
    return CartRepo.clearCart(retailer.id);
  },

  // --- Checkout: convert cart -> multiple grouped orders ---
  async checkoutCart(user, notes = "") {
    const retailer = await OrdersRepo.findRetailerByUserId(user.id);
    const cart = await CartRepo.getCart(retailer.id);

    if (cart.length === 0) throw new Error("Cart is empty");

    // group by distributorId
    const groups = {};
    for (const item of cart) {
      if (!groups[item.distributorId]) groups[item.distributorId] = [];
      groups[item.distributorId].push(item);
    }

    const createdOrders = [];

    for (const distributorId of Object.keys(groups)) {
      const items = groups[distributorId];

      const orderPayload = {
        retailerId: retailer.id,
        distributorId,
        items: items.map((i) => ({
          variantId: i.variantId,
          quantity: i.quantity,
          unit: i.unit,
        })),
        notes,
      };

      // NOTE: createOrder's signature is (user, payload) - it needs the role to
      // authorise, not just the id.
      const order = await OrdersService.createOrder(user, orderPayload);
      createdOrders.push(order);
    }

    // Clear cart after success
    await CartRepo.clearCart(retailer.id);

    return createdOrders;
  },
};
