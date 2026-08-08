import assert from "node:assert/strict";
import test from "node:test";
import {
  ConflictError,
  NotFoundError,
  ServiceUnavailableError,
  ValidationError,
  toErrorResponse,
} from "../../artifacts/api-server/src/services/errors";
import { normalizeInvitationEmail } from "../../artifacts/api-server/src/services/admin/normalization";

test("application errors use stable status, code, and safe response", () => {
  assert.deepEqual(toErrorResponse(new ValidationError("Invalid input")), {
    status: 400,
    body: { error: "Invalid input", code: "validation_error" },
  });
  assert.deepEqual(toErrorResponse(new ConflictError("Account exists", "account_exists")), {
    status: 409,
    body: { error: "Account exists", code: "account_exists" },
  });
  assert.deepEqual(toErrorResponse(new NotFoundError("Missing")), {
    status: 404,
    body: { error: "Missing", code: "not_found" },
  });
  assert.deepEqual(toErrorResponse(new ServiceUnavailableError("Storage unavailable", "storage_unavailable")), {
    status: 503,
    body: { error: "Storage unavailable", code: "storage_unavailable" },
  });
});

test("unknown errors never expose internal details", () => {
  assert.deepEqual(toErrorResponse(new Error("database password leaked")), {
    status: 500,
    body: { error: "Internal server error", code: "internal_error" },
  });
});

test("invitation emails are normalized before duplicate checks", () => {
  assert.equal(normalizeInvitationEmail("  Person@Example.COM "), "person@example.com");
});
