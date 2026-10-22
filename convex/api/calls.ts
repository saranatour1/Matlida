import { callLogApi } from '../models/calls/functions'
import { callsApi } from '../models/threads/calls'

export const { post, forget, turn, answer } = callsApi
export const {
  addLine,
  end,
  history,
  transcript,
  dump,
  updateLive,
  live,
  forgetLive,
  startPhone,
  phoneCall,
  setPhone,
  hangUpPhone,
  phoneState,
} = callLogApi
