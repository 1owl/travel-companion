import { defineTool } from '../_define'
import { searchActivitiesInput } from '../contracts/schemas'
import { ok, err } from '../_result'
import { askPlanner } from '../../lib/planner'

// Backed by the grounded planner (Google Places): real places with ratings and a
// one-line why; never invents prices or hours. (See Q6 — a direct Places tool may
// replace this later.)
export default defineTool({
  name: 'search_activities',
  description: 'Find real places to see, do or eat in a location, grounded in Google (rating + a one-line reason). Never invents prices or opening hours. Use for day-planning suggestions.',
  inputSchema: searchActivitiesInput,
  annotations: { readOnlyHint: true },
  async run(input) {
    const kind = input.category === 'all' ? 'things to see, do and eat' : `${input.category} options`
    const message = `Suggest ${kind} in ${input.location}${input.date ? ` for ${input.date}` : ''}.`
    const { cards, error } = await askPlanner(message, [], { context: '' })
    if (error) return err('UPSTREAM_ERROR', error.message || 'Activity search failed.', 'Retry with a clearer location.')
    return ok({ activities: cards || [], count: (cards || []).length })
  },
})
