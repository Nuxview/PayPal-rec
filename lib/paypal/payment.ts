export type PaymentMode = "paypal_sandbox" | "synthetic_replay";
type Party = { name: string; email: string | null };

export type CasePayment = {
  source_mode: PaymentMode;
  transaction_id: string;
  captured_at: string;
  capture_status: string;
  amount: { value: string; currency: string };
  payer: Party | null;
  payee: Party | null;
};

export const paymentLabels: Record<PaymentMode, string> = {
  paypal_sandbox: "PayPal Sandbox",
  synthetic_replay: "Fixture replay · simulated payment",
};

export class PaymentImportError extends Error {}

export function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function validateCaptureId(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9_-]{0,49}$/.test(value) ||
    /^DEMO-/i.test(value)
  ) {
    throw new PaymentImportError("Supply a PayPal Sandbox capture ID.");
  }
  return value;
}

function paymentFields(value: unknown, currency: unknown, status: unknown, timestamp: unknown) {
  if (
    typeof value !== "string" || !/^[0-9]+(?:\.[0-9]+)?$/.test(value) ||
    typeof currency !== "string" || !/^[A-Z]{3}$/.test(currency) ||
    typeof status !== "string" || !/^[A-Z_]{1,40}$/.test(status) ||
    typeof timestamp !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(timestamp) ||
    !Number.isFinite(Date.parse(timestamp))
  ) {
    throw new PaymentImportError("Payment details are missing or invalid.");
  }
  // Keep PayPal's decimal string exactly as received, including trailing zeroes.
  return { amount: { value, currency }, capture_status: status, captured_at: timestamp };
}

export function normalizeCapture(payload: unknown, requestedId: string): CasePayment {
  const capture = asRecord(payload);
  const id = validateCaptureId(requestedId);
  if (capture.id !== id) throw new PaymentImportError("PayPal returned a different capture ID.");
  const amount = asRecord(capture.amount);
  return {
    source_mode: "paypal_sandbox",
    transaction_id: id,
    ...paymentFields(amount.value, amount.currency_code, capture.status, capture.create_time),
    // This import uses the capture record only. Do not infer a buyer or seller.
    payer: null,
    payee: null,
  };
}

function fixtureParty(value: unknown): Party {
  const party = asRecord(value);
  if (typeof party.name !== "string" || typeof party.email !== "string") {
    throw new PaymentImportError("The demo fixture is missing a party.");
  }
  return { name: party.name, email: party.email };
}

export function normalizeReplay(payload: unknown): CasePayment {
  const replay = asRecord(payload);
  if (replay.source_mode !== "synthetic_replay" || typeof replay.transaction_id !== "string" ||
    !/^DEMO-[A-Z0-9-]{1,44}$/.test(replay.transaction_id)) {
    throw new PaymentImportError("The demo payment must be marked as synthetic replay.");
  }
  const amount = asRecord(replay.amount);
  return {
    source_mode: "synthetic_replay",
    transaction_id: replay.transaction_id,
    ...paymentFields(amount.value, amount.currency, replay.capture_status, replay.captured_at),
    payer: fixtureParty(replay.payer),
    payee: fixtureParty(replay.payee),
  };
}
