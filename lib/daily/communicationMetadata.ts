/** Keep the convocation retry transport snapshot server-side, without changing DB data. */
export function projectCommunicationMetadata(communicationType: unknown, metadata: unknown): unknown {
  if (communicationType !== "convocation" || metadata === null || typeof metadata !== "object" || Array.isArray(metadata)) {
    return metadata;
  }
  const { email_input: _emailInput, ...businessMetadata } = metadata as Record<string, unknown>;
  return businessMetadata;
}
