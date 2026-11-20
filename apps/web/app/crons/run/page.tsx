"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Icon } from "@/components/Icon";
import { RunReader } from "@/components/Crons";

export default function RunPage() {
  return <Suspense><Run /></Suspense>;
}

function Run() {
  const id = useSearchParams().get("id") ?? "";
  return (
    <>
      <header className="safe-top shrink-0 flex items-center px-2 pt-1 pb-1.5"><Link href="/crons" className="ib" aria-label="Back"><Icon name="left" size={22} /></Link></header>
      {/* On desktop this page is not used; the list links to /crons?run= instead. */}
      <RunReader id={id} phone />
    </>
  );
}
