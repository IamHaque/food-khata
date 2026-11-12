import * as React from "react";
import { PageHeader } from "@/components/ui/page-header";

/** Title, optional back link and content for a signed-in page; always rendered inside the app shell. */
export function AppPage({ title, subtitle, back, children, wide }: {
  title: string;
  subtitle?: string;
  back?: { to: string; label: string };
  children?: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={`${wide ? "max-w-4xl" : "max-w-2xl"} space-y-5`}>
      <PageHeader title={title} description={subtitle} back={back} />
      {children}
    </div>
  );
}
