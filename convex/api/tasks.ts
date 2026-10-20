import { tasksApi } from '../models/tasks/functions'

export const {
  startPlan,
  runPlan,
  stepCount,
  setStep,
  stepContext,
  doStep,
  finished,
  answer,
  cancel,
  get,
  forThread,
} = tasksApi
