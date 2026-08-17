export type ApplicationActor = {
  type: 'USER' | 'MERCHANT_API_CLIENT' | 'SYSTEM' | 'EDGE_AGENT';
  id: string;
};

export type EventData = Record<string, string | number | boolean | null>;

export type ApplicationEvent = {
  id: string;
  schemaVersion: 1;
  type: string;
  organizationId: string | null;
  actor: ApplicationActor;
  resourceType: string;
  resourceId: string;
  requestId: string;
  occurredAt: Date;
  data: EventData;
};
