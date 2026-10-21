import { newsApi } from '../models/news/functions'

export const {
  settings,
  saveSettings,
  forUser,
  withDailyTime,
  postBriefing,
  sendDaily,
} = newsApi
