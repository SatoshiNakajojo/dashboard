import { createFileRoute } from "@tanstack/react-router";
import { AccessGate } from "@/components/desk/access-gate";
import { Cockpit } from "@/components/desk/cockpit";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return (
    <AccessGate>
      <Cockpit />
    </AccessGate>
  );
}
