/**
 * Identifies the actor type that performed an action recorded in an event.
 *
 * Used for audit trails, security tracking, and event provenance
 * across all Cobranza App microservices.
 *
 * @see docs/event-messaging-convention.md — Section 5 (Actor Types)
 */
export enum ActorType {
  /** External client or customer of the platform */
  CLIENT = 'client',

  /** Internal company user such as employee, admin, or operator */
  COMPANY_USER = 'company_user',

  /** Automated system process with no human actor */
  SYSTEM = 'system',

  /** Scheduled job, cron task, or background worker */
  SCHEDULER = 'scheduler',

  /** External third-party API or webhook integration */
  EXTERNAL_API = 'external_api',
}
