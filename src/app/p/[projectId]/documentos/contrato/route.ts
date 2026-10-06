import { getPool } from "@/db/pool.ts";
import { renderContractPdf } from "@/lib/contract-pdf.ts";
import { getCurrentUser } from "@/lib/session.ts";
import { generateContract } from "@/services/documents.ts";
import { ServiceError } from "@/services/errors.ts";

const STATUS: Partial<Record<ServiceError["code"], number>> = {
  forbidden: 403,
  not_found: 404,
  invalid_input: 400,
};

// The contract PDF of an Event (`?evento=<id>`), drawn on demand and never stored.
export async function GET(request: Request, { params }: RouteContext<"/p/[projectId]/documentos/contrato">) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const { projectId } = await params;
  const eventId = new URL(request.url).searchParams.get("evento");
  if (!eventId) return new Response("Falta el evento", { status: 400 });
  try {
    const { model } = await generateContract(getPool(), user, projectId, eventId);
    const pdf = await renderContractPdf(model);
    return new Response(Buffer.from(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${model.numberLabel}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    if (err instanceof ServiceError) return new Response(err.message, { status: STATUS[err.code] ?? 400 });
    throw err;
  }
}
