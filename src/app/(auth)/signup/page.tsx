import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { AuthForm } from "@/components/auth/auth-form";
import { getTurnstileClientConfig } from "@/lib/turnstile";

export default async function SignupPage() {
  const session = await auth();
  if (session?.user) {
    redirect("/dashboard");
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold tracking-tight">
            Create your LinkNest
          </h1>
          <p className="mt-2 text-sm text-gray-600">
            Get your link-in-bio page in under 5 minutes
          </p>
        </div>
        <AuthForm mode="signup" turnstile={getTurnstileClientConfig()} />
      </div>
    </main>
  );
}
