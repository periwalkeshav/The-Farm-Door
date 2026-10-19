/**
 * Creates a staff account from the command line, e.g. the first owner on the
 * live site:
 *
 *   npm run staff:create -- --email you@thefarmdoor.com --name "Your Name" --role OWNER
 *
 * Prints a one-time temporary password. 2-step verification is set up at first sign-in.
 */
import { getDb } from "@/db";
import { createStaff } from "@/server/staff-admin";

function arg(name: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

async function main() {
  const email = arg("email");
  const name = arg("name");
  const role = (arg("role") ?? "OWNER").toUpperCase();
  if (!email || !name || !["OWNER", "MANAGER", "PACKER", "ACCOUNTANT"].includes(role)) {
    console.error('Usage: npm run staff:create -- --email you@example.com --name "Your Name" [--role OWNER|MANAGER|PACKER|ACCOUNTANT]');
    process.exit(1);
  }
  const { password } = await createStaff(getDb(), { email, name, role: role as "OWNER" }, null);
  console.log(`\nCreated ${role} account for ${email}.`);
  console.log(`Temporary password (shown once): ${password}`);
  console.log("Sign in at /admin/login, set up 2-step verification, then change the password under My account.\n");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
