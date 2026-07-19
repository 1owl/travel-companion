import { defineTool } from '../_define'
import { listTripsInput } from '../contracts/schemas'
import { ok, err } from '../_result'
import { supabase } from '../../lib/supabase'

// The trips table has no status column; status is derived from the end date.
function deriveStatus(trip, todayISO) {
  if (trip.end_date && trip.end_date < todayISO) return 'past'
  return 'planning'
}

export default defineTool({
  name: 'list_trips',
  description: "List the signed-in user's trips with dates and base currency. Use to resolve which trip an instruction refers to before acting on it. Status is derived: 'past' once the end date has passed, otherwise 'planning'.",
  inputSchema: listTripsInput,
  annotations: { readOnlyHint: true },
  async run(input) {
    const { data, error } = await supabase
      .from('trips')
      .select('id,name,start_date,end_date,base_currency,travelers')
      .order('start_date', { ascending: true })
    if (error) return err('UPSTREAM_ERROR', error.message, 'Retry the request.')
    const todayISO = new Date().toISOString().slice(0, 10)
    let trips = (data || []).map(t => ({ ...t, status: deriveStatus(t, todayISO) }))
    if (input.status && input.status !== 'all') {
      // 'booked' isn't a derived state yet — treat it as a non-past trip.
      trips = trips.filter(t => input.status === 'booked' ? t.status !== 'past' : t.status === input.status)
    }
    return ok({ trips, count: trips.length })
  },
})
