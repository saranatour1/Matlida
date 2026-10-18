import { Link, createFileRoute } from '@tanstack/react-router'
import { useCompleteSignUp } from '@convex-dev/auth/methods/email-password/react'
import { api } from '../../convex/_generated/api'
import { AuthCard } from '~/components/auth-card'
import { authErrorMessage, emailLinkSearch } from '~/lib/auth'

/** Where the sign-up email's link lands. Success signs the user in. */
export const Route = createFileRoute('/_auth/verify-email')({
  validateSearch: emailLinkSearch,
  component: VerifyEmail,
})

function VerifyEmail() {
  const { code } = Route.useSearch()
  const state = useCompleteSignUp(api.auth, { emailCode: code })

  if (state.status === 'error') {
    return (
      <AuthCard
        title="This link can't be used"
        description={authErrorMessage(state.userError)}
        footer={
          <Link to="/sign-up" className="text-foreground underline">
            Sign up again
          </Link>
        }
      />
    )
  }
  return <AuthCard title="Verifying your email" description="One moment…" />
}
