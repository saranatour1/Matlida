import { Link, createFileRoute } from '@tanstack/react-router'
import { useCompleteSignUp } from '@convex-dev/auth/methods/email-password/react'
import { api } from '../../../convex/_generated/api'
import { AuthPage } from '~/components/auth-page'
import { authErrorMessage, emailLinkSearch } from '~/lib/auth'

/** Where the sign-up email's link lands. Success signs the user in. */
export const Route = createFileRoute('/_auth/verify-email')({
  validateSearch: emailLinkSearch,
  component: VerifyEmail,
})

function VerifyEmail() {
  const { code } = Route.useSearch()
  const state = useCompleteSignUp(api.api.auth, { emailCode: code })

  if (state.status === 'error') {
    return (
      <AuthPage
        title="This link can't be used"
        description={authErrorMessage(state.userError)}
        footer={<Link to="/sign-up">Sign up again</Link>}
      />
    )
  }
  return <AuthPage title="Verifying your email" description="One moment…" />
}
