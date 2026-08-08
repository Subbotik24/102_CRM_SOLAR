/**
 * Chronicle export service.
 *
 * Generates a project chronicle in Markdown or PDF format.
 * Structure:
 *  1. Project header (name, status, client, owner, date range)
 *  2. Summary stats (task counts by status, file count/size, participants, duration)
 *  3. Chronology by month (decisions/milestones as headings, activity events condensed)
 *  4. Document register (files list)
 *  5. Appendix of key discussions (decisions + milestones from log entries)
 */
import { pool } from "@workspace/db";
import type { User } from "@workspace/db";
import { requireProjectAccess } from "../access/projectAccess";
import { NotFoundError } from "../errors";
import PDFDocument from "pdfkit";

export type ChronicleFormat = "md" | "pdf";

// Raw SQL returns snake_case — match exactly what pg returns
interface ProjectRow {
  id: string;
  name: string;
  status: string;
  client_name: string | null;
  code: string;
  starts_on: Date | null;
  due_on: Date | null;
  owner_name: string | null;
}

interface TaskCountRow {
  status: string;
  count: string;
}

interface FileRow {
  original_filename: string;
  mime_type: string;
  size_bytes: string;
  status: string;
  created_at: Date;
}

interface ParticipantRow {
  display_name: string;
  role: string;
}

interface LogEntryRow {
  id: string;
  entry_type: string;
  title: string;
  body_md: string;
  actor_name: string;
  occurred_at: Date;
}

interface ActivityRow {
  event_type: string;
  actor_name: string;
  created_at: Date;
}

// ── Main export function ──────────────────────────────────────────────────────

export async function generateChronicle(
  actor: User,
  projectId: string,
  format: ChronicleFormat = "md"
): Promise<{ content: Buffer; mimeType: string; filename: string }> {
  await requireProjectAccess(actor, "project:read", projectId);

  const client = await pool.connect();
  try {
    // Project
    const projectRes = await client.query(
      `SELECT p.id, p.name, p.status, p.client_name, p.code, p.starts_on, p.due_on,
              u.display_name AS owner_name
       FROM projects p
       LEFT JOIN users u ON u.id = p.owner_id
       WHERE p.id = $1`,
      [projectId]
    );
    if (projectRes.rows.length === 0) throw new NotFoundError("Project not found");
    const project = projectRes.rows[0] as ProjectRow;

    // Task counts by status
    const taskRes = await client.query(
      `SELECT status, COUNT(*) AS count FROM tasks WHERE project_id = $1 GROUP BY status`,
      [projectId]
    );
    const taskCounts: TaskCountRow[] = taskRes.rows;

    // Files
    const filesRes = await client.query(
      `SELECT original_filename, mime_type, size_bytes, status, created_at
       FROM files WHERE entity_type = 'project' AND entity_id = $1
       ORDER BY created_at`,
      [projectId]
    );
    const files: FileRow[] = filesRes.rows;

    // Participants
    const participantsRes = await client.query(
      `SELECT u.display_name, pm.role
       FROM project_members pm
       INNER JOIN users u ON u.id = pm.user_id
       WHERE pm.project_id = $1
       ORDER BY u.display_name`,
      [projectId]
    );
    const participants: ParticipantRow[] = participantsRes.rows;

    // Log entries
    const logRes = await client.query(
      `SELECT ple.id, ple.entry_type, ple.title, ple.body_md, u.display_name AS actor_name, ple.occurred_at
       FROM project_log_entries ple
       INNER JOIN users u ON u.id = ple.actor_id
       WHERE ple.project_id = $1 AND ple.deleted_at IS NULL
       ORDER BY ple.occurred_at`,
      [projectId]
    );
    const logEntries: LogEntryRow[] = logRes.rows;

    // Activity events (last 200)
    const actRes = await client.query(
      `SELECT ae.event_type, u.display_name AS actor_name, ae.created_at
       FROM activity_events ae
       INNER JOIN users u ON u.id = ae.actor_id
       WHERE ae.project_id = $1
       ORDER BY ae.created_at
       LIMIT 200`,
      [projectId]
    );
    const activities: ActivityRow[] = actRes.rows;

    // Build Markdown content
    const md = buildMarkdown(project, taskCounts, files, participants, logEntries, activities);

    if (format === "md") {
      return {
        content: Buffer.from(md, "utf8"),
        mimeType: "text/markdown; charset=utf-8",
        filename: `${project.code}-chronicle.md`,
      };
    }

    // PDF via pdfkit
    const pdfBuffer = await buildPdf(project.name, md);
    return {
      content: pdfBuffer,
      mimeType: "application/pdf",
      filename: `${project.code}-chronicle.pdf`,
    };
  } finally {
    client.release();
  }
}

// ── Markdown builder ──────────────────────────────────────────────────────────

function buildMarkdown(
  project: ProjectRow,
  taskCounts: TaskCountRow[],
  files: FileRow[],
  participants: ParticipantRow[],
  logEntries: LogEntryRow[],
  activities: ActivityRow[]
): string {
  const lines: string[] = [];
  const totalTasks = taskCounts.reduce((s, t) => s + parseInt(t.count, 10), 0);
  const doneTasks = taskCounts.find((t) => t.status === "done");
  const doneCount = doneTasks ? parseInt(doneTasks.count, 10) : 0;
  const totalFileSizeBytes = files.reduce((s, f) => s + parseInt(String(f.size_bytes), 10), 0);

  // 1. Header
  lines.push(`# Project Chronicle: ${project.name}`);
  lines.push("");
  lines.push(`| Field | Value |`);
  lines.push(`|---|---|`);
  lines.push(`| Code | ${project.code} |`);
  lines.push(`| Status | ${project.status} |`);
  if (project.client_name) lines.push(`| Client | ${project.client_name} |`);
  lines.push(`| Owner | ${project.owner_name ?? "—"} |`);
  if (project.starts_on) lines.push(`| Start | ${fmtDate(new Date(project.starts_on))} |`);
  if (project.due_on) lines.push(`| Due | ${fmtDate(new Date(project.due_on))} |`);
  lines.push(`| Generated | ${fmtDate(new Date())} |`);
  lines.push("");

  // 2. Summary stats
  lines.push("## Summary");
  lines.push("");
  lines.push(`**Tasks:** ${totalTasks} total (${doneCount} done)`);
  taskCounts.forEach((t) => { lines.push(`- ${t.status}: ${t.count}`); });
  lines.push(`**Files:** ${files.length} files (${fmtBytes(totalFileSizeBytes)} total)`);
  lines.push(`**Participants:** ${participants.length}`);
  participants.forEach((p) => { lines.push(`- ${p.display_name} (${p.role})`); });
  lines.push("");

  // 3. Chronology by month
  lines.push("## Chronology");
  lines.push("");
  const allEvents: Array<{ date: Date; type: string; text: string; prominent: boolean }> = [];

  logEntries.forEach((e) => {
    allEvents.push({
      date: new Date(e.occurred_at),
      type: e.entry_type,
      text: `**[${e.entry_type.toUpperCase()}]** ${e.title} *(${e.actor_name})*`,
      prominent: e.entry_type === "decision" || e.entry_type === "milestone",
    });
  });
  activities.forEach((a) => {
    allEvents.push({
      date: new Date(a.created_at),
      type: a.event_type,
      text: `${a.event_type} by ${a.actor_name}`,
      prominent: false,
    });
  });
  allEvents.sort((a, b) => a.date.getTime() - b.date.getTime());

  // Group by month
  const byMonth = new Map<string, typeof allEvents>();
  for (const ev of allEvents) {
    const key = `${ev.date.getFullYear()}-${String(ev.date.getMonth() + 1).padStart(2, "0")}`;
    if (!byMonth.has(key)) byMonth.set(key, []);
    byMonth.get(key)!.push(ev);
  }
  byMonth.forEach((evs, month) => {
    lines.push(`### ${fmtMonth(month)}`);
    lines.push("");
    const prominent = evs.filter((e) => e.prominent);
    const regular = evs.filter((e) => !e.prominent);
    prominent.forEach((e) => { lines.push(`> **${e.text}**`); lines.push(""); });
    if (regular.length > 0) {
      lines.push(`${regular.length} activity event${regular.length > 1 ? "s" : ""} including: ${regular.slice(0, 3).map((e) => e.type).join(", ")}${regular.length > 3 ? "…" : ""}`);
    }
    lines.push("");
  });

  // 4. Document register
  if (files.length > 0) {
    lines.push("## Document Register");
    lines.push("");
    lines.push("| Filename | Type | Size | Status |");
    lines.push("|---|---|---|---|");
    files.forEach((f) => {
      lines.push(`| ${f.original_filename} | ${f.mime_type} | ${fmtBytes(parseInt(String(f.size_bytes), 10))} | ${f.status} |`);
    });
    lines.push("");
  }

  // 5. Appendix: key decisions & milestones
  const keyEntries = logEntries.filter((e) => e.entry_type === "decision" || e.entry_type === "milestone");
  if (keyEntries.length > 0) {
    lines.push("## Appendix: Decisions & Milestones");
    lines.push("");
    keyEntries.forEach((e) => {
      lines.push(`### ${e.title}`);
      lines.push(`*${e.entry_type} — ${fmtDate(new Date(e.occurred_at))} by ${e.actor_name}*`);
      lines.push("");
      if (e.body_md) { lines.push(e.body_md); lines.push(""); }
    });
  }

  return lines.join("\n");
}

// ── PDF builder via pdfkit ────────────────────────────────────────────────────

async function buildPdf(title: string, markdown: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const doc = new PDFDocument({ margin: 50, size: "A4" });

    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const lines = markdown.split("\n");

    for (const line of lines) {
      if (line.startsWith("# ")) {
        doc.moveDown(0.5).fontSize(20).font("Helvetica-Bold").text(line.slice(2), { lineGap: 4 });
      } else if (line.startsWith("## ")) {
        doc.moveDown(0.4).fontSize(15).font("Helvetica-Bold").text(line.slice(3), { lineGap: 3 });
      } else if (line.startsWith("### ")) {
        doc.moveDown(0.3).fontSize(12).font("Helvetica-Bold").text(line.slice(4), { lineGap: 2 });
      } else if (line.startsWith("> ")) {
        doc.moveDown(0.2).fontSize(9).font("Helvetica-Oblique")
          .text(line.slice(2).replace(/\*\*([^*]+)\*\*/g, "$1"), { indent: 15, lineGap: 2 });
      } else if (line.startsWith("- ")) {
        doc.fontSize(9).font("Helvetica")
          .text(`• ${line.slice(2).replace(/\*\*([^*]+)\*\*/g, "$1").replace(/\*([^*]+)\*/g, "$1")}`, { indent: 10, lineGap: 1 });
      } else if (line.startsWith("|")) {
        // Table row — render as monospace text
        const cells = line.split("|").slice(1, -1).map((c) => c.trim()).join("  |  ");
        if (cells && !cells.match(/^[-|:\s]+$/)) {
          doc.fontSize(8).font("Courier").text(cells, { lineGap: 1 });
        }
      } else if (line.trim()) {
        const cleaned = line
          .replace(/\*\*([^*]+)\*\*/g, "$1")
          .replace(/\*([^*]+)\*/g, "$1");
        doc.moveDown(0.1).fontSize(9).font("Helvetica").text(cleaned, { lineGap: 2 });
      }
    }

    doc.end();
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function fmtMonth(ym: string): string {
  const [y, m] = ym.split("-");
  const date = new Date(Number(y), Number(m) - 1, 1);
  return date.toLocaleDateString("en", { month: "long", year: "numeric" });
}

function fmtBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}
