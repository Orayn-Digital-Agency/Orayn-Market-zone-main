export const metadata = { title: "Payment received" };

export default function PaymentReceivedPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-orayn-light px-6">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-orayn-mid p-8 text-center">
        <div className="mx-auto mb-4 w-12 h-12 rounded-full bg-orayn-green-bg flex items-center justify-center text-orayn-green text-2xl">
          ✓
        </div>
        <h1 className="font-sora text-xl font-bold text-orayn-navy mb-2">
          Thank you. Your payment is being confirmed.
        </h1>
        <p className="text-sm text-orayn-gray">
          We will be in touch shortly with the next steps for your website. You can
          close this page.
        </p>
      </div>
    </main>
  );
}
