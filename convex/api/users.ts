import { usersApi } from '../models/users/functions'

export const {
  createUser,
  syncProfile,
  updateProfile,
  setCheckIns,
  signInMethods,
  current,
} = usersApi
