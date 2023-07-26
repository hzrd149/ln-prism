type InvoiceDetails = {
  paymentRequest: string;
  paymentHash: string;
};
type PaymentDetails = {
  paymentHash: string;
  fee: number;
};

export enum InvoiceStatus {
  PENDING = "pending",
  PAID = "paid",
  EXPIRED = "expired",
}

export interface LightningBackend {
  setup(): Promise<void>;
  createInvoice(
    amount: number,
    description?: string,
    webhook?: string
  ): Promise<InvoiceDetails>;
  payInvoice(invoice: string): Promise<PaymentDetails>;
  getInvoiceStatus(hash: string): Promise<InvoiceStatus>;
  // checkPaymentComplete(hash: string): Promise<boolean>;
}
