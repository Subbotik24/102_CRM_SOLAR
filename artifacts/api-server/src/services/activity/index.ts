import { activityEventsTable, type Tx } from "@workspace/db";

export interface ActivityEventInput {
  projectId: string | null;
  entityType: string;
  entityId: string;
  actorId: string;
  eventType: string;
  payload: Record<string, unknown>;
}

/**
 * Persist an activity event using the caller's transaction executor.
 * Events are part of the domain write, never an optional afterthought.
 */
export async function emitActivity(tx: Tx, event: ActivityEventInput): Promise<void> {
  await tx.insert(activityEventsTable).values(event);
}
