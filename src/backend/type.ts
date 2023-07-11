type InvoiceDetails = {
  paymentRequest: string;
  paymentHash: string;
};
type PaymentDetails = {
  paymentHash: string;
  fee: number;
};

export interface LightningBackend {
  setup(): Promise<void>;
  createInvoice(
    amount: number,
    description?: string,
    webhook?: string
  ): Promise<InvoiceDetails>;
  payInvoice(invoice: string): Promise<PaymentDetails>;
}
