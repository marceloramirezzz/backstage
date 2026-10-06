import { getPool } from "@/db/pool.ts";
import { renderQuotePdf } from "@/lib/quote-pdf.ts";
import { quoteNumberLabel } from "@/lib/quote.ts";
import { getCurrentUser } from "@/lib/session.ts";
import { generateQuote, type QuoteSource } from "@/services/documents.ts";
import { ServiceError } from "@/services/errors.ts";

const STATUS: Partial<Record<ServiceError["code"], number>> = {
  forbidden: 403,
  not_found: 404,
  invalid_input: 400,
};

// The quote PDF, drawn on demand and never stored: `?evento=<id>` for an
// Event, or `?solicitud=<id>&monto=<Gs>` for a Booking Request.
export async function GET(request: Request, { params }: RouteContext<"/p/[projectId]/documentos/cotizacion">) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const { projectId } = await params;
  const query = new URL(request.url).searchParams;
  const eventId = query.get("evento");
  const requestId = query.get("solicitud");
  const source: QuoteSource | null = eventId
    ? { eventId }
    : requestId
      ? { bookingRequestId: requestId, amount: Number(query.get("monto")) }
      : null;
  if (!source) return new Response("Falta el evento o la solicitud", { status: 400 });
  try {
    const { number, model } = await generateQuote(getPool(), user, projectId, source);
    const pdf = await renderQuotePdf(model);
    return new Response(Buffer.from(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${quoteNumberLabel(number)}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    if (err instanceof ServiceError) return new Response(err.message, { status: STATUS[err.code] ?? 400 });
    throw err;
  }
}
