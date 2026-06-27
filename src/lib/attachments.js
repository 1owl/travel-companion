// Attachment vault: upload/list/download/delete files tied to a booking.
// Files live in the private "attachments" Storage bucket under {uid}/{tripId}/{uuid}.ext.
// Every function returns { data, error } to match the Supabase call style.

import { supabase } from './supabase'

export const BUCKET = 'attachments'
export const MAX_BYTES = 10 * 1024 * 1024 // 10 MB

// extension -> mime, the only types we accept
export const ALLOWED = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  ics: 'text/calendar',
}

const extOf = name => (name.split('.').pop() || '').toLowerCase()

export function validateFile(file) {
  if (!file) return 'No file selected.'
  if (file.size > MAX_BYTES) return `File is too large (max ${Math.round(MAX_BYTES / 1024 / 1024)}MB).`
  if (!ALLOWED[extOf(file.name)]) return 'Unsupported file type. Allowed: PDF, PNG, JPG, ICS.'
  return null
}

async function currentUserId() {
  const { data } = await supabase.auth.getSession()
  return data?.session?.user?.id ?? null
}

// Upload one file and record it in the attachments table.
export async function uploadAttachment({ file, tripId, bookingId }) {
  const validationError = validateFile(file)
  if (validationError) return { data: null, error: { message: validationError } }

  const userId = await currentUserId()
  if (!userId) return { data: null, error: { message: 'Not signed in.' } }

  const ext = extOf(file.name)
  const path = `${userId}/${tripId}/${crypto.randomUUID()}.${ext}`

  const up = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: ALLOWED[ext],
    upsert: false,
  })
  if (up.error) return { data: null, error: up.error }

  const ins = await supabase.from('attachments').insert({
    booking_id: bookingId,
    trip_id: tripId,
    file_path: path,
    file_name: file.name,
    mime_type: ALLOWED[ext],
    size_bytes: file.size,
  }).select('*').single()

  // If the DB row failed, don't leave an orphan object in Storage.
  if (ins.error) {
    await supabase.storage.from(BUCKET).remove([path])
    return { data: null, error: ins.error }
  }
  return { data: ins.data, error: null }
}

export async function listAttachments(bookingId) {
  return supabase.from('attachments').select('*').eq('booking_id', bookingId).order('created_at')
}

// Short-lived signed URL for a private object (default 60s).
export async function signedUrl(filePath, expiresIn = 60) {
  return supabase.storage.from(BUCKET).createSignedUrl(filePath, expiresIn)
}

// Remove one attachment: delete the object then the row.
export async function removeAttachment(att) {
  const rm = await supabase.storage.from(BUCKET).remove([att.file_path])
  if (rm.error) return { data: null, error: rm.error }
  return supabase.from('attachments').delete().eq('id', att.id)
}

// Remove every Storage object for a booking. Call BEFORE deleting the booking so
// the DB cascade (which only clears rows) doesn't leave orphaned files behind.
export async function removeAttachmentsForBooking(bookingId) {
  const { data, error } = await listAttachments(bookingId)
  if (error) return { data: null, error }
  const paths = (data || []).map(a => a.file_path)
  if (paths.length === 0) return { data: [], error: null }
  return supabase.storage.from(BUCKET).remove(paths)
}
