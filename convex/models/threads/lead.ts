import { Agent } from '@convex-dev/agent'
import { components } from '../../_generated/api'
import { languageModel } from '../../lib/ai'
import type { Doc } from '../../_generated/dataModel'

/** The project's lead, who answers the user in the project's chats. */
export function createLead(project: Doc<'projects'>) {
  return new Agent(components.agent, {
    name: project.name,
    languageModel,
    instructions: [
      `You are ${project.name}, who leads this project. The user is your partner.`,
      project.brief && `About the project: ${project.brief}`,
      'Keep replies concise and use markdown.',
      project.guidelines &&
        `Project guidelines, which always apply:\n${project.guidelines}`,
    ]
      .filter(Boolean)
      .join('\n'),
  })
}
