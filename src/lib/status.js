// The booking status colour language (see DESIGN.txt). One mapping, used
// identically across the ledger, budget, and itinerary so a trip reads at a glance.
const STATUS_CLASS = {
  'TO BOOK': 'tobook',
  'BOOKED': 'booked',
  'OPTIONAL': 'optional',
  'CHECK': 'check',
}

export function statusClass(status) {
  return STATUS_CLASS[status] || 'tobook'
}
