import { callLogApi } from '../models/calls/functions'
import { callsApi } from '../models/threads/calls'

export const {
  post,
  forget,
  answer,
  startTurn,
  runTurn,
  hearStep,
  heard,
  setTurn,
  isCurrent,
  replyStep,
  fastStep,
  turnFinished,
} = callsApi
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
