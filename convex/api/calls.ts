import { callLogApi } from '../models/calls/functions'
import { callsApi } from '../models/threads/calls'

export const { post, forget, turn, answer } = callsApi
export const { begin, end, addLines, history, transcript } = callLogApi
