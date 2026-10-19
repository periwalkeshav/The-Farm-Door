export default function AdminPrintLayout({ children }: LayoutProps<"/admin">) {
  return <div className="min-h-dvh bg-[#e9e6df] py-6 print:bg-white print:py-0">{children}</div>;
}
