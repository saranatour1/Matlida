import { plansApi } from '../models/plans/functions'

export const {
  list,
  get,
  write,
  addItems,
  addToYourList,
  clearDone,
  toggleStep,
  remove,
} = plansApi
