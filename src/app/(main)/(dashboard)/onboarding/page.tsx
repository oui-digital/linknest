import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getUserWorkspace } from "@/lib/queries";
import { OnboardingForm } from "./onboarding-form";

export default async function OnboardingPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  // If user already has a workspace, skip onboarding
  const workspace = await getUserWorkspace(session.user.id);
  if (workspace) {
    redirect("/dashboard");
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold tracking-tight">
            Claim your link
          </h1>
          <p className="mt-2 text-sm text-gray-600">
            Choose a username for your LinkNest page. This will be your public
            URL.
          </p>
        </div>
        <OnboardingForm />
      </div>
    </main>
  );
}
