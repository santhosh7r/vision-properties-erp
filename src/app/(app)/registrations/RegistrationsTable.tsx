"use client";

import DataTable, { type Column } from "@/components/DataTable";
import { fmtDate, shortRef } from "@/lib/format";

export interface RegistrationRow {
  id: string;
  bookingId: string | null; // source booking — its Ref traces the whole journey
  project: string;
  plot: string;
  register_number: string;
  register_date: string;
  registrant: string;
  mobile: string;
}

export default function RegistrationsTable({ rows }: { rows: RegistrationRow[] }) {
  const columns: Column<RegistrationRow>[] = [
    { id: "ref", header: "Booking Ref", sort: (r) => r.bookingId ?? "", cell: (r) => <span className="font-mono text-xs text-[var(--muted)]">{shortRef(r.bookingId)}</span> },
    { id: "project", header: "Project", sort: (r) => r.project.toLowerCase(), cell: (r) => <span className="font-medium text-[var(--text)]">{r.project}</span> },
    { id: "plot", header: "Plot", cell: (r) => r.plot },
    { id: "regno", header: "Register No", sort: (r) => r.register_number, cell: (r) => <span className="font-medium">{r.register_number}</span> },
    { id: "date", header: "Register Date", sort: (r) => r.register_date, cell: (r) => <span className="whitespace-nowrap">{fmtDate(r.register_date)}</span> },
    { id: "registrant", header: "Registrant", sort: (r) => r.registrant.toLowerCase(), hideBelow: "sm", cell: (r) => r.registrant },
    { id: "mobile", header: "Mobile", hideBelow: "md", cell: (r) => r.mobile || "—" },
  ];

  return (
    <DataTable
      rows={rows}
      columns={columns}
      search={(r) => `${shortRef(r.bookingId)} ${r.project} ${r.plot} ${r.register_number} ${r.registrant}`}
      searchPlaceholder="Search register no, project, registrant…"
      emptyMessage="No registrations yet."
    />
  );
}
