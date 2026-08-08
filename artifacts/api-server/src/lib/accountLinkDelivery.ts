export function shouldLogRawAccountLink(
  nodeEnv: "development" | "production" | "test",
  emailProvider: "console" | "smtp"
): boolean {
  return nodeEnv !== "production" && emailProvider === "console";
}
