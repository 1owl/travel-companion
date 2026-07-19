// Bridge core: turn a tool's Zod input schema into CopilotKit's `parameters`
// array, and build the action config that routes to runTool. Kept pure and
// framework-free so it's unit-testable; the React glue (useCopilotAction) is a
// thin consumer in AgentActions.jsx.

import { z } from 'zod'
import { runTool } from '../tools/index'

// Unwrap optional/default/nullable to the base schema (best-effort across Zod 4).
function unwrap(schema) {
  let s = schema
  for (let i = 0; i < 6 && s; i++) {
    if (s instanceof z.ZodOptional || s instanceof z.ZodNullable || s instanceof z.ZodDefault) {
      s = typeof s.unwrap === 'function' ? s.unwrap() : (s.def?.innerType ?? s._def?.innerType)
    } else break
  }
  return s
}

function typeOf(schema) {
  try {
    const s = unwrap(schema)
    if (s instanceof z.ZodNumber) return 'number'
    if (s instanceof z.ZodBoolean) return 'boolean'
    if (s instanceof z.ZodArray) return 'object[]'
    if (s instanceof z.ZodObject) return 'object'
    return 'string' // ZodString, ZodEnum, and anything unrecognised → string
  } catch { return 'string' }
}

const isOptional = schema => schema instanceof z.ZodOptional || schema instanceof z.ZodDefault

// CopilotKit parameter list from a ZodObject input schema.
export function zodToParams(schema) {
  let shape = {}
  try { shape = schema.shape ?? schema._def?.shape?.() ?? {} } catch { shape = {} }
  return Object.entries(shape).map(([name, field]) => ({
    name,
    type: typeOf(field),
    description: field?.description || name,
    required: !isOptional(field),
  }))
}

// Build a CopilotKit action config for a tool. `ctx` carries autonomy/transport;
// `onGated(tool, input, retry)` lets the UI raise an ApprovalGate and re-run with
// approval — when omitted, a gated call returns its APPROVAL_REQUIRED result.
export function buildActionConfig(tool, { ctx = {}, onGated } = {}) {
  return {
    name: tool.name,
    description: tool.description,
    parameters: zodToParams(tool.inputSchema),
    handler: async (args) => {
      const res = await runTool(tool.name, args, { autonomy: 'L1', transport: 'in-app', ...ctx })
      if (!res.ok && res.error?.code === 'APPROVAL_REQUIRED' && typeof onGated === 'function') {
        return onGated(tool, args, (approval) => runTool(tool.name, args, { autonomy: 'L1', transport: 'in-app', ...ctx, approval }))
      }
      return res.ok ? res.data : { error: res.error }
    },
  }
}
