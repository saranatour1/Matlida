import { createFileRoute } from '@tanstack/react-router'
import { useAuthActions } from '@convex-dev/auth/react'
import { useQuery } from 'convex/react'
import { api } from '../../convex/_generated/api'
import { Avatar, AvatarFallback, AvatarImage } from '~/components/ui/avatar'
import { Button } from '~/components/ui/button'
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '~/components/ui/card'

export const Route = createFileRoute('/_app/')({
  component: Home,
})

function Home() {
  const user = useQuery(api.users.current)
  const { signOut } = useAuthActions()
  const name = user?.name ?? user?.email

  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader className="flex items-center gap-3">
          <Avatar>
            <AvatarImage
              src={user?.image}
              alt=""
              referrerPolicy="no-referrer"
            />
            <AvatarFallback>{name?.[0]?.toUpperCase()}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <CardTitle className="truncate">{name}</CardTitle>
            {user?.name && (
              <CardDescription className="truncate">
                {user.email}
              </CardDescription>
            )}
          </div>
        </CardHeader>
        <CardFooter>
          <Button
            variant="outline"
            className="w-full"
            onClick={() => void signOut()}
          >
            Sign out
          </Button>
        </CardFooter>
      </Card>
    </main>
  )
}
