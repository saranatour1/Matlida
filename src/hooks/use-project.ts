import { useParams } from '@tanstack/react-router'
import { useQuery } from 'convex/react'
import { api } from '../../convex/_generated/api'

// The project in the URL (/p/$projectId/...): undefined while loading or outside a
// project, null if the id doesn't match one.
export function useProject() {
  const { projectId } = useParams({ strict: false })
  return useQuery(api.projects.get, projectId ? { id: projectId } : 'skip')
}
