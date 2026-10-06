import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPool } from "@/db/pool.ts";
import { PLACEHOLDERS } from "@/lib/contract.ts";
import { requireUser } from "@/lib/session.ts";
import { getContractTemplate } from "@/services/documents.ts";
import { getPermissions } from "@/services/permissions.ts";
import { ContractForm } from "./contract-form.tsx";

export const metadata: Metadata = { title: "Contrato · Backstage" };

// The Banda's contract template, edited by Admins.
export default async function ContractTemplate({ params }: PageProps<"/p/[projectId]/contrato">) {
  const user = await requireUser();
  const { projectId } = await params;
  const pool = getPool();
  if (!(await getPermissions(pool, user, projectId)).administer) notFound();
  const body = await getContractTemplate(pool, user, projectId);

  return (
    <main className="flex min-w-0 flex-col gap-6 p-6 max-desktop:px-4">
      <div className="flex flex-col gap-1">
        <h1 className="m-0 text-display">Contrato</h1>
        <p className="m-0 text-[14px]/[20px] text-ink-muted">
          El texto que se usa al descargar el contrato de un evento. Separá los párrafos con una línea en blanco.
        </p>
      </div>
      <dl className="m-0 grid max-w-[720px] gap-1 text-[13px]/[18px]">
        {PLACEHOLDERS.map((p) => (
          <div key={p.name} className="flex gap-2">
            <dt className="font-mono">{`{{${p.name}}}`}</dt>
            <dd className="m-0 text-ink-muted">{p.description}</dd>
          </div>
        ))}
      </dl>
      <ContractForm projectId={projectId} body={body} />
    </main>
  );
}
