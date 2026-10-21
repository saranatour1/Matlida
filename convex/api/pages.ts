import { pagesApi } from '../models/pages/functions'

export const {
  list,
  get,
  save,
  setRefresh,
  remove,
  write,
  read,
  keepUpdated,
  due,
  refreshed,
  refreshDue,
  projectOf,
} = pagesApi
