"use client";

import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import type { ImportReport, ImportState } from "./actions";

// TWO-STEP import: check, then import.
//
// Step 1 reads the file and validates every row WITHOUT writing anything. If
// there is a single problem the file is refused outright and every reason is
// listed, so a sheet can never land half-imported. Step 2 only appears once the
// file is provably clean, and it shows what will be created before it is.
//
// Only the first sheet of a workbook is read — any other sheets are named back
// to the user rather than silently skipped or merged in.
//
// The picked File lives in React state, NOT in the <input>, and each step posts
// a FormData built by hand. That is deliberate: React resets an uncontrolled
// form once its action resolves, which emptied the file input between check and
// import and made step 2 submit no file at all. Holding the File in state also
// guarantees both steps send the same bytes — the import can never validate one
// file and write another.

const ACCEPTED = [".xlsx", ".csv"];

function isAccepted(name: string) {
  return ACCEPTED.some((ext) => name.toLowerCase().endsWith(ext));
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Same palette the Badge tones use, so notices sit with the rest of the UI.
const NOTICE_TONE = {
  red: "bg-red-500/15 text-red-400 border-red-500/30",
  green: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  amber: "bg-amber-500/15 text-amber-400 border-amber-500/30",
};

function Notice({ tone, children }: { tone: keyof typeof NOTICE_TONE; children: React.ReactNode }) {
  return <div className={`rounded-lg border px-3 py-2 text-sm ${NOTICE_TONE[tone]}`}>{children}</div>;
}

/** Tab-separated, so a paste into Excel lands as columns rather than one blob. */
function toTSV(headers: string[], rows: string[][]) {
  return [headers, ...rows].map((r) => r.map((c) => c.replace(/\t|\r?\n/g, " ")).join("\t")).join("\n");
}

/**
 * Copies a whole table in one press. Hand-selecting 800+ scrolling rows is not a
 * realistic way to get a problem list into a spreadsheet.
 *
 * The clipboard API needs a secure context, and this app is also served over the
 * LAN on plain http (192.168.x.x), where it is unavailable — hence the
 * execCommand fallback rather than a copy button that silently does nothing.
 */
function CopyButton({ headers, rows, label }: { headers: string[]; rows: string[][]; label: string }) {
  const [done, setDone] = useState<"copied" | "failed" | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  function flash(result: "copied" | "failed") {
    setDone(result);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setDone(null), 2000);
  }

  async function copy() {
    const text = toTSV(headers, rows);
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand("copy");
        document.body.removeChild(ta);
        if (!ok) throw new Error("execCommand refused");
      }
      flash("copied");
    } catch {
      flash("failed");
    }
  }

  return (
    <button type="button" onClick={copy} className="btn-ghost shrink-0" style={{ padding: "4px 10px", fontSize: 12 }}>
      {done === "copied" ? "Copied ✓" : done === "failed" ? "Copy failed" : label}
    </button>
  );
}

/**
 * Says which sheet was read. Silence here would be the dangerous case: a user
 * with data on tab 2 needs to be told it was never looked at, not left to infer
 * it from a row count.
 */
function SheetNote({ report }: { report: ImportReport }) {
  if (!report.ignoredSheets.length) {
    return (
      <p className="text-xs text-[var(--muted)]">
        Read from the first sheet, <span className="text-[var(--text)]">{report.sheetName}</span>.
      </p>
    );
  }
  return (
    <Notice tone="amber">
      Only the first sheet, <strong>{report.sheetName}</strong>, was read. The{" "}
      {report.ignoredSheets.length === 1 ? "other sheet" : `other ${report.ignoredSheets.length} sheets`} (
      {report.ignoredSheets.join(", ")}) {report.ignoredSheets.length === 1 ? "was" : "were"} ignored
      entirely. If your data is on one of those, move it to the first sheet and check again.
    </Notice>
  );
}

export default function ImportCard({
  title,
  description,
  templateType,
  action,
}: {
  title: string;
  description: string;
  templateType: "project" | "plot";
  action: (prev: ImportState, formData: FormData) => Promise<ImportState>;
}) {
  const [state, formAction, isPending] = useActionState<ImportState, FormData>(action, null);

  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  // Counts dragenter/dragleave so dragging over a child element does not flicker
  // the highlight off — leave only wins when the counter returns to zero.
  const dragDepth = useRef(0);
  const [dragging, setDragging] = useState(false);
  const [dropError, setDropError] = useState<string | null>(null);
  // Hide the previous result the moment a different file is picked, so an old
  // report is never read as belonging to the file now selected.
  const [dirty, setDirty] = useState(false);

  // Clear after a successful import — re-submitting the same file would only be
  // refused as duplicate anyway.
  useEffect(() => {
    if (state?.phase === "imported") {
      setFile(null);
      setDropError(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  }, [state]);

  function pick(list: FileList | null) {
    const picked = list?.[0];
    if (!picked) return;
    if (!isAccepted(picked.name)) {
      setDropError(`${picked.name} is not an Excel or CSV file. Use ${ACCEPTED.join(" or ")}.`);
      return;
    }
    setFile(picked);
    setDropError(null);
    setDirty(true);
  }

  function clearFile() {
    if (inputRef.current) inputRef.current.value = "";
    setFile(null);
    setDropError(null);
    setDirty(true);
  }

  function submit(intent: "check" | "import") {
    if (!file || isPending) return;
    const fd = new FormData();
    fd.set("file", file);
    fd.set("intent", intent);
    setDirty(false);
    startTransition(() => formAction(fd));
  }

  const report =
    state?.phase === "invalid" || state?.phase === "checked" ? state.report : null;
  // The import button exists only once THIS file has been checked clean. Picking
  // a different file sets `dirty` and takes it away again, so the button can
  // never import a file the report on screen does not describe.
  const readyToImport = !dirty && state?.phase === "checked";

  return (
    <div className="rounded-2xl border bg-[var(--surface)] p-6" style={{ borderColor: "var(--border)" }}>
      <div className="mb-1 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-[var(--text)]">{title}</h2>
        <a
          href={`/inventory/import/template?type=${templateType}`}
          className="btn-ghost shrink-0"
          style={{ padding: "5px 12px", fontSize: 12 }}
        >
          ↓ Download Excel template
        </a>
      </div>
      <p className="mb-4 text-sm text-[var(--muted)]">{description}</p>

      <div className="space-y-3">
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED.join(",")}
          // Inline, not a class: the dropzone is the whole control, and no
          // stylesheet should be able to bring the native widget back.
          style={{ display: "none" }}
          onChange={(e) => pick(e.target.files)}
        />

        <div
          onDragEnter={(e) => {
            e.preventDefault();
            dragDepth.current += 1;
            setDragging(true);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = "copy";
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            dragDepth.current -= 1;
            if (dragDepth.current <= 0) {
              dragDepth.current = 0;
              setDragging(false);
            }
          }}
          onDrop={(e) => {
            e.preventDefault();
            dragDepth.current = 0;
            setDragging(false);
            pick(e.dataTransfer.files);
          }}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              inputRef.current?.click();
            }
          }}
          role="button"
          tabIndex={0}
          aria-label={`Drop an Excel or CSV file here, or click to browse. ${title} import.`}
          className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-7 text-center transition-colors"
          style={{
            borderColor: dragging ? "var(--accent)" : "var(--border)",
            background: dragging ? "var(--accent-soft)" : "transparent",
          }}
        >
          {file ? (
            <>
              <span className="text-sm font-medium text-[var(--text)]">{file.name}</span>
              <span className="mt-0.5 text-xs text-[var(--muted)]">{formatSize(file.size)}</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  clearFile();
                }}
                className="btn-ghost mt-3"
                style={{ padding: "4px 10px", fontSize: 12 }}
              >
                Remove
              </button>
            </>
          ) : (
            <>
              <span className="text-sm text-[var(--text)]">
                Drag an Excel file here, or{" "}
                <span className="font-medium text-[var(--accent)]">browse</span>
              </span>
              <span className="mt-1 text-xs text-[var(--muted)]">.xlsx or .csv, one file</span>
            </>
          )}
        </div>

        {dropError && <Notice tone="amber">{dropError}</Notice>}

        <div className="flex flex-wrap items-center gap-3">
          {readyToImport ? (
            <button
              type="button"
              className="btn-primary"
              onClick={() => submit("import")}
              disabled={isPending}
              aria-busy={isPending}
            >
              {isPending
                ? "Importing…"
                : `Import ${report?.totalRows ?? 0} ${report?.totalRows === 1 ? "row" : "rows"}`}
            </button>
          ) : (
            <button
              type="button"
              className="btn-primary"
              onClick={() => submit("check")}
              disabled={isPending || !file}
              aria-busy={isPending}
            >
              {isPending ? "Checking…" : "Check file"}
            </button>
          )}
          <span className="text-xs text-[var(--muted)]">
            {readyToImport
              ? "Nothing has been saved yet — this writes the rows above."
              : "The file is checked first. Nothing is saved until you confirm."}
          </span>
        </div>
      </div>

      {!dirty && (
        <div className="mt-4 space-y-3">
          {state?.phase === "rejected" && (
            <Notice tone="red">
              <strong>Nothing was saved.</strong> {state.error}
            </Notice>
          )}

          {state?.phase === "imported" && (
            <Notice tone="green">
              <strong>
                Imported {state.created} {state.created === 1 ? "row" : "rows"}
              </strong>{" "}
              from {state.fileName}. Uploading the same file again will be refused as duplicate, so
              it is safe to keep.
            </Notice>
          )}

          {report && <SheetNote report={report} />}

          {state?.phase === "invalid" && (
            <>
              <Notice tone="red">
                <strong>Nothing was saved.</strong> {state.report.fileName} has{" "}
                {state.report.issues.length}{" "}
                {state.report.issues.length === 1 ? "problem" : "problems"} across{" "}
                {state.report.totalRows} {state.report.totalRows === 1 ? "row" : "rows"}. The whole
                file is refused until every problem below is fixed — correct the sheet and upload it
                again.
              </Notice>
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-[var(--muted)]">
                  All {state.report.issues.length} listed below.
                </span>
                <CopyButton
                  label={`Copy all ${state.report.issues.length} problems`}
                  headers={["Row", "Column", "What to correct"]}
                  rows={state.report.issues.map((it) => [
                    it.row === null ? "" : String(it.row),
                    it.column,
                    it.message,
                  ])}
                />
              </div>
              <div
                className="max-h-72 overflow-y-auto rounded-lg border text-xs"
                style={{ borderColor: "var(--border)" }}
              >
                <table className="w-full">
                  <thead className="sticky top-0 bg-[var(--surface-2)] text-[var(--muted)]">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">Row</th>
                      <th className="px-3 py-2 text-left font-medium">Column</th>
                      <th className="px-3 py-2 text-left font-medium">What to correct</th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.report.issues.map((it, i) => (
                      <tr key={i} className="border-t" style={{ borderColor: "var(--border)" }}>
                        <td className="whitespace-nowrap px-3 py-2 tabular-nums text-[var(--text)]">
                          {it.row ?? "—"}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-[var(--muted)]">{it.column}</td>
                        <td className="px-3 py-2 text-[var(--text)]">{it.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {state?.phase === "checked" && (
            <>
              <Notice tone="green">
                <strong>Checked — no problems found.</strong> {state.report.fileName} holds{" "}
                {state.report.totalRows} {state.report.totalRows === 1 ? "row" : "rows"}, all valid.
                Nothing has been saved yet. Review the first rows below, then press Import.
              </Notice>
              <div className="flex items-center justify-end">
                <CopyButton
                  label="Copy preview"
                  headers={state.report.previewHeaders}
                  rows={state.report.previewRows}
                />
              </div>
              <div
                className="max-h-72 overflow-auto rounded-lg border text-xs"
                style={{ borderColor: "var(--border)" }}
              >
                {/* Every imported column is here, so the table is wider than the
                    card and scrolls sideways. The row-number column is pinned so
                    the row being read stays identifiable at any scroll offset. */}
                <table className="w-max min-w-full border-separate border-spacing-0">
                  <thead className="text-[var(--muted)]">
                    <tr>
                      {state.report.previewHeaders.map((h, i) => (
                        <th
                          key={h}
                          className={`sticky top-0 z-10 whitespace-nowrap border-b bg-[var(--surface-2)] px-3 py-2 text-left font-medium ${
                            i === 0 ? "left-0 z-20" : ""
                          }`}
                          style={{ borderColor: "var(--border)" }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {state.report.previewRows.map((r, i) => (
                      <tr key={i}>
                        {r.map((c, j) => (
                          <td
                            key={j}
                            className={`whitespace-nowrap border-b px-3 py-2 text-[var(--text)] ${
                              j === 0
                                ? "sticky left-0 z-10 bg-[var(--surface)] tabular-nums text-[var(--muted)]"
                                : ""
                            }`}
                            style={{ borderColor: "var(--border)" }}
                          >
                            {c}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-[var(--muted)]">
                Every column that will be imported is shown — scroll sideways to see them all.
                {state.report.totalRows > state.report.previewRows.length && (
                  <>
                    {" "}
                    Showing the first {state.report.previewRows.length} of {state.report.totalRows}{" "}
                    rows; all {state.report.totalRows} were checked and all will be imported.
                  </>
                )}
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
