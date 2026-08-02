"use client";

import { useEffect } from "react";
import Cal, { getCalApi } from "@calcom/embed-react";

const CAL_LINK = "openhorizon-labs/demo-botcortex";

/** Big inline Cal.com booker — no pre-form, no questions from us. */
export function DemoCal() {
  useEffect(() => {
    (async () => {
      const cal = await getCalApi();
      cal("ui", { theme: "light", layout: "month_view", hideEventTypeDetails: false });
    })();
  }, []);

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-background p-2 sm:p-4">
      <Cal calLink={CAL_LINK} style={{ width: "100%", height: "760px" }} />
    </div>
  );
}
