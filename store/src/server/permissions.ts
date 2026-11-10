/**
 * Staff roles and what each may do. Every admin page and server action checks
 * these on the server; hiding buttons in the UI is only a convenience.
 */
export type StaffRole = "OWNER" | "MANAGER" | "PACKER" | "ACCOUNTANT";

export type Permission =
  | "dashboard.view"
  | "orders.view"
  | "orders.customerDetails" // email, full history; packers only see shipping details
  | "orders.manage" // confirm COD, cancel, edit tracking
  | "orders.pack" // mark packed, book courier, print labels and packing slips
  | "orders.refund"
  | "products.manage"
  | "inventory.view"
  | "inventory.manage"
  | "customers.view"
  | "coupons.manage"
  | "reviews.manage"
  | "enquiries.manage" // bulk / business order enquiries
  | "reports.operations" // order counts, stock, delivery performance
  | "reports.finance" // sales, payments, refunds, GST
  | "exports"
  | "settings.manage"
  | "staff.manage"
  | "audit.view";

const ALL: Permission[] = [
  "dashboard.view",
  "orders.view",
  "orders.customerDetails",
  "orders.manage",
  "orders.pack",
  "orders.refund",
  "products.manage",
  "inventory.view",
  "inventory.manage",
  "customers.view",
  "coupons.manage",
  "reviews.manage",
  "enquiries.manage",
  "reports.operations",
  "reports.finance",
  "exports",
  "settings.manage",
  "staff.manage",
  "audit.view",
];

export const ROLE_PERMISSIONS: Record<StaffRole, readonly Permission[]> = {
  OWNER: ALL,
  MANAGER: [
    "dashboard.view",
    "orders.view",
    "orders.customerDetails",
    "orders.manage",
    "orders.pack",
    "products.manage",
    "inventory.view",
    "inventory.manage",
    "customers.view",
    "coupons.manage",
    "reviews.manage",
    "enquiries.manage",
    "reports.operations",
  ],
  PACKER: ["orders.view", "orders.pack", "inventory.view"],
  ACCOUNTANT: [
    "dashboard.view",
    "orders.view",
    "orders.customerDetails",
    "customers.view",
    "inventory.view",
    "reports.operations",
    "reports.finance",
    "exports",
  ],
};

export const ROLE_LABELS: Record<StaffRole, string> = {
  OWNER: "Owner",
  MANAGER: "Manager",
  PACKER: "Packing staff",
  ACCOUNTANT: "Accountant (read-only)",
};

export function can(role: StaffRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}
