/** Event type strings for platform-level discovery events. */
export const PlatformEventType = {
  /** Service instance registered its manifest. */
  REGISTER: 'platform.service.register',
  /** Periodic liveness signal from a service instance. */
  HEARTBEAT: 'platform.service.heartbeat',
  /** Service instance is shutting down gracefully. */
  SHUTDOWN: 'platform.service.shutdown',
} as const;
