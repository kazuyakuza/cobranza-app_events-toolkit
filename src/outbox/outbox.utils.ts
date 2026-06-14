/** Builds a Dead Letter Queue subject by prefixing the original subject with 'dlq.'. */
export function buildDlqSubject(subject: string): string {
  return `dlq.${subject}`;
}
