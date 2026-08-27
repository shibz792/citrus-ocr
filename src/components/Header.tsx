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
            OCR Lab
          </span>
        </div>

        <nav className="flex items-center gap-5 text-sm font-medium text-foreground-muted">
          <a
            className="transition-colors hover:text-citrus-pink"
            href="https://github.com/baidu/Unlimited-OCR"
            target="_blank"
            rel="noreferrer"
          >
            Unlimited-OCR
          </a>
          <a
            className="hidden transition-colors hover:text-citrus-pink sm:inline"
            href="https://huggingface.co/spaces/baidu/Unlimited-OCR"
            target="_blank"
            rel="noreferrer"
          >
            HF Space
          </a>
          <a
            className="rounded-full bg-citrus-charcoal px-4 py-2 text-white transition-colors hover:bg-citrus-pink"
            href="https://github.com/shibz792/citrus-ocr"
            target="_blank"
            rel="noreferrer"
          >
            Source
          </a>
        </nav>
      </div>
    </header>
  );
}
