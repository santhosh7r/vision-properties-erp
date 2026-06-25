import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCapability } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import { PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import CustomerFields from "@/components/CustomerFields";
import type { Customer } from "@/lib/types";
import { updateCustomer } from "../../actions";
import { getDistrictNames } from "@/lib/districts";

export const dynamic = "force-dynamic";

export default async function EditCustomerPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ err?: string }>;
}) {
  const { id } = await params;
  const { err } = await searchParams;
  await requireCapability("manage_customers");

  const sb = getSupabase();
  const { data } = await sb.from("customers").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  const customer = data as Customer;
  const districts = await getDistrictNames(sb);

  return (
    <>
      <PageHeader
        title="Edit Customer"
        subtitle={customer.name}
        back={{ href: `/customers/${id}`, label: "← Back" }}
      />

      {err === "dup" && (
        <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-400">
          Another customer already uses that mobile number.
        </div>
      )}

      <form action={updateCustomer} className="max-w-3xl space-y-6">
        <input type="hidden" name="id" value={customer.id} />
        <div className="card">
          <CustomerFields c={customer} districts={districts} />
        </div>
        <div className="flex justify-end gap-3">
          <Link href={`/customers/${id}`} className="btn-ghost">Cancel</Link>
          <SubmitButton pendingLabel="Saving…">Save Changes</SubmitButton>
        </div>
      </form>
    </>
  );
}
