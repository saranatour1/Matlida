import { useParams } from '@tanstack/react-router'
import { useQuery } from 'convex/react'
import { api } from '../../convex/_generated/api'

/**
 * The project in the URL (`/p/$projectId`). Undefined while loading or outside
 * a project, null when the id doesn't match a project you own.
 */
export function useProject() {
  const { projectId } = useParams({ strict: false })
  return useQuery(api.api.projects.get, projectId ? { id: projectId } : 'skip')
}
