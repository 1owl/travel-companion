// Factory that gives every tool the same guarantees: server-side re-validation of
// agent-supplied params (never trusted), and the always-on approval gate for
// financial/irreversible tools (Principle 3 — enforced at the tool layer as
// defence in depth, not only in the UI runtime).

import { fromZodError, err } from './_result'

export function defineTool({ name, description, inputSchema, annotations = {}, run }) {
  return {
    name,
    description,
    inputSchema,
    annotations,
    // ctx: { autonomy, transport, approval, grant, ... }. approval = { confirmed:true, amount, currency }
    async execute(rawInput, ctx = {}) {
      const parsed = inputSchema.safeParse(rawInput ?? {})
      if (!parsed.success) return fromZodError(parsed.error)
      if (annotations.financialHint && !ctx?.approval?.confirmed) {
        return err('APPROVAL_REQUIRED',
          `${name} spends money or is irreversible and needs explicit approval.`,
          'Show the user an ApprovalGate with the exact amount and refund status, then re-call with ctx.approval.confirmed = true.')
      }
      return run(parsed.data, ctx)
    },
  }
}
