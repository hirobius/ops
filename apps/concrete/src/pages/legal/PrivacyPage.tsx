export default function PrivacyPage() {
  return (
    <article className="container-page py-20 max-w-editorial">
      <h1 className="text-3xl md:text-4xl">Privacy</h1>
      <p className="mt-2 text-xs uppercase tracking-wide text-secondary">Placeholder — review with counsel before launch.</p>

      <div className="mt-10 space-y-6 text-primary leading-relaxed text-sm">
        <section>
          <h2 className="text-lg text-primary">What we collect</h2>
          <p>
            When you place an order, we collect: name, shipping address, email,
            and (via Stripe) payment details. We do not store card numbers.
          </p>
        </section>
        <section>
          <h2 className="text-lg text-primary">How we use it</h2>
          <p>
            Solely to fulfill your order, send you a confirmation, and meet
            our tax and accounting obligations as a Washington State business.
          </p>
        </section>
        <section>
          <h2 className="text-lg text-primary">Sharing</h2>
          <p>
            We share your shipping address with the carrier. Stripe processes
            your payment under their own privacy terms. We do not sell or
            rent your information.
          </p>
        </section>
        <section>
          <h2 className="text-lg text-primary">Cookies &amp; analytics</h2>
          <p>
            Hirobius Studio uses minimal first-party storage to remember the
            contents of your cart between visits. No third-party advertising
            cookies.
          </p>
        </section>
        <section>
          <h2 className="text-lg text-primary">Contact</h2>
          <p>
            For data access or deletion requests, email
            <a href="mailto:studio@hirobius.com" className="underline ml-1">studio@hirobius.com</a>.
          </p>
        </section>
      </div>
    </article>
  );
}
