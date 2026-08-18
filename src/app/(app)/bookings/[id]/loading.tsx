// Shown the instant a booking row is clicked, while the page's data loads.
// A skeleton in the shape of the real record reads as "it's opening" far better
// than a centered spinner does, so the wait stops feeling like a dead click.
function Bar({ w, h = 14 }: { w: string; h?: number }) {
  return (
    <span
      className="block animate-pulse rounded"
      style={{ width: w, height: h, background: "var(--border-strong)" }}
    />
  );
}

function Section({ fields }: { fields: number }) {
  return (
    <div className="card space-y-4">
      <Bar w="140px" h={16} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: fields }).map((_, i) => (
          <div key={i} className="space-y-2">
            <Bar w="70px" h={10} />
            <Bar w="120px" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading booking">
      <div className="mb-6 space-y-3">
        <Bar w="90px" h={12} />
        <Bar w="260px" h={24} />
        <Bar w="340px" h={12} />
      </div>

      {/* Status strip */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Bar w="90px" h={20} />
        <Bar w="80px" h={20} />
        <Bar w="70px" h={20} />
        <Bar w="110px" h={20} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Section fields={3} />
          <Section fields={5} />
          <Section fields={6} />
        </div>
        <div className="space-y-6">
          <Section fields={2} />
          <Section fields={2} />
        </div>
      </div>
    </div>
  );
}
