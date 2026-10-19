import { StaffLoginForm } from "@/components/admin/auth-forms";

export const metadata = { title: "Sign in" };

export default function AdminLoginPage() {
  return (
    <>
      <h1 className="mb-1 text-2xl">Staff sign-in</h1>
      <p className="mb-5 text-sm text-muted">You&apos;ll also need the code from your authenticator app.</p>
      <StaffLoginForm />
    </>
  );
}
