export default function ShippingReturnsPage() {
  return (
    <article className="container-page py-20 max-w-editorial">
      <h1 className="text-3xl md:text-4xl">Shipping &amp; Returns</h1>
      <p className="mt-2 text-xs uppercase tracking-wide text-secondary">Placeholder — review with counsel before launch.</p>

      <div className="mt-10 space-y-6 text-primary leading-relaxed text-sm">
        <section>
          <h2 className="text-lg text-primary">Where we ship</h2>
          <p>
            We currently ship to all 50 U.S. states. International orders are
            not yet available — please email if you'd like to be notified
            when they open.
          </p>
        </section>
        <section>
          <h2 className="text-lg text-primary">Cost</h2>
          <p>
            Shipping is included in the listed price. There is no separate
            shipping fee at checkout.
          </p>
        </section>
        <section>
          <h2 className="text-lg text-primary">Pickup</h2>
          <p>
            Local pickup is offered at checkout for buyers in the Spokane,
            WA area. Pickup details are emailed with the order confirmation.
          </p>
        </section>
        <section>
          <h2 className="text-lg text-primary">Timing</h2>
          <p>
            Orders ship within 3–5 business days. Carrier transit time is
            additional and varies by destination.
          </p>
        </section>
        <section>
          <h2 className="text-lg text-primary">Damage in transit</h2>
          <p>
            Each piece is wrapped and packed by hand. If a piece arrives
            damaged, email
            <a href="mailto:studio@hirobius.com" className="underline ml-1">studio@hirobius.com</a>
            within 7 days with photographs and we'll arrange a replacement
            (subject to edition availability) or refund.
          </p>
        </section>
        <section>
          <h2 className="text-lg text-primary">Returns</h2>
          <p>
            Because each Form is part of a small edition, we do not accept
            returns or exchanges for change of mind. Damage and defect claims
            are covered above.
          </p>
        </section>
      </div>
    </article>
  );
}
