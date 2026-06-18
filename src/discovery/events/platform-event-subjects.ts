/** NATS subjects for platform-level service discovery events. */

/** Emitted when a service instance starts up and registers its manifest. */
export const PLATFORM_REGISTER_SUBJECT = 'platform.service.register.v1';

/** Emitted periodically to indicate a service instance is still alive. */
export const PLATFORM_HEARTBEAT_SUBJECT = 'platform.service.heartbeat.v1';

/** Emitted when a service instance is shutting down gracefully. */
export const PLATFORM_SHUTDOWN_SUBJECT = 'platform.service.shutdown.v1';
