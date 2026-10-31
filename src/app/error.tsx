"use client";

import { LoadError } from "@/components/load-error";

export default function ErrorPage({ error }: { error: Error & { digest?: string } }) {
  return <LoadError error={error} />;
}
