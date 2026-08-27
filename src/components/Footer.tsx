export function Footer() {
  return (
    <footer className="border-t border-border/80">
      <div className="mx-auto flex max-w-5xl flex-col gap-2 px-6 py-8 text-sm text-foreground-muted sm:flex-row sm:items-center sm:justify-between">
        <p>
          <span className="font-semibold text-citrus-charcoal dark:text-foreground">
            Citrus OCR
          </span>{" "}
          by Citrus Global
        </p>
        <p>Powered by long-horizon OCR research technology.</p>
      </div>
    </footer>
  );
}
