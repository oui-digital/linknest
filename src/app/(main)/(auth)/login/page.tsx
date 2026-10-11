import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { AuthForm } from "@/components/auth/auth-form";
import { getTurnstileClientConfig } from "@/lib/turnstile";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ verified?: string; error?: string; reason?: string }>;
}) {
  const session = await auth();
  if (session?.user) {
    redirect("/dashboard");
  }

  const params = await searchParams;
  const errorMessage = loginErrorMessage(params.error, params.reason);

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold tracking-tight">Welcome back</h1>
          <p className="mt-2 text-sm text-gray-600">
            Sign in to your LinkNest account
          </p>
        </div>
        {params.verified === "true" && (
          <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-center">
            <p className="text-sm font-medium text-green-800">
              Email verified! You can now sign in.
            </p>
          </div>
        )}
        {errorMessage && (
          <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-center">
            <p className="text-sm font-medium text-red-800">{errorMessage}</p>
          </div>
        )}
        <AuthForm mode="login" turnstile={getTurnstileClientConfig()} />
      </div>
    </main>
  );
}

/**
 * Messages for ?error= on the login page. Besides this app's own codes,
 * Auth.js redirects here (pages.error) with its own codes, e.g. AccessDenied
 * or Configuration when a sign-in was refused or failed.
 */
function loginErrorMessage(error?: string, reason?: string): string | null {
  switch (error) {
    case undefined:
      return null;
    case "expired-token":
      return "Verification link expired. Please try again.";
    case "invalid-token":
      return "Invalid verification link.";
    case "identity-conflict":
      return "This mailbox already has a LinkNest account under another form of the address. Sign in with the address you used originally.";
    case "signup_blocked":
      if (reason === "disposable_domain") {
        return "Please sign up with a permanent email address.";
      }
      if (reason === "rate_limited") {
        return "Too many new accounts from your network. Please try again later.";
      }
      if (reason === "duplicate_identity") {
        return "An account already exists for this email address. Sign in with the method you used before.";
      }
      return "We couldn't create an account. Please try another method.";
    case "OAuthAccountNotLinked":
      return "This email is already registered. Sign in with the method you used before.";
    default:
      return "Sign-in failed. Please try again, or use the method you signed up with.";
  }
}
