"use client";

import { LoadError } from "@/components/load-error";
import "./globals.css";

export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  return (
    <html lang="zh-Hant">
      <body className="font-sans text-ink">
        <LoadError error={error} />
      </body>
    </html>
  );
}
