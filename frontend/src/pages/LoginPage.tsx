import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { ApiError } from "../lib/api";
import { Button } from "../components/ui/Button";
import { Alert } from "../components/ui/Alert";
import { Input } from "../components/ui/Input";
import { Spinner } from "../components/ui/Spinner";
import { BrandMark } from "../components/BrandMark";

export function LoginPage() {
  const { login, user } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user) navigate("/", { replace: true });
  }, [user, navigate]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email, password);
      navigate("/", { replace: true });
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Login failed");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative min-h-screen grid grid-cols-1 md:grid-cols-2">
      {/* LEFT — editorial masthead */}
      <section className="relative flex flex-col justify-between bg-paper px-8 py-10 sm:px-12 md:px-16 md:py-14 opacity-0 animate-ink-bleed">
        <div className="flex items-center justify-between">
          <BrandMark size={26} withSubtitle />
          <span className="hidden md:inline-block font-mono uppercase tracking-[0.18em] text-[9px] text-ink-fade">
            // VOL. I &mdash; INTERNAL
          </span>
        </div>

        <div className="my-14 md:my-0">
          <p className="mb-8 font-mono uppercase tracking-[0.22em] text-[10px] text-ink-fade">
            // VOL. I &mdash; INTERNAL TOOL
          </p>
          <h1 className="font-serif italic text-ink leading-[0.92] tracking-tight text-6xl sm:text-7xl">
            Excalidraw
            <br />
            <span className="text-ink-fade">
              a quiet place
              <br />
              to draw.
            </span>
          </h1>
          <div className="mt-10 flex items-center gap-3">
            <span
              aria-hidden="true"
              className="inline-block h-1.5 w-1.5 bg-gold shrink-0"
            />
            <div className="h-px flex-1 max-w-[240px] bg-rule" />
            <span className="font-mono uppercase tracking-[0.18em] text-[9px] text-ink-fade">
              // PRESS ENTER TO SIGN IN
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="inline-block h-1.5 w-1.5 bg-gold shrink-0"
          />
          <span className="font-mono uppercase tracking-[0.18em] text-[9px] text-ink-fade">
            // EXCALIDRAW &bull; ATELIER
          </span>
        </div>
      </section>

      {/* RIGHT — form */}
      <section
        className="relative flex items-center justify-center bg-paper-deep px-6 py-12 sm:px-10 md:px-16 border-t md:border-t-0 md:border-l border-rule opacity-0 animate-ink-bleed"
        style={{ animationDelay: "200ms" }}
      >
        <form
          onSubmit={onSubmit}
          className="w-full max-w-sm"
          autoComplete="on"
        >
          <p className="mb-3 font-mono uppercase tracking-[0.2em] text-[10px] text-ink-fade">
            // THE ENTRANCE
          </p>
          <h2 className="mb-8 font-serif italic text-4xl text-ink tracking-tight leading-none">
            Sign in.
          </h2>
          <div className="h-px w-full bg-rule mb-8" />

          <div className="space-y-7">
            <div>
              <label
                htmlFor="login-email"
                className="mb-1 block font-mono uppercase tracking-[0.16em] text-[10px] text-ink-fade"
              >
                // E-MAIL
              </label>
              <Input
                variant="editorial"
                id="login-email"
                type="email"
                autoComplete="email"
                required
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label
                htmlFor="login-password"
                className="mb-1 block font-mono uppercase tracking-[0.16em] text-[10px] text-ink-fade"
              >
                // PASSWORD
              </label>
              <Input
                variant="editorial"
                id="login-password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>

            {error && <Alert variant="destructive">{error}</Alert>}

            <Button
              type="submit"
              disabled={busy}
              size="lg"
              className="w-full"
            >
              {busy ? (
                <>
                  <Spinner /> Signing in
                </>
              ) : (
                <>Sign In &rarr;</>
              )}
            </Button>
          </div>

          <p className="mt-10 font-mono uppercase tracking-[0.16em] text-[9px] text-ink-fade">
            // MEMBERS ONLY &bull; ASK AN ADMIN FOR ACCESS
          </p>
        </form>
      </section>
    </div>
  );
}
