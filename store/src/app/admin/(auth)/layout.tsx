import { Logo } from "@/components/ui";

export default function AdminAuthLayout({ children }: LayoutProps<"/admin">) {
  return (
    <div className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-between">
          <Logo />
          <span className="rounded-full bg-forest px-2.5 py-1 text-xs font-bold text-ivory">Admin</span>
        </div>
        <div className="card p-6">{children}</div>
      </div>
    </div>
  );
}
