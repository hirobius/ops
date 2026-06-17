export default function AboutPage() {
  return (
    <article className="container-page py-20 md:py-28 max-w-editorial">
      <h1 className="text-4xl md:text-5xl leading-[1.1]">
        About the studio
      </h1>

      <div className="mt-12 space-y-6 text-primary leading-relaxed">
        <p>
          Hirobius Studio is the maker arm of Hirobius LLC, a Washington
          State company. The studio produces small editions of hand-cast
          concrete figures, made one at a time in Spokane.
        </p>
        <p>
          Every piece begins as a mold. The mold is poured slowly — often
          across multiple sessions — and each cast is finished by hand.
          The texture you see is what the material does on its own. We
          keep the variation rather than smoothing it away.
        </p>
        <p>
          Editions are small on purpose. Once an edition is complete, the
          mold is retired and the next Form begins.
        </p>
        <p>
          The Hirobius name covers both this concrete work and the
          computer-aided design practice the studio is built on.
        </p>
      </div>
    </article>
  );
}
