import { useMemo } from "react";
import { useAction } from "convex/react";
import { makeFunctionReference } from "convex/server";
import LocalVoiceCheck from "../../src/components/dashboard/LocalVoiceCheck";
import type { ModelArgs, ModelReply } from "../convex/model";
import { ConvexVoiceClient } from "./client";

const modelRequest = makeFunctionReference<"action", ModelArgs, ModelReply>("laptopModel:request");

export default function HostedVoiceCheck({ embedded = false, ledgerEnabled = false, live = false }: {
  embedded?: boolean; ledgerEnabled?: boolean; live?: boolean;
}) {
  const run = useAction(modelRequest);
  const client = useMemo(() => new ConvexVoiceClient(run), [run]);
  return <LocalVoiceCheck embedded={embedded} ledgerEnabled={ledgerEnabled} live={live} transport={client} />;
}
