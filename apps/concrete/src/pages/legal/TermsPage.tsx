export default function TermsPage() {
  return (
    <article className="container-page py-20 max-w-editorial prose-sm">
      <h1 className="text-3xl md:text-4xl">Terms of Sale</h1>
      <p className="mt-2 text-xs uppercase tracking-wide text-secondary">Placeholder — review with counsel before launch.</p>

      <div className="mt-10 space-y-6 text-primary leading-relaxed text-sm">
        <section>
          <h2 className="text-lg text-primary">1. The seller</h2>
          <p>
            All purchases on hirobius.studio are sold by Hirobius LLC, a
            Washington State limited liability company.
          </p>
        </section>
        <section>
          <h2 className="text-lg text-primary">2. Handmade variation</h2>
          <p>
            Each Form is hand-cast. Surface texture, slight color shift, and
            small inclusions are inherent to the material and are not defects.
            Listing photographs are representative of the edition.
          </p>
        </section>
        <section>
          <h2 className="text-lg text-primary">3. Pricing &amp; payment</h2>
          <p>
            Prices are in U.S. dollars. Sales tax is calculated at checkout
            based on the destination address. Payment is processed by Stripe;
            Hirobius does not store card information.
          </p>
        </section>
        <section>
          <h2 className="text-lg text-primary">4. Shipping &amp; risk of loss</h2>
          <p>
            Title and risk of loss pass to the buyer on delivery to the carrier.
            See <a href="/legal/shipping-returns" className="underline">Shipping &amp; Returns</a> for full terms.
          </p>
        </section>
        <section>
          <h2 className="text-lg text-primary">5. Limitation of liability</h2>
          <p>
            Hirobius LLC's total liability for any order is limited to the
            amount paid for that order.
          </p>
        </section>
        <section>
          <h2 className="text-lg text-primary">6. Governing law</h2>
          <p>
            These terms are governed by the laws of the State of Washington,
            without regard to conflict of laws principles.
          </p>
        </section>
      </div>
    </article>
  );
}
