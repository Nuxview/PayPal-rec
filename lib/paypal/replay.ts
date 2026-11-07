import fixture from "../../fixtures/restriction-agency-v1/inputs/paypal-payment.json" with { type: "json" };
import { normalizeReplay } from "./payment.ts";

export function loadReplayPayment() {
  return normalizeReplay(fixture);
}
