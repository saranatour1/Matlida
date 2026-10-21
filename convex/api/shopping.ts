import { shoppingApi } from '../models/shopping/functions'

export const {
  details,
  saveDetails,
  forAssistant,
  addItem,
  addToCart,
  cart,
  setQuantity,
  clearShop,
  startWatch,
  watch,
  stopWatch,
  dueWatches,
  recordCheck,
  checkPrices,
} = shoppingApi
