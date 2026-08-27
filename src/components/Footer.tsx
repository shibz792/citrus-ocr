export function Footer() {
  return (
    <footer className="border-t border-border/80">
      <div className="mx-auto flex max-w-5xl flex-col gap-3 px-6 py-8 text-sm text-foreground-muted sm:flex-row sm:items-center sm:justify-between">
        <p>
          Built by{" "}
          <span className="font-semibold text-citrus-charcoal dark:text-foreground">
            Citrus Global
          </span>{" "}
          as a community test client. Not affiliated with or endorsed by Baidu.
        </p>
        <p className="flex items-center gap-1.5">
          Model &amp; inference by
          <a
            className="font-medium text-citrus-pink hover:underline"
            href="https://github.com/baidu/Unlimited-OCR"
            target="_blank"
            rel="noreferrer"
          >
            baidu/Unlimited-OCR
          </a>
          <span aria-hidden>·</span>
          <span>MIT licensed</span>
        </p>
      </div>
    </footer>
  );
}
