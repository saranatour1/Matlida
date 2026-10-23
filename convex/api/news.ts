import { newsApi } from '../models/news/functions'

export const {
  settings,
  saveSettings,
  forUser,
  get,
  scheduleNext,
  postBriefing,
  sendDaily,
} = newsApi
