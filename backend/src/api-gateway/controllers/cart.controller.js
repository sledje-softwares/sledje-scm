import CartService from "../../modules/cart/cart.service.js";

export async function getCart(req, res, next) {
  try {
    const data = await CartService.getCart(req.user.id);
    res.json(data);
  } catch (e) { next(e); }
}

export async function addToCart(req, res, next) {
  try {
    const data = await CartService.addToCart(req.user.id, req.body);
    res.json({ success: true, data });
  } catch (e) { next(e); }
}

export async function updateCartItem(req, res, next) {
  try {
    const data = await CartService.updateCartItem(req.user.id, req.body);
    res.json({ success: true, data });
  } catch (e) { next(e); }
}

export async function removeCartItem(req, res, next) {
  try {
    await CartService.removeCartItem(req.user.id, req.params.variantId);
    res.json({ success: true });
  } catch (e) { next(e); }
}

export async function clearCart(req, res, next) {
  try {
    await CartService.clearCart(req.user.id);
    res.json({ success: true });
  } catch (e) { next(e); }
}

export async function checkoutCart(req, res, next) {
  try {
    const order = await CartService.checkoutCart(req.user, req.body.notes);
    res.json({ success: true, order });
  } catch (e) { next(e); }
}
