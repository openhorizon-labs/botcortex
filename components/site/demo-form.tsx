"use client";

import { useEffect, useState } from "react";
import Cal, { getCalApi } from "@calcom/embed-react";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Replace with the real Cal.com event slug when it exists. */
const CAL_LINK = "openhorizon-labs/demo-botcortex";

const FIELD =
  "w-full rounded-lg border border-border bg-background px-3.5 py-2.5 text-sm outline-none transition-colors duration-150 ease-standard placeholder:text-muted-foreground/70 focus:border-foreground/40";

export function DemoForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [robot, setRobot] = useState("");
  const [booking, setBooking] = useState(false);

  useEffect(() => {
    if (!booking) return;
    (async () => {
      const cal = await getCalApi();
      cal("ui", { theme: "light", hideEventTypeDetails: false });
    })();
  }, [booking]);

  if (booking) {
    return (
      <div className="overflow-hidden rounded-2xl border border-border bg-background">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <p className="text-sm text-muted-foreground">
            Booking as <span className="text-foreground">{name || "you"}</span>
            {company && ` · ${company}`}
          </p>
          <button
            type="button"
            onClick={() => setBooking(false)}
            className="text-sm text-muted-foreground transition-colors duration-150 ease-standard hover:text-foreground"
          >
            Edit details
          </button>
        </div>
        <Cal
          calLink={CAL_LINK}
          style={{ width: "100%", height: "580px" }}
          config={{
            name,
            email,
            notes: [company && `Company: ${company}`, robot && `Robot: ${robot}`]
              .filter(Boolean)
              .join(" — "),
          }}
        />
      </div>
    );
  }

  return (
    <form
      className="rounded-2xl border border-border bg-background p-6 sm:p-8"
      onSubmit={(e) => {
        e.preventDefault();
        setBooking(true);
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1.5 block text-sm text-foreground">Name</span>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Grace Hopper"
            className={FIELD}
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm text-foreground">Work email</span>
          <input
            required
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="grace@lab.edu"
            className={FIELD}
          />
        </label>
      </div>
      <label className="mt-4 block">
        <span className="mb-1.5 block text-sm text-foreground">Company or lab</span>
        <input
          value={company}
          onChange={(e) => setCompany(e.target.value)}
          placeholder="OpenHorizon Robotics Lab"
          className={FIELD}
        />
      </label>
      <label className="mt-4 block">
        <span className="mb-1.5 block text-sm text-foreground">
          What robot are you running?
        </span>
        <textarea
          value={robot}
          onChange={(e) => setRobot(e.target.value)}
          rows={3}
          placeholder="Two SO-101 arms on LeRobot — we want them sorting samples without writing a controller."
          className={FIELD}
        />
      </label>
      <Button
        type="submit"
        className="mt-6 h-11 w-full rounded-lg bg-foreground text-sm font-medium text-background hover:bg-foreground/90"
      >
        Pick a time
        <ArrowRight className="size-4" />
      </Button>
      <p className="mt-3 text-center text-xs text-muted-foreground">
        30 minutes, on a real robot — not slides.
      </p>
    </form>
  );
}
