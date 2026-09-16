import type { ReactNode } from "react";
import { BrandCredits } from "./Brand";
import { ExperienceAtmosphere, ExperienceWordmark } from "./ExperienceChrome";

/** Entry and recovery states use the same room as the working application. */
export function AuthShell({
  children,
  busy = false,
}: {
  children: ReactNode;
  busy?: boolean;
}) {
  return (
    <main className="auth-screen" aria-busy={busy}>
      <ExperienceAtmosphere />
      <header>
        <ExperienceWordmark room="A DAW for YuE2" />
      </header>
      <section className="auth-content">{children}</section>
      <footer>
        <BrandCredits />
      </footer>
    </main>
  );
}
