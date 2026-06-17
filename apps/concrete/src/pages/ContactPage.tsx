export default function ContactPage() {
  return (
    <article className="container-page py-20 md:py-28 max-w-editorial">
      <h1 className="text-4xl md:text-5xl leading-[1.1]">
        Contact
      </h1>

      <div className="mt-12 space-y-8 text-primary leading-relaxed">
        <p>
          For commissions, press, or questions about a specific Form,
          email <a href="mailto:studio@hirobius.com" className="underline underline-offset-4 hover:no-underline">studio@hirobius.com</a>.
        </p>

        <div>
          <p className="uppercase tracking-wide text-xs text-secondary">Studio</p>
          <p className="mt-2">Spokane, Washington</p>
          <p className="mt-1 text-sm text-secondary">By appointment only.</p>
        </div>

        <div>
          <p className="uppercase tracking-wide text-xs text-secondary">Local pickup</p>
          <p className="mt-2 text-sm text-primary">
            Available at checkout for buyers in the Spokane area. Pickup
            details are sent with the order confirmation.
          </p>
        </div>
      </div>
    </article>
  );
}
