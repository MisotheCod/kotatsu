"use client";
// A cron session on a phone: the same reader, on its own page.
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { SessionReader } from "@/components/Crons";
import { Icon } from "@/components/Icon";

export default function SessionPage() {
  return <Suspense><Inner /></Suspense>;
}

function Inner() {
  const id = useSearchParams().get("id") ?? "";
  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <header className="safe-top shrink-0 flex items-center gap-1 px-2 pt-1 pb-2 border-b border-line bg-paper">
        <Link href="/crons" className="ib" aria-label="Back"><Icon name="left" size={22} /></Link>
        <span className="h text-[17px] font-semibold one flex-1 pr-2">Session</span>
      </header>
      <SessionReader id={id} phone />
    </div>
  );
}
