import Link from "next/link";
export default function NotFound() {
  return <div className="flex-1 flex flex-col items-center justify-center gap-3 text-mute"><span>That page is not here.</span><Link href="/" className="btn btn-sec">Go Home</Link></div>;
}
