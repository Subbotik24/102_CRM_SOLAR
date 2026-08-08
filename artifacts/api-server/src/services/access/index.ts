import type { User } from "@workspace/db";
export { ForbiddenError } from "../errors";
import { ForbiddenError } from "../errors";

/** Context resolved by the service before authorizing a project-derived item. */
export interface ProjectAccessResource {
  kind: "project";
  projectId: string;
  isMember: boolean;
  /** Guests may only see externally visible files and comments. */
  visibility?: "internal" | "external";
  /** Guests have access only to the conversation belonging to their project. */
  conversation?: "project" | "direct" | "group";
}

    export type Action =
    | "project:create"
    | "project:read"
    | "project:update"
    | "project:delete"
    | "project:archive"
    | "task:create"
    | "task:read"
    | "task:update"
    | "task:delete"
    | "client:read"
    | "client:update"
    | "client:archive"
    | "comment:create"
    | "comment:read"
    | "file:upload"
    | "file:download"
    | "kb:read"
    | "kb:write"
    | "chat:read"
    | "chat:write"
    | "user:manage"
    | "admin:access"
    | "audit:view"
    | "deletion:resolve";

    /**
    * Central authorization gateway. TRUE DENY-BY-DEFAULT.
    *
    * Every action must be explicitly allowed for every role.
    * Any action not covered by an explicit allow branch throws ForbiddenError.
    */
    export function authorize(user: User, action: Action, resource?: ProjectAccessResource): void {
    if (user.role === "admin") return;

    // Managers are organization-wide by product decision. Members and guests
    // must be explicitly assigned to each project; membership is never
    // inherited from a parent project.
    if (resource?.kind === "project" && (user.role === "member" || user.role === "guest") && !resource.isMember) {
      throw new ForbiddenError("You are not assigned to this project");
    }

    switch (action) {
      // ── Admin-only ──────────────────────────────────────────────────────────
      case "admin:access":
      case "audit:view":
      case "user:manage":
      case "deletion:resolve":
        throw new ForbiddenError("Only administrators can perform this action");

      // ── Project actions ──────────────────────────────────────────────────────
      case "project:create":
      case "project:archive":
        if (user.role === "manager") return;
        throw new ForbiddenError("Only managers and administrators can perform this action");

      case "project:read":
        if (user.role === "member" || user.role === "manager" || (user.role === "guest" && resource?.isMember)) return;
        throw new ForbiddenError("Guests cannot access projects");

      case "project:update":
      case "project:delete":
        if (user.role === "manager") return;
        throw new ForbiddenError("Only managers and administrators can modify projects");

      // ── Task actions ─────────────────────────────────────────────────────────
      case "task:create":
      case "task:read":
      case "task:update":
        if (user.role === "member" || user.role === "manager") return;
        if (user.role === "guest" && action === "task:read" && resource?.isMember) return;
        throw new ForbiddenError("Guests cannot access tasks");

      case "task:delete":
        if (user.role === "manager") return;
        throw new ForbiddenError("Only managers and administrators can delete tasks");

      // ── Clients ──────────────────────────────────────────────────────────────
      case "client:read":
        if (user.role === "member" || user.role === "manager") return;
        throw new ForbiddenError("Guests cannot access clients");

      case "client:update":
      case "client:archive":
        if (user.role === "manager") return;
        throw new ForbiddenError("Only managers and administrators can modify clients");

      // ── Comments ─────────────────────────────────────────────────────────────
      case "comment:create":
      case "comment:read":
        if (user.role === "member" || user.role === "manager") return;
        if (user.role === "guest" && action === "comment:read" && resource?.isMember && resource.visibility === "external") return;
        throw new ForbiddenError("Guests cannot access comments");

      // ── Files ────────────────────────────────────────────────────────────────
      case "file:upload":
      case "file:download":
        if (user.role === "member" || user.role === "manager") return;
        if (user.role === "guest" && action === "file:download" && resource?.isMember && resource.visibility === "external") return;
        throw new ForbiddenError("Guests cannot access files");

      // ── Knowledge base ───────────────────────────────────────────────────────
      case "kb:read":
      case "kb:write":
        if (user.role === "member" || user.role === "manager") return;
        throw new ForbiddenError("Guests do not have access to the knowledge base");

      // ── Chat ─────────────────────────────────────────────────────────────────
      case "chat:read":
      case "chat:write":
        if (user.role === "member" || user.role === "manager") return;
        if (user.role === "guest" && resource?.isMember && resource.conversation === "project") return;
        throw new ForbiddenError("Guests cannot access chat");

      // ── Exhaustive default ───────────────────────────────────────────────────
      default: {
        const _exhaustiveCheck: never = action;
        void _exhaustiveCheck;
        throw new ForbiddenError(`Action is not permitted: ${String(action)}`);
      }
    }
    }
