import Link from "next/link";
import { requireCapability } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import CustomerFields from "@/components/CustomerFields";
import { SubmitButton } from "@/components/SubmitButton";
import { createCustomer } from "../actions";

export const dynamic = "force-dynamic";

export default async function NewCustomerPage() {
  await requireCapability("manage_customers");
  return (
    <>
      <PageHeader
        title="Add Customer"
        subtitle="Capture the customer's personal, contact and identity details."
        back={{ href: "/customers", label: "← Back" }}
      />
      <form action={createCustomer} className="max-w-3xl space-y-6">
        <div className="card">
          <CustomerFields />
        </div>
        <div className="flex justify-end gap-3">
          <Link href="/customers" className="btn-ghost">Cancel</Link>
          <SubmitButton className="btn-primary" pendingLabel="Saving…">Save Customer</SubmitButton>
        </div>
      </form>
    </>
  );
}
