import { shoppingApi } from '../models/shopping/functions'

export const {
  details,
  saveDetails,
  forAssistant,
  addToCart,
  cart,
  setQuantity,
  clearShop,
  startWatch,
  watch,
  stopWatch,
  checkWatch,
} = shoppingApi
