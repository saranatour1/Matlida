import { mailboxesApi } from '../models/mailboxes/functions'

export const {
  mine,
  claim,
  release,
  domainHealth,
  recordCheck,
  checkDomain,
  checkDomainNow,
} = mailboxesApi
