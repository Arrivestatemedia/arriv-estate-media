// Preserve every accepted attempt, including the receipt that actually delivered.
export function emailReceiptIds(record, newMessageId = null) {
  return [...new Set([
    record.delivery_message_id,
    ...(record.provider_message_ids || []),
    record.provider_message_id,
    newMessageId,
  ].filter(id => typeof id === 'string' && id.trim()))];
}