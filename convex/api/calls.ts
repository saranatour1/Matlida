import { callLogApi } from '../models/calls/functions'
import { callsApi } from '../models/threads/calls'

export const {
  post,
  forget,
  answer,
  startTurn,
  runTurn,
  turnStep,
  heard,
  setTurn,
  isCurrent,
  fastStep,
  turnFinished,
} = callsApi
export const {
  addLine,
  end,
  history,
  transcript,
  conversation,
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
