// Human labels for tool names, shown in AgentPlan / AgentTrace.
const LABELS = {
  search_flights: 'Search flights',
  search_stays: 'Search stays',
  get_offer: 'Re-check price',
  list_trips: 'List trips',
  get_itinerary: 'Read itinerary',
  search_activities: 'Find activities',
  get_trip_budget: 'Check budget',
  create_trip: 'Create trip',
  add_itinerary_item: 'Add to itinerary',
  update_itinerary_item: 'Update item',
  set_traveller_preferences: 'Save preferences',
  hold_offer: 'Hold price',
  create_booking: 'Book & pay',
  cancel_booking: 'Cancel booking',
}
export const modeLabelForTool = tool => LABELS[tool] || tool
