import Image from "next/image";
import logo from "../../public/citrus-global.png";

export function Header() {
  return (
    <header className="border-b border-border/80">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-5">
        <div className="flex items-center gap-3">
          <Image
            src={logo}
            alt="Citrus Global"
            className="h-8 w-auto sm:h-9"
            priority
          />
          <span className="hidden h-6 w-px bg-border sm:block" aria-hidden />
          <span className="hidden text-sm font-medium text-foreground-muted sm:block">
            Citrus OCR
          </span>
        </div>

        <span className="rounded-full bg-citrus-teal-soft px-3.5 py-1.5 text-xs font-semibold text-citrus-teal">
          Beta
        </span>
      </div>
    </header>
  );
}
