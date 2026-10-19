export type CourierOption = {
  courierId: string;
  name: string;
  /** Courier's quoted cost to us, in paise. */
  costPaise: number;
  etaDays: number | null;
  etaDate: string | null; // ISO date (YYYY-MM-DD) if the courier provides one
  cod: boolean;
  rating: number | null;
};

export type ServiceabilityQuery = {
  pickupPincode: string;
  deliveryPincode: string;
  weightGrams: number;
  cod: boolean;
  declaredValuePaise: number;
  lengthCm: number;
  breadthCm: number;
  heightCm: number;
};

export type ServiceabilityResult = {
  serviceable: boolean;
  couriers: CourierOption[];
  recommendedCourierId: string | null;
};

export type ShipmentRequest = {
  orderNumber: string;
  orderDate: Date;
  paymentMethod: "PREPAID" | "COD";
  customer: { name: string; phone: string; email: string; line1: string; line2: string; city: string; state: string; pincode: string };
  items: { name: string; sku: string; units: number; unitPricePaise: number; gstRateBp: number; hsn: string }[];
  subtotalPaise: number;
  discountPaise: number;
  shippingPaise: number;
  codFeePaise: number;
  totalPaise: number;
  weightGrams: number;
  lengthCm: number;
  breadthCm: number;
  heightCm: number;
  customerGstin: string;
  invoiceNumber: string;
  courierId: string | null;
  /** Set when resuming a shipment whose earlier steps already succeeded. */
  existing?: { providerOrderId: string; providerShipmentId: string; awb: string | null };
};

export type CreatedShipment = {
  providerOrderId: string;
  providerShipmentId: string;
  awb: string;
  courierName: string;
  labelUrl: string;
  trackingUrl: string;
  pickupScheduledAt: string | null;
};

/** Normalised shipment states (see schema shipment_status). */
export type NormalizedShipmentStatus =
  | "PICKUP_SCHEDULED"
  | "IN_TRANSIT"
  | "OUT_FOR_DELIVERY"
  | "DELIVERED"
  | "DELIVERY_FAILED"
  | "RTO_INITIATED"
  | "RTO_DELIVERED"
  | "CANCELLED";

export type TrackingEvent = { status: string; description: string; location: string; occurredAt: Date };

export type TrackingResult = {
  status: NormalizedShipmentStatus | null;
  rawStatus: string;
  etaDate: string | null;
  events: TrackingEvent[];
};

export class ShipmentStepError extends Error {
  constructor(
    message: string,
    /** Whatever succeeded before the failure, so the next attempt can resume. */
    public partial: { providerOrderId?: string; providerShipmentId?: string; awb?: string | null },
  ) {
    super(message);
  }
}

export interface ShippingProvider {
  readonly name: "shiprocket" | "mock";
  readonly isSimulated: boolean;
  checkServiceability(query: ServiceabilityQuery): Promise<ServiceabilityResult>;
  createShipment(request: ShipmentRequest): Promise<CreatedShipment>;
  track(awb: string): Promise<TrackingResult>;
  cancelShipment(awb: string): Promise<void>;
  postcodeDetails(pincode: string): Promise<{ city: string; state: string } | null>;
}
