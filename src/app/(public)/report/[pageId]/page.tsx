import { ReportForm } from "./report-form";
import { getTurnstileClientConfig } from "@/lib/turnstile";

interface Props {
  params: Promise<{ pageId: string }>;
}

export default async function ReportPage({ params }: Props) {
  const { pageId } = await params;

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-sm">
        <h1 className="text-xl font-bold">Report a Page</h1>
        <p className="mt-2 text-sm text-gray-500">
          If you believe this page contains harmful or inappropriate content,
          please let us know.
        </p>
        <ReportForm pageId={pageId} turnstile={getTurnstileClientConfig()} />
      </div>
    </div>
  );
}
