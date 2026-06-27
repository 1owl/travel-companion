// A tiny in-memory stand-in for the Supabase client used in unit/component tests.
// Supports the chains the app actually uses:
//   from(t).select('*').eq(c,v).order(c)            -> { data: rows }
//   from(t).select('*').eq('id',id).single()        -> { data: row }
//   from(t).insert(payload)                          -> { data: inserted }  (mutates store)
//   from(t).update(patch).eq('id', id)              -> { data: null }       (mutates store)
//   from(t).delete().eq('id', id)                   -> { data: null }       (mutates store)
// The returned `store` is a plain object keyed by table name; mutate it to seed data.

function makeBuilder(table, store) {
  const op = { type: 'select', payload: null, single: false, filters: {} }
  const builder = {
    select() { if (!['insert', 'update', 'delete'].includes(op.type)) op.type = 'select'; return builder },
    insert(payload) { op.type = 'insert'; op.payload = payload; return builder },
    update(patch) { op.type = 'update'; op.payload = patch; return builder },
    delete() { op.type = 'delete'; return builder },
    eq(col, val) { op.filters[col] = val; return builder },
    order() { return builder },
    single() { op.single = true; return builder },
    then(resolve, reject) {
      let result
      try {
        store[table] = store[table] || []
        if (op.type === 'select') {
          let rows = store[table]
          for (const [c, v] of Object.entries(op.filters)) rows = rows.filter(r => r[c] === v)
          result = op.single ? { data: rows[0] ?? null, error: null } : { data: [...rows], error: null }
        } else if (op.type === 'insert') {
          const items = Array.isArray(op.payload) ? op.payload : [op.payload]
          const inserted = items.map((it, i) => ({
            id: it.id || `mock-${table}-${store[table].length + i + 1}`,
            created_at: it.created_at || new Date(0).toISOString(),
            ...it,
          }))
          store[table].push(...inserted)
          result = { data: op.single ? (inserted[0] ?? null) : inserted, error: null }
        } else if (op.type === 'update') {
          store[table] = store[table].map(r =>
            Object.entries(op.filters).every(([c, v]) => r[c] === v) ? { ...r, ...op.payload } : r)
          result = { data: null, error: null }
        } else if (op.type === 'delete') {
          store[table] = store[table].filter(r =>
            !Object.entries(op.filters).every(([c, v]) => r[c] === v))
          result = { data: null, error: null }
        }
      } catch (e) {
        return Promise.reject(e).then(resolve, reject)
      }
      return Promise.resolve(result).then(resolve, reject)
    },
  }
  return builder
}

export function makeSupabaseMock(initial = {}) {
  const store = {}
  for (const [k, v] of Object.entries(initial)) store[k] = [...v]
  const supabase = {
    from(table) { return makeBuilder(table, store) },
    auth: {
      getSession: async () => ({ data: { session: null }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      signInWithPassword: async () => ({ data: { session: null }, error: null }),
      signUp: async () => ({ data: { session: null }, error: null }),
      signOut: async () => ({ error: null }),
    },
  }
  return { supabase, store }
}
